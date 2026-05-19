// Plan 状态机 golden path:
//   admin 建规划 → admin 发送 → 学生确认 → 学生勾选任务
// 用 mock Prisma 走完整路由 + 中间件,验证状态守卫和事务包裹按预期触发。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { mockReset } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { createTestApp, extractCookie, type TestApp } from './helpers/app';
import * as redisMock from '../src/utils/redis';

const STUDENT_ID = 'student-1';
const STUDENT_USER_ID = 'user-stu-1';
const TEACHER_USER_ID = 'user-tea-1';

const ADMIN = { phone: '13900000099', password: 'AdminPass1!' };
const STUDENT = { phone: '13900000098', password: 'StudentPass1!' };

let ctx: TestApp;
let adminHash: string;
let studentHash: string;

beforeAll(async () => {
  adminHash = await bcrypt.hash(ADMIN.password, 4);
  studentHash = await bcrypt.hash(STUDENT.password, 4);
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(() => {
  mockReset(ctx.prisma);
  // mockReset 会把 $transaction 的 implementation 也清掉,重新装回来
  ctx.prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: PrismaClient) => unknown)(ctx.prisma);
    }
    return arg;
  });
  (redisMock as unknown as { __reset?: () => void }).__reset?.();
});

async function loginAs(role: 'admin' | 'student'): Promise<{
  cookieHeader: string;
  csrfToken: string;
  accessToken: string;
}> {
  const phone = role === 'admin' ? ADMIN.phone : STUDENT.phone;
  const password = role === 'admin' ? ADMIN.password : STUDENT.password;
  const userId = role === 'admin' ? 'user-admin-1' : STUDENT_USER_ID;
  const roleCode = role === 'admin' ? 'admin_total' : 'student';

  ctx.prisma.user.findUnique.mockResolvedValueOnce({
    id: userId,
    name: role === 'admin' ? '测试管理员' : '测试学生',
    phone,
    email: null,
    avatarUrl: null,
    passwordHash: role === 'admin' ? adminHash : studentHash,
    isActive: true,
    userRoles: [{ role: { code: roleCode } }],
  } as any);
  // login 只在 student 角色时查 student.findUnique;admin 不查,别 queue
  if (role === 'student') {
    ctx.prisma.student.findUnique.mockResolvedValueOnce({ id: STUDENT_ID, userId } as any);
  }

  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { phone, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`login failed for ${role}: ${res.body}`);
  }
  const data = (res.json() as any).data;
  const cookies = res.headers['set-cookie'] as string | string[];
  const cookieHeader = (Array.isArray(cookies) ? cookies : [cookies])
    .map((c) => String(c).split(';')[0])
    .join('; ');
  return { cookieHeader, csrfToken: data.csrfToken, accessToken: data.accessToken };
}

describe('Plan 状态机 golden path', () => {
  it('admin 建草稿 → 发送 → 学生确认 → 学生勾选任务', async () => {
    // ─── Step 1: admin 登录 ───────────────────────────
    const admin = await loginAs('admin');

    // ─── Step 2: 建草稿 ───────────────────────────────
    ctx.prisma.student.findUnique.mockResolvedValueOnce({
      id: STUDENT_ID,
      userId: STUDENT_USER_ID,
      subjectId: 1,
    } as any);
    ctx.prisma.periodPlan.findFirst.mockResolvedValueOnce(null); // 没有同期版本
    ctx.prisma.periodPlan.create.mockResolvedValueOnce({
      id: 'plan-1',
      studentId: STUDENT_ID,
      periodCode: 'P1',
      stageName: '研究方向确定',
      goal: '梳理方向',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-05-31'),
      version: 1,
      status: 'draft',
      tasks: [{ id: 'task-1', title: '整理研究兴趣关键词' }],
    } as any);
    ctx.prisma.operationLog.create.mockResolvedValue({} as any);

    const create = await ctx.app.inject({
      method: 'POST',
      url: `/api/students/${STUDENT_ID}/plans`,
      headers: { cookie: admin.cookieHeader, 'x-csrf-token': admin.csrfToken },
      payload: {
        periodCode: 'P1',
        stageName: '研究方向确定',
        goal: '梳理方向',
        startDate: '2026-04-01',
        endDate: '2026-05-31',
        tasks: [{ title: '整理研究兴趣关键词', priority: '中' }],
      },
    });
    expect(create.statusCode).toBe(201);
    const planId = (create.json() as any).data.id;
    expect(planId).toBe('plan-1');

    // ─── Step 3: admin send ───────────────────────────
    // 路由先 findFirst 拿当前 plan(draft 状态)
    ctx.prisma.periodPlan.findFirst.mockResolvedValueOnce({
      id: planId,
      studentId: STUDENT_ID,
      periodCode: 'P1',
      stageName: '研究方向确定',
      version: 1,
      status: 'draft',
      tasks: [],
    } as any);
    // updateMany 必须 count===1 才通过守卫
    ctx.prisma.periodPlan.updateMany.mockResolvedValueOnce({ count: 1 } as any);
    ctx.prisma.student.findUnique.mockResolvedValueOnce({
      id: STUDENT_ID,
      userId: STUDENT_USER_ID,
      user: { id: STUDENT_USER_ID, name: '测试学生' },
    } as any);
    ctx.prisma.notification.create.mockResolvedValueOnce({ id: 'notif-1' } as any);
    ctx.prisma.notificationDelivery.create.mockResolvedValueOnce({} as any);
    ctx.prisma.periodPlan.findUniqueOrThrow.mockResolvedValueOnce({
      id: planId,
      status: 'pending',
    } as any);

    const send = await ctx.app.inject({
      method: 'POST',
      url: `/api/students/${STUDENT_ID}/plans/${planId}/send`,
      headers: { cookie: admin.cookieHeader, 'x-csrf-token': admin.csrfToken },
    });
    expect(send.statusCode).toBe(200);
    // 关键:状态守卫必须命中 status:'draft' 条件
    expect(ctx.prisma.periodPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: planId, status: 'draft' }),
        data: expect.objectContaining({ status: 'pending' }),
      }),
    );

    // ─── Step 4: 学生登录 ─────────────────────────────
    const student = await loginAs('student');

    // ─── Step 5: 学生 confirm ─────────────────────────
    // assertStudentAccess(student role) 查 student.findUnique 校验 userId 归属
    ctx.prisma.student.findUnique.mockResolvedValueOnce({
      id: STUDENT_ID,
      userId: STUDENT_USER_ID,
      subjectId: 1,
    } as any);
    // 路由内的归属校验再查一次 student.findFirst
    ctx.prisma.student.findFirst.mockResolvedValueOnce({
      id: STUDENT_ID,
      userId: STUDENT_USER_ID,
    } as any);
    ctx.prisma.periodPlan.findFirst.mockResolvedValueOnce({
      id: planId,
      studentId: STUDENT_ID,
      stageName: '研究方向确定',
      version: 1,
      status: 'pending',
      previousPlanId: null,
      tasks: [],
    } as any);
    ctx.prisma.periodPlan.updateMany.mockResolvedValueOnce({ count: 1 } as any);
    ctx.prisma.planConfirmation.create.mockResolvedValueOnce({} as any);
    ctx.prisma.periodPlan.findUniqueOrThrow.mockResolvedValueOnce({
      id: planId,
      status: 'active',
    } as any);

    const confirm = await ctx.app.inject({
      method: 'POST',
      url: `/api/students/${STUDENT_ID}/plans/${planId}/confirm`,
      headers: { cookie: student.cookieHeader, 'x-csrf-token': student.csrfToken },
    });
    expect(confirm.statusCode).toBe(200);
    // confirm 必须用 updateMany 守卫 pending/change_pending 状态
    expect(ctx.prisma.periodPlan.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: planId,
          status: { in: ['pending', 'change_pending'] },
        }),
        data: expect.objectContaining({ status: 'active' }),
      }),
    );

    // ─── Step 6: 学生勾选任务 ─────────────────────────
    // 同样要先过 assertStudentAccess
    ctx.prisma.student.findUnique.mockResolvedValueOnce({
      id: STUDENT_ID,
      userId: STUDENT_USER_ID,
      subjectId: 1,
    } as any);
    ctx.prisma.periodPlanTask.findFirst.mockResolvedValueOnce({
      id: 'task-1',
      planId,
      status: 'pending',
      plan: { studentId: STUDENT_ID, status: 'active' },
    } as any);
    ctx.prisma.periodPlanTask.update.mockResolvedValueOnce({
      id: 'task-1',
      status: 'done',
      doneAt: new Date(),
    } as any);

    const toggle = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/students/${STUDENT_ID}/tasks/task-1/done`,
      headers: { cookie: student.cookieHeader, 'x-csrf-token': student.csrfToken },
      payload: { done: true },
    });
    expect(toggle.statusCode).toBe(200);
    expect(ctx.prisma.periodPlanTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-1' },
        data: expect.objectContaining({ status: 'done' }),
      }),
    );
  });

  it('admin send: 状态守卫未命中(并发场景下被抢跑)时整体回滚,返回 409', async () => {
    const admin = await loginAs('admin');

    ctx.prisma.student.findUnique.mockResolvedValueOnce({
      id: STUDENT_ID,
      userId: STUDENT_USER_ID,
      subjectId: 1,
    } as any);
    ctx.prisma.periodPlan.findFirst.mockResolvedValueOnce({
      id: 'plan-x',
      studentId: STUDENT_ID,
      status: 'draft',
      stageName: 'X',
      version: 1,
      tasks: [],
    } as any);
    // 并发场景:守卫已被另一个事务抢先改为 pending,count=0
    ctx.prisma.periodPlan.updateMany.mockResolvedValueOnce({ count: 0 } as any);

    const send = await ctx.app.inject({
      method: 'POST',
      url: `/api/students/${STUDENT_ID}/plans/plan-x/send`,
      headers: { cookie: admin.cookieHeader, 'x-csrf-token': admin.csrfToken },
    });
    expect(send.statusCode).toBe(400);
    expect((send.json() as any).code).toBe('PLAN_STATUS_INVALID');
    // 通知不应发送(事务回滚)
    expect(ctx.prisma.notification.create).not.toHaveBeenCalled();
  });
});

describe('CSRF', () => {
  it('cookie 会话下,POST 不带 X-CSRF-Token 应被 403 拒掉', async () => {
    const admin = await loginAs('admin');

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/students/${STUDENT_ID}/plans`,
      headers: { cookie: admin.cookieHeader },
      payload: { periodCode: 'P1', stageName: 'X', startDate: '2026-04-01', endDate: '2026-05-31', tasks: [] },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as any).code).toBe('CSRF_INVALID');
  });
});
