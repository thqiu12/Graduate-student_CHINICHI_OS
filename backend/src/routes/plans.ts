// src/routes/plans.ts
// 知日塾大学院考学进度管理系统 - 规划闭环路由
// 实现完整的规划生命周期：草稿→发送→确认/异议→变更
// 所有状态变更均写入 operation_logs

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, createError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';
import { PlanStatus, Prisma } from '@prisma/client';
import { assertStudentAccess } from '../utils/access-control';
import { createInAppNotification } from '../utils/notifications';

// ─── 请求体 Schema ───────────────────────────────────────
const createPlanSchema = z.object({
  periodCode: z.string().min(1, '阶段编码不能为空'),
  stageName: z.string().min(1, '阶段名称不能为空'),
  goal: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        dueDate: z.string().optional(),
        dueTime: z.string().optional(),
        priority: z.enum(['高', '中', '低']).default('中'),
        repeatType: z.enum(['once', 'daily', 'weekly']).default('once'),
        sortOrder: z.number().int().default(0),
      }),
    )
    .optional()
    .default([]),
});

const rejectPlanSchema = z.object({
  content: z.string().min(1, '异议内容不能为空'),
});

const changePlanSchema = z.object({
  changeReason: z.string().min(1, '变更原因不能为空'),
  stageName: z.string().optional(),
  goal: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const toggleTaskSchema = z.object({
  done: z.boolean(),
  doneNote: z.string().optional(),
});

type CreatePlanBody = z.infer<typeof createPlanSchema>;
type RejectPlanBody = z.infer<typeof rejectPlanSchema>;
type ChangePlanBody = z.infer<typeof changePlanSchema>;
type PlanWithTasks = Prisma.PeriodPlanGetPayload<{ include: { tasks: true } }>;
type TaskDiff = {
  type: 'added' | 'removed' | 'updated';
  title: string;
  changes?: Array<{ field: string; label: string; oldValue: string | null; newValue: string | null }>;
};

interface StudentParams {
  studentId: string;
}

interface PlanParams extends StudentParams {
  planId: string;
}

// 事务客户端类型：兼容 prisma 与 $transaction 回调里的 tx
type Tx = Prisma.TransactionClient;
type Db = FastifyInstance['prisma'] | Tx;

/**
 * 在事务里执行 fn，捕获 Prisma P2002（唯一约束冲突）后重试。
 * 用于 PeriodPlan.version 的并发分配 —— 两个请求同时读到相同 max(version)
 * 时只有一个能 INSERT 成功，另一个 P2002 抛错；fn 内部应当在每次重试时
 * 重新查 max(version)+1，从而拿到下一个可用版本号。
 */
async function withVersionRetry<T>(
  fastify: FastifyInstance,
  fn: (tx: Tx) => Promise<T>,
  ctx: { studentId: string; periodCode?: string },
  maxAttempts = 5,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fastify.prisma.$transaction(fn);
    } catch (err) {
      lastErr = err;
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < maxAttempts
      ) {
        fastify.log.warn({ ...ctx, attempt }, '规划版本号并发冲突，重试');
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new AppError(
    ErrorCode.VALIDATION_ERROR,
    '规划版本分配冲突，请稍后重试',
  );
}

// ─── 辅助函数：写入操作日志（支持 tx 客户端）──────────────
async function writeOperationLog(
  db: Db,
  options: {
    studentId: string;
    actorId: string;
    actorName: string;
    actionType: string;
    targetType?: string;
    targetId?: string;
    detail?: any;
  },
): Promise<void> {
  await db.operationLog.create({
    data: {
      studentId: options.studentId,
      actorId: options.actorId,
      actorName: options.actorName,
      actionType: options.actionType,
      targetType: options.targetType,
      targetId: options.targetId,
      detail: (options.detail ?? {}) as any,
    },
  });
}

async function ensureNoPendingPlanChange(
  db: Db,
  studentId: string,
  sourcePlanId: string,
): Promise<void> {
  const pendingPlan = await db.periodPlan.findFirst({
    where: {
      studentId,
      previousPlanId: sourcePlanId,
      status: PlanStatus.change_pending,
    },
  });

  if (pendingPlan) {
    throw new AppError(
      ErrorCode.PLAN_CANNOT_CONFIRM,
      '该阶段已有待确认的规划变更，请先等待学生确认或处理后再继续修改',
      409,
    );
  }
}

function taskCreateData(
  task: PlanWithTasks['tasks'][number],
  overrides: Partial<PlanWithTasks['tasks'][number]> = {},
) {
  const next = { ...task, ...overrides };
  return {
    title: next.title,
    description: next.description ?? undefined,
    dueDate: next.dueDate ?? undefined,
    dueTime: next.dueTime ?? undefined,
    priority: next.priority,
    repeatType: next.repeatType,
    sortOrder: next.sortOrder,
    status: next.status,
    doneAt: next.doneAt ?? undefined,
    doneNote: next.doneNote ?? undefined,
  };
}

function comparePlanTasks(
  previousTasks: PlanWithTasks['tasks'],
  currentTasks: PlanWithTasks['tasks'],
): TaskDiff[] {
  const normalize = (title: string) => title.trim().toLowerCase();
  const previousByTitle = new Map(previousTasks.map((task) => [normalize(task.title), task]));
  const currentByTitle = new Map(currentTasks.map((task) => [normalize(task.title), task]));
  const diffs: TaskDiff[] = [];

  for (const task of currentTasks) {
    const oldTask = previousByTitle.get(normalize(task.title));
    if (!oldTask) {
      diffs.push({ type: 'added', title: task.title });
      continue;
    }

    const changes: TaskDiff['changes'] = [];
    const compare = (field: string, label: string, oldVal: unknown, newVal: unknown) => {
      const oldValue = oldVal !== null && oldVal !== undefined ? String(oldVal) : null;
      const newValue = newVal !== null && newVal !== undefined ? String(newVal) : null;
      if (oldValue !== newValue) changes.push({ field, label, oldValue, newValue });
    };

    compare('description', '说明', oldTask.description, task.description);
    compare('dueDate', '截止日期', oldTask.dueDate?.toISOString().slice(0, 10), task.dueDate?.toISOString().slice(0, 10));
    compare('priority', '优先级', oldTask.priority, task.priority);
    compare('repeatType', '重复类型', oldTask.repeatType, task.repeatType);
    compare('sortOrder', '排序', oldTask.sortOrder, task.sortOrder);

    if (changes.length > 0) {
      diffs.push({ type: 'updated', title: task.title, changes });
    }
  }

  for (const task of previousTasks) {
    if (!currentByTitle.has(normalize(task.title))) {
      diffs.push({ type: 'removed', title: task.title });
    }
  }

  return diffs;
}

async function createTaskChangePlan(
  fastify: FastifyInstance,
  options: {
    studentId: string;
    sourcePlan: PlanWithTasks;
    user: JwtPayload;
    changeReason: string;
    tasks: ReturnType<typeof taskCreateData>[];
    detail: Prisma.InputJsonValue;
  },
) {
  const { studentId, sourcePlan, user, changeReason, tasks, detail } = options;

  // 把"查重 → 取最新版本号 → 创建 change_pending → 通知 → 写日志"
  // 全部放进同一事务，避免任一步骤失败造成状态/通知/审计不一致。
  // 用 withVersionRetry 包一层：READ COMMITTED 下两个并发请求可能同时读到
  // 相同 max(version)，让 INSERT 时唯一约束(@@unique studentId+periodCode+version)
  // 直接拒绝其中一方，捕获 P2002 后重试，每次重试都重读 max(version)。
  // 残余风险：ensureNoPendingPlanChange 仍可能让两个并发请求都通过；
  // 推荐在 (previousPlanId) where status='change_pending' 上加部分唯一索引彻底消除（需迁移）。
  return withVersionRetry(fastify, async (tx) => {
    await ensureNoPendingPlanChange(tx, studentId, sourcePlan.id);

    const latestPlan = await tx.periodPlan.findFirst({
      where: { studentId, periodCode: sourcePlan.periodCode },
      orderBy: { version: 'desc' },
    });
    const newVersion = (latestPlan?.version ?? sourcePlan.version) + 1;

    const newPlan = await tx.periodPlan.create({
      data: {
        studentId,
        periodCode: sourcePlan.periodCode,
        stageName: sourcePlan.stageName,
        goal: sourcePlan.goal,
        startDate: sourcePlan.startDate,
        endDate: sourcePlan.endDate,
        version: newVersion,
        status: PlanStatus.change_pending,
        changeReason,
        previousPlanId: sourcePlan.id,
        createdBy: user.sub,
        tasks: { create: tasks },
      },
      include: { tasks: true },
    });

    const studentRecord = await tx.student.findUnique({
      where: { id: studentId },
    });

    if (studentRecord) {
      await createInAppNotification(tx, {
        userId: studentRecord.userId,
        type: 'plan_change_pending',
        title: '规划任务已更新，需要重新确认',
        content: `班主任对「${sourcePlan.stageName}」规划任务进行了调整，请查看变更内容并确认。`,
        relatedId: newPlan.id,
      });
    }

    await writeOperationLog(tx, {
      studentId,
      actorId: user.sub,
      actorName: user.name,
      actionType: 'plan_task_change',
      targetType: 'period_plan',
      targetId: newPlan.id,
      detail,
    });

    return newPlan;
  }, { studentId, periodCode: sourcePlan.periodCode });
}

// ─── 路由注册函数 ─────────────────────────────────────────
export async function planRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/students/:studentId/plans - 获取学生所有阶段规划
  fastify.get<{ Params: StudentParams }>(
    '/students/:studentId/plans',
    {
      preHandler: [
        authenticate,
        authorize([
          Roles.ADMIN_TOTAL,
          Roles.SUBJECT_HEAD,
          Roles.TEACHER,
          Roles.STUDENT,
        ]),
      ],
    },
    async (
      request: FastifyRequest<{ Params: StudentParams }>,
      reply: FastifyReply,
    ) => {
      const { studentId } = request.params;
      const user = request.user as JwtPayload;

      await assertStudentAccess(fastify, user, studentId);

      const plans = await fastify.prisma.periodPlan.findMany({
        where: { studentId },
        include: {
          tasks: { orderBy: { sortOrder: 'asc' } },
          createdByUser: { select: { id: true, name: true } },
          confirmedByUser: { select: { id: true, name: true } },
          confirmations: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
        orderBy: [{ periodCode: 'asc' }, { version: 'desc' }],
      });

      const visiblePlans = user.roles.includes(Roles.STUDENT)
        ? plans.map((plan) => ({
            ...plan,
            tasks: plan.status === PlanStatus.active ? plan.tasks : [],
          }))
        : plans;

      return reply.send({ data: visiblePlans });
    },
  );

  // POST /api/students/:studentId/plans - 创建新规划（草稿）
  fastify.post<{ Params: StudentParams; Body: CreatePlanBody }>(
    '/students/:studentId/plans',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER]),
      ],
    },
    async (
      request: FastifyRequest<{ Params: StudentParams; Body: CreatePlanBody }>,
      reply: FastifyReply,
    ) => {
      const { studentId } = request.params;
      const user = request.user as JwtPayload;
      await assertStudentAccess(fastify, user, studentId);

      // 验证请求体
      const parsed = createPlanSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '请求参数错误', parsed.error.flatten());
      }
      const body = parsed.data;

      // 检查学生是否存在
      const student = await fastify.prisma.student.findUnique({
        where: { id: studentId },
      });
      if (!student) {
        throw createError.studentNotFound(studentId);
      }

      // 在事务里分配版本号 + 创建 + 写日志，并对 P2002 自动重试。
      // 避免两个并发 create 都读到相同 max(version) 然后 INSERT 撞 unique 约束。
      const plan = await withVersionRetry(fastify, async (tx) => {
        const existingPlan = await tx.periodPlan.findFirst({
          where: { studentId, periodCode: body.periodCode },
          orderBy: { version: 'desc' },
        });
        const newVersion = (existingPlan?.version ?? 0) + 1;

        const created = await tx.periodPlan.create({
          data: {
            studentId,
            periodCode: body.periodCode,
            stageName: body.stageName,
            goal: body.goal,
            startDate: new Date(body.startDate),
            endDate: new Date(body.endDate),
            version: newVersion,
            status: PlanStatus.draft,
            createdBy: user.sub,
            tasks: {
              create: body.tasks.map((t, idx) => ({
                title: t.title,
                description: t.description,
                dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
                dueTime: t.dueTime,
                priority: t.priority,
                repeatType: t.repeatType,
                sortOrder: t.sortOrder ?? idx,
              })),
            },
          },
          include: { tasks: true },
        });

        await writeOperationLog(tx, {
          studentId,
          actorId: user.sub,
          actorName: user.name,
          actionType: 'plan_create',
          targetType: 'period_plan',
          targetId: created.id,
          detail: {
            periodCode: created.periodCode,
            stageName: created.stageName,
            startDate: created.startDate,
            endDate: created.endDate,
            taskCount: body.tasks.length,
            version: newVersion,
          } as unknown as Prisma.InputJsonValue,
        });

        return created;
      }, { studentId, periodCode: body.periodCode });

      return reply.status(201).send({ data: plan });
    },
  );

  // POST /api/students/:studentId/plans/:planId/send - 发送给学生确认
  fastify.post<{ Params: PlanParams }>(
    '/students/:studentId/plans/:planId/send',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER]),
      ],
    },
    async (
      request: FastifyRequest<{ Params: PlanParams }>,
      reply: FastifyReply,
    ) => {
      const { studentId, planId } = request.params;
      const user = request.user as JwtPayload;
      await assertStudentAccess(fastify, user, studentId);

      const plan = await fastify.prisma.periodPlan.findFirst({
        where: { id: planId, studentId },
        include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      });

      if (!plan) {
        throw createError.notFound('规划', planId);
      }

      if (plan.status !== PlanStatus.draft) {
        throw createError.planStatus(plan.status, 'draft');
      }

      // 状态变更、通知、操作日志放进同一事务,任一失败整体回滚;
      // 状态使用 updateMany + 当前状态守卫,防止并发 send 同时通过非原子的 read-check-update 串入。
      const sentAt = new Date();
      const updatedPlan = await fastify.prisma.$transaction(async (tx) => {
        const result = await tx.periodPlan.updateMany({
          where: { id: planId, status: PlanStatus.draft },
          data: { status: PlanStatus.pending, sentAt },
        });
        if (result.count !== 1) {
          throw createError.planStatus(plan.status, 'draft');
        }

        const studentUser = await tx.student.findUnique({
          where: { id: studentId },
          include: { user: true },
        });

        if (studentUser) {
          await createInAppNotification(tx, {
            userId: studentUser.userId,
            type: 'plan_pending',
            title: '新阶段规划待确认',
            content: `班主任为你制定了「${plan.stageName}」的阶段规划，请查看并确认。`,
            relatedId: planId,
          });
        }

        await writeOperationLog(tx, {
          studentId,
          actorId: user.sub,
          actorName: user.name,
          actionType: 'plan_send',
          targetType: 'period_plan',
          targetId: planId,
          detail: {
            planVersion: plan.version,
            stageName: plan.stageName,
            sentAt,
          } as unknown as Prisma.InputJsonValue,
        });

        return tx.periodPlan.findUniqueOrThrow({ where: { id: planId } });
      });

      return reply.send({ data: updatedPlan, message: '规划已发送给学生确认' });
    },
  );

  // POST /api/students/:studentId/plans/:planId/confirm - 学生确认规划 → status: active
  fastify.post<{ Params: PlanParams }>(
    '/students/:studentId/plans/:planId/confirm',
    {
      preHandler: [authenticate, authorize([Roles.STUDENT])],
    },
    async (
      request: FastifyRequest<{ Params: PlanParams }>,
      reply: FastifyReply,
    ) => {
      const { studentId, planId } = request.params;
      const user = request.user as JwtPayload;
      await assertStudentAccess(fastify, user, studentId);

      // 验证学生身份
      const student = await fastify.prisma.student.findFirst({
        where: { id: studentId, userId: user.sub },
      });
      if (!student) {
        throw createError.forbidden('只能确认自己的规划');
      }

      const plan = await fastify.prisma.periodPlan.findFirst({
        where: { id: planId, studentId },
        include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      });

      if (!plan) {
        throw createError.notFound('规划', planId);
      }

      // 只有 pending 或 change_pending 状态可以确认
      if (
        plan.status !== PlanStatus.pending &&
        plan.status !== PlanStatus.change_pending
      ) {
        throw new AppError(
          ErrorCode.PLAN_CANNOT_CONFIRM,
          `当前规划状态（${plan.status}）不支持确认操作`,
        );
      }

      const now = new Date();

      const updatedPlan = await fastify.prisma.$transaction(async (tx) => {
        if (plan.previousPlanId) {
          await tx.periodPlan.updateMany({
            where: {
              id: plan.previousPlanId,
              studentId,
              status: PlanStatus.active,
            },
            data: { status: PlanStatus.cancelled },
          });
        }

        // 用 updateMany + 当前合法状态守卫,防止并发 confirm/reject 抢跑后被重复"确认"
        const confirmResult = await tx.periodPlan.updateMany({
          where: {
            id: planId,
            status: { in: [PlanStatus.pending, PlanStatus.change_pending] },
          },
          data: {
            status: PlanStatus.active,
            confirmedAt: now,
            confirmedBy: user.sub,
          },
        });
        if (confirmResult.count !== 1) {
          throw new AppError(
            ErrorCode.PLAN_CANNOT_CONFIRM,
            '规划状态已发生变化，请刷新后重试',
          );
        }

        await tx.planConfirmation.create({
          data: {
            planId,
            action: 'confirm',
            actorId: user.sub,
            content: '学生确认接受规划',
          },
        });

        await writeOperationLog(tx, {
          studentId,
          actorId: user.sub,
          actorName: user.name,
          actionType: 'plan_confirm',
          targetType: 'period_plan',
          targetId: planId,
          detail: {
            planVersion: plan.version,
            stageName: plan.stageName,
            confirmedAt: now,
          } as unknown as Prisma.InputJsonValue,
        });

        return tx.periodPlan.findUniqueOrThrow({ where: { id: planId } });
      });

      return reply.send({ data: updatedPlan, message: '规划已确认，开始执行！' });
    },
  );

  // POST /api/students/:studentId/plans/:planId/reject - 学生提出异议
  fastify.post<{ Params: PlanParams; Body: RejectPlanBody }>(
    '/students/:studentId/plans/:planId/reject',
    {
      preHandler: [authenticate, authorize([Roles.STUDENT])],
    },
    async (
      request: FastifyRequest<{ Params: PlanParams; Body: RejectPlanBody }>,
      reply: FastifyReply,
    ) => {
      const { studentId, planId } = request.params;
      const user = request.user as JwtPayload;
      await assertStudentAccess(fastify, user, studentId);

      const parsed = rejectPlanSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '异议内容不能为空', parsed.error.flatten());
      }

      // 验证学生身份
      const student = await fastify.prisma.student.findFirst({
        where: { id: studentId, userId: user.sub },
      });
      if (!student) {
        throw createError.forbidden('只能对自己的规划提出异议');
      }

      const plan = await fastify.prisma.periodPlan.findFirst({
        where: { id: planId, studentId },
      });

      if (!plan) {
        throw createError.notFound('规划', planId);
      }

      if (
        plan.status !== PlanStatus.pending &&
        plan.status !== PlanStatus.change_pending
      ) {
        throw new AppError(
          ErrorCode.PLAN_CANNOT_CONFIRM,
          '当前规划状态不支持提出异议',
        );
      }

      // 异议记录 + 通知班主任 + 操作日志,三步原子化
      await fastify.prisma.$transaction(async (tx) => {
        await tx.planConfirmation.create({
          data: {
            planId,
            action: 'reject',
            actorId: user.sub,
            content: parsed.data.content,
          },
        });

        const teacherRelation = await tx.studentTeacher.findFirst({
          where: { studentId, endedAt: null },
          include: { teacher: true },
        });

        if (teacherRelation) {
          await createInAppNotification(tx, {
            userId: teacherRelation.teacherId,
            type: 'plan_rejected',
            title: '学生对规划提出异议',
            content: `学生对「${plan.stageName}」规划提出异议：${parsed.data.content}`,
            relatedId: studentId,
          });
        }

        await writeOperationLog(tx, {
          studentId,
          actorId: user.sub,
          actorName: user.name,
          actionType: 'plan_reject',
          targetType: 'period_plan',
          targetId: planId,
          detail: {
            planVersion: plan.version,
            stageName: plan.stageName,
            rejectContent: parsed.data.content,
          } as unknown as Prisma.InputJsonValue,
        });
      });

      return reply.send({ message: '异议已提交，班主任将与你重新协商' });
    },
  );

  // POST /api/students/:studentId/plans/:planId/change - 发起变更（已生效规划）
  fastify.post<{ Params: PlanParams; Body: ChangePlanBody }>(
    '/students/:studentId/plans/:planId/change',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER]),
      ],
    },
    async (
      request: FastifyRequest<{ Params: PlanParams; Body: ChangePlanBody }>,
      reply: FastifyReply,
    ) => {
      const { studentId, planId } = request.params;
      const user = request.user as JwtPayload;
      await assertStudentAccess(fastify, user, studentId);

      const parsed = changePlanSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '变更参数错误', parsed.error.flatten());
      }
      const body = parsed.data;

      const plan = await fastify.prisma.periodPlan.findFirst({
        where: { id: planId, studentId },
        include: { tasks: true },
      });

      if (!plan) {
        throw createError.notFound('规划', planId);
      }

      if (plan.status !== PlanStatus.active) {
        throw createError.planStatus(plan.status, 'active');
      }

      // 创建变更草稿、通知、操作日志包进同一事务,
      // 并在事务内复查 active + 无 change_pending,防止并发重复变更。
      // 用 withVersionRetry 包装：版本号在 tx 内基于 max(version)+1 重新计算，
      // 两个并发变更冲突时其中一方拿到 P2002 后会重试取到下一个版本号。
      const newPlan = await withVersionRetry(fastify, async (tx) => {
        const stillActive = await tx.periodPlan.findFirst({
          where: { id: planId, studentId, status: PlanStatus.active },
          select: { id: true },
        });
        if (!stillActive) {
          throw createError.planStatus(plan.status, 'active');
        }
        await ensureNoPendingPlanChange(tx, studentId, planId);

        const latest = await tx.periodPlan.findFirst({
          where: { studentId, periodCode: plan.periodCode },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const newVersion = (latest?.version ?? plan.version) + 1;

        const created = await tx.periodPlan.create({
          data: {
            studentId,
            periodCode: plan.periodCode,
            stageName: body.stageName ?? plan.stageName,
            goal: body.goal ?? plan.goal,
            startDate: body.startDate ? new Date(body.startDate) : plan.startDate,
            endDate: body.endDate ? new Date(body.endDate) : plan.endDate,
            version: newVersion,
            status: PlanStatus.change_pending,
            changeReason: body.changeReason,
            previousPlanId: planId,
            createdBy: user.sub,
            tasks: {
              create: plan.tasks.map((t) => ({
                title: t.title,
                description: t.description ?? undefined,
                dueDate: t.dueDate ?? undefined,
                dueTime: t.dueTime ?? undefined,
                priority: t.priority,
                repeatType: t.repeatType,
                sortOrder: t.sortOrder,
              })),
            },
          },
          include: { tasks: true },
        });

        const studentRecord = await tx.student.findUnique({
          where: { id: studentId },
        });

        if (studentRecord) {
          await createInAppNotification(tx, {
            userId: studentRecord.userId,
            type: 'plan_change_pending',
            title: '规划已更新，需要重新确认',
            content: `班主任对「${plan.stageName}」规划进行了调整，请查看变更内容并确认。`,
            relatedId: created.id,
          });
        }

        await writeOperationLog(tx, {
          studentId,
          actorId: user.sub,
          actorName: user.name,
          actionType: 'plan_change',
          targetType: 'period_plan',
          targetId: created.id,
          detail: {
            previousPlanId: planId,
            previousVersion: plan.version,
            newVersion,
            changeReason: body.changeReason,
            changes: {
              stageName: body.stageName,
              startDate: body.startDate,
              endDate: body.endDate,
            },
          } as unknown as Prisma.InputJsonValue,
        });

        return created;
      }, { studentId, periodCode: plan.periodCode });

      return reply.status(201).send({
        data: newPlan,
        message: '变更已发起，等待学生确认',
      });
    },
  );

  // GET /api/students/:studentId/logs - 获取操作日志
  fastify.post<{ Params: PlanParams }>(
    '/students/:studentId/plans/:planId/complete',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER]),
      ],
    },
    async (
      request: FastifyRequest<{ Params: PlanParams }>,
      reply: FastifyReply,
    ) => {
      const { studentId, planId } = request.params;
      const user = request.user as JwtPayload;
      await assertStudentAccess(fastify, user, studentId);

      const plan = await fastify.prisma.periodPlan.findFirst({
        where: { id: planId, studentId },
      });
      if (!plan) throw createError.notFound('规划', planId);
      if (plan.status !== PlanStatus.active) {
        throw createError.planStatus(plan.status, 'active');
      }

      const completedAtIso = new Date().toISOString();
      const updated = await fastify.prisma.$transaction(async (tx) => {
        const result = await tx.periodPlan.updateMany({
          where: { id: planId, status: PlanStatus.active },
          data: { status: PlanStatus.completed },
        });
        if (result.count !== 1) {
          throw createError.planStatus(plan.status, 'active');
        }
        await writeOperationLog(tx, {
          studentId,
          actorId: user.sub,
          actorName: user.name,
          actionType: 'plan_complete',
          targetType: 'period_plan',
          targetId: planId,
          detail: {
            planVersion: plan.version,
            stageName: plan.stageName,
            completedAt: completedAtIso,
          } as unknown as Prisma.InputJsonValue,
        });
        return tx.periodPlan.findUniqueOrThrow({ where: { id: planId } });
      });

      return reply.send({ data: updated, message: '阶段规划已完成' });
    },
  );

  // GET /api/students/:studentId/logs - 获取操作日志
  fastify.get<{ Params: StudentParams }>(
    '/students/:studentId/logs',
    {
      preHandler: [
        authenticate,
        authorize([
          Roles.ADMIN_TOTAL,
          Roles.SUBJECT_HEAD,
          Roles.TEACHER,
          Roles.STUDENT,
        ]),
      ],
    },
    async (
      request: FastifyRequest<{ Params: StudentParams }>,
      reply: FastifyReply,
    ) => {
      const { studentId } = request.params;
      const user = request.user as JwtPayload;

      await assertStudentAccess(fastify, user, studentId);

      const logs = await fastify.prisma.operationLog.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      const safeL = logs.map((l) => ({ ...l, id: l.id.toString() }));
      return reply.send({ data: safeL, message: "操作日志获取成功" });
    },
  );

  // ─── PATCH /students/:studentId/tasks/:taskId/done ─── 任务标记完成/取消
  fastify.patch(
    '/students/:studentId/tasks/:taskId/done',
    {
      preHandler: [authenticate, authorize([Roles.STUDENT, Roles.TEACHER, Roles.SUBJECT_HEAD, Roles.ADMIN_TOTAL])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { studentId, taskId } = request.params as { studentId: string; taskId: string };
      const body = toggleTaskSchema.parse(request.body);
      const user = request.user as JwtPayload;

      await assertStudentAccess(fastify, user, studentId);

      // 确认任务存在且属于该学生的规划
      const task = await fastify.prisma.periodPlanTask.findFirst({
        where: {
          id: taskId,
          plan: { studentId },
        },
      });
      if (!task) throw createError.notFound('任务不存在');

      const updated = await fastify.prisma.$transaction(async (tx) => {
        const newStatus = body.done ? 'done' : 'pending';
        const nextTask = await tx.periodPlanTask.update({
          where: { id: taskId },
          data: {
            status: newStatus,
            doneAt: body.done ? new Date() : null,
            doneNote: body.done ? (body.doneNote ?? null) : null,
          },
        });

        await tx.operationLog.create({
          data: {
            studentId,
            actorId: user.sub,
            actorName: user.name,
            actionType: body.done ? 'task_done' : 'task_reopen',
            targetType: 'period_plan_task',
            targetId: taskId,
            detail: {
              planId: task.planId,
              taskTitle: task.title,
              doneNote: body.done ? (body.doneNote ?? null) : null,
            } as any,
          },
        });

        return nextTask;
      });

      return reply.send({ data: updated, message: body.done ? '任务已完成' : '任务已取消完成' });
    },
  );

  // ─── POST /students/:studentId/plans/:planId/tasks ─── 新增任务（班主任）
  fastify.post(
    '/students/:studentId/plans/:planId/tasks',
    {
      preHandler: [authenticate, authorize([Roles.TEACHER, Roles.SUBJECT_HEAD, Roles.ADMIN_TOTAL])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { studentId, planId } = request.params as { studentId: string; planId: string };
      const user = request.user as JwtPayload;
      await assertStudentAccess(fastify, user, studentId);
      const body = request.body as {
        title: string;
        description?: string;
        dueDate?: string;
        priority?: string;
        repeatType?: string;
        sortOrder?: number;
      };

      // 确认规划存在且属于该学生
      const plan = await fastify.prisma.periodPlan.findFirst({
        where: { id: planId, studentId },
        include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!plan) throw createError.notFound('规划不存在');

      if (plan.status === PlanStatus.active) {
        const newTask = {
          title: body.title,
          description: body.description ?? undefined,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          dueTime: undefined,
          priority: body.priority ?? '中',
          repeatType: body.repeatType ?? 'once',
          sortOrder: body.sortOrder ?? plan.tasks.length,
          status: 'pending',
          doneAt: undefined,
          doneNote: undefined,
        };
        const newPlan = await createTaskChangePlan(fastify, {
          studentId,
          sourcePlan: plan,
          user,
          changeReason: `新增任务：${body.title}`,
          tasks: [...plan.tasks.map((task) => taskCreateData(task)), newTask],
          detail: {
            previousPlanId: plan.id,
            previousVersion: plan.version,
            newTask: body.title,
            changeReason: `新增任务：${body.title}`,
          } as unknown as Prisma.InputJsonValue,
        });

        return reply.status(201).send({
          data: newPlan,
          message: '任务变更已发起，等待学生确认',
        });
      }

      const task = await fastify.prisma.periodPlanTask.create({
        data: {
          planId,
          title: body.title,
          description: body.description ?? null,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          priority: body.priority ?? '中',
          repeatType: body.repeatType ?? 'once',
          sortOrder: body.sortOrder ?? 0,
          status: 'pending',
        },
      });

      await writeOperationLog(fastify.prisma, {
        studentId,
        actorId: user.sub,
        actorName: user.name,
        actionType: 'task_create',
        targetType: 'period_plan_task',
        targetId: task.id,
        detail: {
          planId,
          planStatus: plan.status,
          taskTitle: task.title,
          dueDate: body.dueDate ?? null,
          priority: task.priority,
        } as unknown as Prisma.InputJsonValue,
      });

      return reply.status(201).send({ data: task, message: '任务创建成功' });
    },
  );

  // ─── PATCH /students/:studentId/tasks/:taskId ─── 编辑任务（班主任）
  fastify.patch(
    '/students/:studentId/tasks/:taskId',
    {
      preHandler: [authenticate, authorize([Roles.TEACHER, Roles.SUBJECT_HEAD, Roles.ADMIN_TOTAL])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { studentId, taskId } = request.params as { studentId: string; taskId: string };
      const user = request.user as JwtPayload;
      await assertStudentAccess(fastify, user, studentId);
      const body = request.body as {
        title?: string;
        description?: string;
        dueDate?: string;
        priority?: string;
        repeatType?: string;
        sortOrder?: number;
      };

      // 确认任务属于该学生的规划
      const task = await fastify.prisma.periodPlanTask.findFirst({
        where: { id: taskId, plan: { studentId } },
        include: { plan: { include: { tasks: { orderBy: { sortOrder: 'asc' } } } } },
      });
      if (!task) throw createError.notFound('任务不存在');

      if (task.plan.status === PlanStatus.active) {
        const taskOverrides = {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
          ...(body.priority !== undefined && { priority: body.priority }),
          ...(body.repeatType !== undefined && { repeatType: body.repeatType }),
          ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        };
        const newPlan = await createTaskChangePlan(fastify, {
          studentId,
          sourcePlan: task.plan,
          user,
          changeReason: `编辑任务：${task.title}`,
          tasks: task.plan.tasks.map((planTask) =>
            taskCreateData(planTask, planTask.id === taskId ? taskOverrides : {}),
          ),
          detail: {
            previousPlanId: task.plan.id,
            previousVersion: task.plan.version,
            taskId,
            taskTitle: task.title,
            changes: body,
            changeReason: `编辑任务：${task.title}`,
          } as unknown as Prisma.InputJsonValue,
        });

        return reply.send({
          data: newPlan,
          message: '任务变更已发起，等待学生确认',
        });
      }

      const updated = await fastify.prisma.periodPlanTask.update({
        where: { id: taskId },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
          ...(body.priority !== undefined && { priority: body.priority }),
          ...(body.repeatType !== undefined && { repeatType: body.repeatType }),
          ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        },
      });

      await writeOperationLog(fastify.prisma, {
        studentId,
        actorId: user.sub,
        actorName: user.name,
        actionType: 'task_update',
        targetType: 'period_plan_task',
        targetId: taskId,
        detail: {
          planId: task.planId,
          planStatus: task.plan.status,
          taskTitle: task.title,
          changes: body,
        } as unknown as Prisma.InputJsonValue,
      });

      return reply.send({ data: updated, message: '任务更新成功' });
    },
  );

  // ─── GET /api/plans/:planId/diff ─── 规划变更Diff（新旧版本对比）
  fastify.get<{ Params: { planId: string } }>(
    '/plans/:planId/diff',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER, Roles.STUDENT]),
      ],
    },
    async (
      request: FastifyRequest<{ Params: { planId: string } }>,
      reply: FastifyReply,
    ) => {
      const { planId } = request.params;
      const user = request.user as JwtPayload;

      const currentPlan = await fastify.prisma.periodPlan.findUnique({
        where: { id: planId },
        include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      });

      if (!currentPlan) {
        throw createError.notFound('规划', planId);
      }

      await assertStudentAccess(fastify, user, currentPlan.studentId);

      let previousPlan = null;
      if (currentPlan.previousPlanId) {
        previousPlan = await fastify.prisma.periodPlan.findUnique({
          where: { id: currentPlan.previousPlanId },
          include: { tasks: { orderBy: { sortOrder: 'asc' } } },
        });
      }

      // 计算字段差异
      const diffs: Array<{ field: string; label: string; oldValue: string | null; newValue: string | null }> = [];
      let taskDiffs: TaskDiff[] = [];

      if (previousPlan) {
        const compare = (field: string, label: string, oldVal: any, newVal: any) => {
          const o = oldVal !== null && oldVal !== undefined ? String(oldVal) : null;
          const n = newVal !== null && newVal !== undefined ? String(newVal) : null;
          if (o !== n) {
            diffs.push({ field, label, oldValue: o, newValue: n });
          }
        };

        compare('stageName', '阶段名称', previousPlan.stageName, currentPlan.stageName);
        compare('goal', '阶段目标', previousPlan.goal, currentPlan.goal);
        compare(
          'startDate',
          '开始日期',
          previousPlan.startDate?.toISOString().slice(0, 10),
          currentPlan.startDate?.toISOString().slice(0, 10),
        );
        compare(
          'endDate',
          '截止日期',
          previousPlan.endDate?.toISOString().slice(0, 10),
          currentPlan.endDate?.toISOString().slice(0, 10),
        );
        taskDiffs = comparePlanTasks(previousPlan.tasks, currentPlan.tasks);
      }

      return reply.send({
        data: {
          current: currentPlan,
          previous: previousPlan,
          diffs,
          taskDiffs,
          changeReason: currentPlan.changeReason,
        },
      });
    },
  );

  // ─── GET /students/:studentId/plans/:planId/diff ─── 规划变更Diff（基于操作日志）
  fastify.get<{ Params: PlanParams }>(
    '/students/:studentId/plans/:planId/diff',
    {
      preHandler: [
        authenticate,
        authorize([
          Roles.ADMIN_TOTAL,
          Roles.SUBJECT_HEAD,
          Roles.TEACHER,
          Roles.STUDENT,
        ]),
      ],
    },
    async (
      request: FastifyRequest<{ Params: PlanParams }>,
      reply: FastifyReply,
    ) => {
      const { studentId, planId } = request.params;
      const user = request.user as JwtPayload;
      await assertStudentAccess(fastify, user, studentId);

      // 验证规划存在且属于该学生
      const plan = await fastify.prisma.periodPlan.findFirst({
        where: { id: planId, studentId },
        include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      });

      if (!plan) {
        throw createError.notFound('规划', planId);
      }

      let previousPlan = null;
      if (plan.previousPlanId) {
        previousPlan = await fastify.prisma.periodPlan.findUnique({
          where: { id: plan.previousPlanId },
          include: { tasks: { orderBy: { sortOrder: 'asc' } } },
        });
      }

      const diffs: Array<{ field: string; label: string; oldValue: string | null; newValue: string | null }> = [];
      let taskDiffs: TaskDiff[] = [];
      if (previousPlan) {
        const compare = (field: string, label: string, oldVal: unknown, newVal: unknown) => {
          const oldValue = oldVal !== null && oldVal !== undefined ? String(oldVal) : null;
          const newValue = newVal !== null && newVal !== undefined ? String(newVal) : null;
          if (oldValue !== newValue) diffs.push({ field, label, oldValue, newValue });
        };
        compare('stageName', '阶段名称', previousPlan.stageName, plan.stageName);
        compare('goal', '阶段目标', previousPlan.goal, plan.goal);
        compare('startDate', '开始日期', previousPlan.startDate?.toISOString().slice(0, 10), plan.startDate?.toISOString().slice(0, 10));
        compare('endDate', '截止日期', previousPlan.endDate?.toISOString().slice(0, 10), plan.endDate?.toISOString().slice(0, 10));
        compare('taskCount', '任务数量', previousPlan.tasks.length, plan.tasks.length);
        taskDiffs = comparePlanTasks(previousPlan.tasks, plan.tasks);
      }

      // 查询该规划的操作日志（最近两条 update 类型）
      const logs = await fastify.prisma.operationLog.findMany({
        where: {
          targetType: 'period_plan',
          targetId: planId,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      // 将 BigInt id 转为字符串，避免JSON序列化问题
      const safeLogs = logs.map((l) => ({ ...l, id: l.id.toString() }));

      // 尝试获取最近一次 update 操作
      const latestUpdate = safeLogs.find(
        (l) => l.actionType === 'plan_change' || l.actionType === 'plan_update',
      );

      const hasChanges = !!plan.changeReason || diffs.length > 0 || safeLogs.length > 1;

      return reply.send({
        data: {
          current: plan,
          previous: previousPlan,
          diffs,
          taskDiffs,
          hasChanges,
          changeReason: plan.changeReason ?? null,
          changedAt: latestUpdate?.createdAt ?? plan.createdAt,
          logs: safeLogs,
        },
      });
    },
  );

  // ─── DELETE /students/:studentId/tasks/:taskId ─── 删除任务（班主任）
  fastify.delete(
    '/students/:studentId/tasks/:taskId',
    {
      preHandler: [authenticate, authorize([Roles.TEACHER, Roles.SUBJECT_HEAD, Roles.ADMIN_TOTAL])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { studentId, taskId } = request.params as { studentId: string; taskId: string };
      const user = request.user as JwtPayload;
      await assertStudentAccess(fastify, user, studentId);

      const task = await fastify.prisma.periodPlanTask.findFirst({
        where: { id: taskId, plan: { studentId } },
        include: { plan: { include: { tasks: { orderBy: { sortOrder: 'asc' } } } } },
      });
      if (!task) throw createError.notFound('任务不存在');

      if (task.plan.status === PlanStatus.active) {
        const newPlan = await createTaskChangePlan(fastify, {
          studentId,
          sourcePlan: task.plan,
          user,
          changeReason: `删除任务：${task.title}`,
          tasks: task.plan.tasks
            .filter((planTask) => planTask.id !== taskId)
            .map((planTask) => taskCreateData(planTask)),
          detail: {
            previousPlanId: task.plan.id,
            previousVersion: task.plan.version,
            taskId,
            taskTitle: task.title,
            changeReason: `删除任务：${task.title}`,
          } as unknown as Prisma.InputJsonValue,
        });

        return reply.send({
          data: newPlan,
          message: '任务变更已发起，等待学生确认',
        });
      }

      await fastify.prisma.$transaction(async (tx) => {
        await tx.periodPlanTask.delete({ where: { id: taskId } });
        await tx.operationLog.create({
          data: {
            studentId,
            actorId: user.sub,
            actorName: user.name,
            actionType: 'task_delete',
            targetType: 'period_plan_task',
            targetId: taskId,
            detail: {
              planId: task.planId,
              planStatus: task.plan.status,
              taskTitle: task.title,
            } as any,
          },
        });
      });

      return reply.send({ message: '任务已删除' });
    },
  );
}
