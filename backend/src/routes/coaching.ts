// src/routes/coaching.ts
// 知日塾大学院考学进度管理系统 - 辅导记录路由

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';
import { assertStudentAccess } from '../utils/access-control';
import { PlanStatus } from '@prisma/client';

const createCoachingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
  summary: z.string().min(1, '辅导内容不能为空'),
  nextAction: z.string().optional(),
  nextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  form: z.enum(['face', 'online', 'phone', 'message']).default('face'),
  durationMin: z.number().int().positive().optional(),
  todos: z.array(z.object({
    title: z.string(),
    dueDate: z.string().optional(),
  })).optional(),
});

export async function coachingRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/students/:id/coaching-records
  fastify.get(
    '/students/:id/coaching-records',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER, Roles.STUDENT])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      await assertStudentAccess(fastify, request.user as JwtPayload, id);
      const { page: pageStr, pageSize: psStr } = request.query as { page?: string; pageSize?: string };
      const page = parseInt(pageStr ?? '1');
      const pageSize = parseInt(psStr ?? '20');

      const student = await fastify.prisma.student.findUnique({ where: { id } });
      if (!student) throw new AppError(ErrorCode.NOT_FOUND, '学生不存在', 404);

      // 返回完整辅导历史:不按当前班主任过滤,保留前任老师写下的记录;
      // 同步返回 currentTeacherId,让前端可以区分"现任 / 前任"老师。
      const [records, total, currentRelation] = await Promise.all([
        fastify.prisma.coachingRecord.findMany({
          where: { studentId: id },
          orderBy: { coachedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            todos: true,
            teacher: { select: { id: true, name: true } },
          },
        }),
        fastify.prisma.coachingRecord.count({ where: { studentId: id } }),
        fastify.prisma.studentTeacher.findFirst({
          where: { studentId: id, endedAt: null },
          select: { teacherId: true },
        }),
      ]);

      return reply.send({
        data: records,
        total,
        page,
        pageSize,
        currentTeacherId: currentRelation?.teacherId ?? null,
      });
    }
  );

  // GET /api/students/:id/coaching-records/:rid
  fastify.get(
    '/students/:id/coaching-records/:rid',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER, Roles.STUDENT])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, rid } = request.params as { id: string; rid: string };
      await assertStudentAccess(fastify, request.user as JwtPayload, id);
      const record = await fastify.prisma.coachingRecord.findFirst({
        where: { id: rid, studentId: id },
        include: {
          todos: true,
          teacher: { select: { id: true, name: true } },
        },
      });
      if (!record) throw new AppError(ErrorCode.NOT_FOUND, '辅导记录不存在', 404);
      return reply.send(record);
    }
  );

  // POST /api/students/:id/coaching-records
  fastify.post(
    '/students/:id/coaching-records',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id } = request.params as { id: string };
      await assertStudentAccess(fastify, user, id);
      const body = createCoachingSchema.parse(request.body);

      const student = await fastify.prisma.student.findUnique({ where: { id } });
      if (!student) throw new AppError(ErrorCode.NOT_FOUND, '学生不存在', 404);

      const record = await fastify.prisma.$transaction(async (tx) => {
        const activePlan = await tx.periodPlan.findFirst({
          where: { studentId: id, status: PlanStatus.active },
          orderBy: { startDate: 'desc' },
          include: { tasks: { orderBy: { sortOrder: 'desc' }, take: 1 } },
        });

        const createdRecord = await tx.coachingRecord.create({
          data: {
            studentId: id,
            teacherId: user.sub,
            coachedAt: new Date(body.date),
            content: body.nextAction ? `${body.summary}\n\n下次行动：${body.nextAction}` : body.summary,
            form: body.form,
            nextDate: body.nextDate ? new Date(body.nextDate) : undefined,
            schoolIds: [],
          },
        });

        for (const [idx, todo] of (body.todos ?? []).entries()) {
          const task = activePlan
            ? await tx.periodPlanTask.create({
                data: {
                  planId: activePlan.id,
                  title: todo.title,
                  dueDate: todo.dueDate ? new Date(todo.dueDate) : null,
                  priority: '中',
                  repeatType: 'once',
                  sortOrder: (activePlan.tasks[0]?.sortOrder ?? 0) + idx + 1,
                  status: 'pending',
                },
              })
            : null;

          await tx.coachingTodo.create({
            data: {
              coachingId: createdRecord.id,
              taskId: task?.id,
              title: todo.title,
              dueDate: todo.dueDate ? new Date(todo.dueDate) : null,
            },
          });
        }

        return tx.coachingRecord.findUniqueOrThrow({
          where: { id: createdRecord.id },
          include: { todos: true },
        });
      });

      await fastify.prisma.operationLog.create({
        data: {
          studentId: id,
          actorId: user.sub,
          actorName: user.name,
          actionType: 'coaching_add',
          targetType: 'coaching_record',
          targetId: record.id,
          detail: {
            recordId: record.id,
            date: body.date,
            form: body.form,
            todoCount: record.todos.length,
          } as any,
        },
      });

      return reply.status(201).send(record);
    }
  );
}
