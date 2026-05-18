// src/routes/coaching.ts
// 知日塾大学院考学进度管理系统 - 辅导记录路由

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';
import { assertStudentAccess } from '../utils/access-control';

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

      const [records, total] = await Promise.all([
        fastify.prisma.coachingRecord.findMany({
          where: { studentId: id },
          orderBy: { coachedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { todos: true },
        }),
        fastify.prisma.coachingRecord.count({ where: { studentId: id } }),
      ]);

      return reply.send({ data: records, total, page, pageSize });
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
        include: { todos: true },
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

      const record = await fastify.prisma.coachingRecord.create({
        data: {
          studentId: id,
          teacherId: user.sub,
          coachedAt: new Date(body.date),
          content: body.nextAction ? `${body.summary}\n\n下次行动：${body.nextAction}` : body.summary,
          form: body.form,
          nextDate: body.nextDate ? new Date(body.nextDate) : undefined,
          schoolIds: [],
          todos: body.todos ? {
            create: body.todos.map(t => ({
              title: t.title,
              dueDate: t.dueDate ? new Date(t.dueDate) : null,
            })),
          } : undefined,
        },
        include: { todos: true },
      });

      await fastify.prisma.operationLog.create({
        data: {
          studentId: id,
          actorId: user.sub,
          actionType: 'coaching_add',
          detail: { recordId: record.id, date: body.date, form: body.form } as any,
        },
      });

      return reply.status(201).send(record);
    }
  );
}
