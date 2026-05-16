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

type CreatePlanBody = z.infer<typeof createPlanSchema>;
type RejectPlanBody = z.infer<typeof rejectPlanSchema>;
type ChangePlanBody = z.infer<typeof changePlanSchema>;

interface StudentParams {
  studentId: string;
}

interface PlanParams extends StudentParams {
  planId: string;
}

// ─── 辅助函数：写入操作日志 ──────────────────────────────
async function writeOperationLog(
  fastify: FastifyInstance,
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
  await fastify.prisma.operationLog.create({
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

      // 学生只能查看自己的规划
      if (user.roles.includes(Roles.STUDENT)) {
        const student = await fastify.prisma.student.findFirst({
          where: { id: studentId, userId: user.sub },
        });
        if (!student) {
          throw createError.forbidden('只能查看自己的规划');
        }
      }

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

      return reply.send({ data: plans });
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

      // 查找同阶段当前最大版本号
      const existingPlan = await fastify.prisma.periodPlan.findFirst({
        where: { studentId, periodCode: body.periodCode },
        orderBy: { version: 'desc' },
      });
      const newVersion = (existingPlan?.version ?? 0) + 1;

      // 创建规划（草稿状态）
      const plan = await fastify.prisma.periodPlan.create({
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

      // 写入操作日志
      await writeOperationLog(fastify, {
        studentId,
        actorId: user.sub,
        actorName: user.name,
        actionType: 'plan_create',
        targetType: 'period_plan',
        targetId: plan.id,
        detail: {
          periodCode: plan.periodCode,
          stageName: plan.stageName,
          startDate: plan.startDate,
          endDate: plan.endDate,
          taskCount: body.tasks.length,
          version: newVersion,
        } as unknown as Prisma.InputJsonValue,
      });

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

      const plan = await fastify.prisma.periodPlan.findFirst({
        where: { id: planId, studentId },
      });

      if (!plan) {
        throw createError.notFound('规划', planId);
      }

      if (plan.status !== PlanStatus.draft) {
        throw createError.planStatus(plan.status, 'draft');
      }

      // 更新规划状态为待确认
      const updatedPlan = await fastify.prisma.periodPlan.update({
        where: { id: planId },
        data: {
          status: PlanStatus.pending,
          sentAt: new Date(),
        },
      });

      // 创建站内通知给学生
      const studentUser = await fastify.prisma.student.findUnique({
        where: { id: studentId },
        include: { user: true },
      });

      if (studentUser) {
        await fastify.prisma.notification.create({
          data: {
            userId: studentUser.userId,
            type: 'plan_pending',
            title: '新阶段规划待确认',
            content: `班主任为你制定了「${plan.stageName}」的阶段规划，请查看并确认。`,
            relatedId: planId,
          },
        });
      }

      // 写入操作日志
      await writeOperationLog(fastify, {
        studentId,
        actorId: user.sub,
        actorName: user.name,
        actionType: 'plan_send',
        targetType: 'period_plan',
        targetId: planId,
        detail: {
          planVersion: plan.version,
          stageName: plan.stageName,
          sentAt: updatedPlan.sentAt,
        } as unknown as Prisma.InputJsonValue,
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

      // 验证学生身份
      const student = await fastify.prisma.student.findFirst({
        where: { id: studentId, userId: user.sub },
      });
      if (!student) {
        throw createError.forbidden('只能确认自己的规划');
      }

      const plan = await fastify.prisma.periodPlan.findFirst({
        where: { id: planId, studentId },
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

      // 更新规划状态为已生效
      const updatedPlan = await fastify.prisma.periodPlan.update({
        where: { id: planId },
        data: {
          status: PlanStatus.active,
          confirmedAt: now,
          confirmedBy: user.sub,
        },
      });

      // 记录确认记录
      await fastify.prisma.planConfirmation.create({
        data: {
          planId,
          action: 'confirm',
          actorId: user.sub,
          content: '学生确认接受规划',
        },
      });

      // 写入操作日志
      await writeOperationLog(fastify, {
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

      // 记录异议
      await fastify.prisma.planConfirmation.create({
        data: {
          planId,
          action: 'reject',
          actorId: user.sub,
          content: parsed.data.content,
        },
      });

      // 通知班主任
      const teacherRelation = await fastify.prisma.studentTeacher.findFirst({
        where: { studentId, endedAt: null },
        include: { teacher: true },
      });

      if (teacherRelation) {
        await fastify.prisma.notification.create({
          data: {
            userId: teacherRelation.teacherId,
            type: 'plan_rejected',
            title: '学生对规划提出异议',
            content: `学生对「${plan.stageName}」规划提出异议：${parsed.data.content}`,
            relatedId: planId,
          },
        });
      }

      // 写入操作日志
      await writeOperationLog(fastify, {
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

      // 创建新版本规划（change_pending 状态）
      const newVersion = plan.version + 1;
      const newPlan = await fastify.prisma.periodPlan.create({
        data: {
          studentId,
          periodCode: plan.periodCode,
          stageName: body.stageName ?? plan.stageName,
          goal: plan.goal,
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

      // 通知学生
      const studentRecord = await fastify.prisma.student.findUnique({
        where: { id: studentId },
      });

      if (studentRecord) {
        await fastify.prisma.notification.create({
          data: {
            userId: studentRecord.userId,
            type: 'plan_change_pending',
            title: '规划已更新，需要重新确认',
            content: `班主任对「${plan.stageName}」规划进行了调整，请查看变更内容并确认。`,
            relatedId: newPlan.id,
          },
        });
      }

      // 写入操作日志
      await writeOperationLog(fastify, {
        studentId,
        actorId: user.sub,
        actorName: user.name,
        actionType: 'plan_change',
        targetType: 'period_plan',
        targetId: newPlan.id,
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

      return reply.status(201).send({
        data: newPlan,
        message: '变更已发起，等待学生确认',
      });
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

      // 学生只能查看自己的日志
      if (user.roles.includes(Roles.STUDENT)) {
        const student = await fastify.prisma.student.findFirst({
          where: { id: studentId, userId: user.sub },
        });
        if (!student) {
          throw createError.forbidden('只能查看自己的操作日志');
        }
      }

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
      const body = request.body as { done: boolean; doneNote?: string };
      const user = request.user as JwtPayload;

      // 学生只能操作自己的任务
      if (user.roles.includes(Roles.STUDENT)) {
        const student = await fastify.prisma.student.findFirst({
          where: { id: studentId, userId: user.sub },
        });
        if (!student) throw createError.forbidden('只能操作自己的任务');
      }

      // 确认任务存在且属于该学生的规划
      const task = await fastify.prisma.periodPlanTask.findFirst({
        where: {
          id: taskId,
          plan: { studentId },
        },
      });
      if (!task) throw createError.notFound('任务不存在');

      const newStatus = body.done ? 'done' : 'pending';
      const updated = await fastify.prisma.periodPlanTask.update({
        where: { id: taskId },
        data: {
          status: newStatus,
          doneAt: body.done ? new Date() : null,
          doneNote: body.done ? (body.doneNote ?? null) : null,
        },
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
      });
      if (!plan) throw createError.notFound('规划不存在');

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
      });
      if (!task) throw createError.notFound('任务不存在');

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

      return reply.send({ data: updated, message: '任务更新成功' });
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

      const task = await fastify.prisma.periodPlanTask.findFirst({
        where: { id: taskId, plan: { studentId } },
      });
      if (!task) throw createError.notFound('任务不存在');

      await fastify.prisma.periodPlanTask.delete({ where: { id: taskId } });

      return reply.send({ message: '任务已删除' });
    },
  );
}
