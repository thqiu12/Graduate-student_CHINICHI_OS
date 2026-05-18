// src/routes/schools.ts
// 知日塾大学院考学进度管理系统 - 志望校路由

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';
import { assertStudentAccess } from '../utils/access-control';

const createSchoolSchema = z.object({
  universityName: z.string().min(1, '学校名称不能为空'),
  department: z.string().optional(),
  examTypes: z.array(z.string()).optional().default([]),
  rank: z.number().int().min(1).optional(),
  professorName: z.string().optional(),
  professorUrl: z.string().url().optional(),
  applicationStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  applicationEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  resultDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  result: z.enum(['passed', 'failed', 'waitlisted', 'withdrawn']).optional(),
});

export async function schoolRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/students/:id/target-schools
  fastify.get(
    '/students/:id/target-schools',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER, Roles.STUDENT])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      await assertStudentAccess(fastify, request.user as JwtPayload, id);
      const schools = await fastify.prisma.targetSchool.findMany({
        where: { studentId: id },
        orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
        include: { innoTracking: true },
      });
      return reply.send({ data: schools });
    }
  );

  // POST /api/students/:id/target-schools
  fastify.post(
    '/students/:id/target-schools',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id } = request.params as { id: string };
      await assertStudentAccess(fastify, user, id);
      const body = createSchoolSchema.parse(request.body);

      const student = await fastify.prisma.student.findUnique({ where: { id } });
      if (!student) throw new AppError(ErrorCode.NOT_FOUND, '学生不存在', 404);

      const existingCount = await fastify.prisma.targetSchool.count({
        where: { studentId: id },
      });
      if (existingCount >= 5) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '每个学生最多设置5所志望校');
      }

      const school = await fastify.prisma.targetSchool.create({
        data: {
          studentId: id,
          universityName: body.universityName,
          department: body.department,
          examTypes: body.examTypes,
          rank: body.rank,
          professorName: body.professorName,
          professorUrl: body.professorUrl,
          applicationStart: body.applicationStart ? new Date(body.applicationStart) : undefined,
          applicationEnd: body.applicationEnd ? new Date(body.applicationEnd) : undefined,
          examDate: body.examDate ? new Date(body.examDate) : undefined,
          resultDate: body.resultDate ? new Date(body.resultDate) : undefined,
          result: body.result,
        },
      });

      await fastify.prisma.operationLog.create({
        data: {
          studentId: id,
          actorId: user.sub,
          actionType: 'school_add',
          detail: { schoolId: school.id, schoolName: body.universityName } as any,
        },
      });

      return reply.status(201).send(school);
    }
  );

  // DELETE /api/students/:id/target-schools/:sid
  fastify.delete(
    '/students/:id/target-schools/:sid',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id, sid } = request.params as { id: string; sid: string };
      await assertStudentAccess(fastify, user, id);

      const school = await fastify.prisma.targetSchool.findFirst({ where: { id: sid, studentId: id } });
      if (!school) throw new AppError(ErrorCode.NOT_FOUND, '志望校不存在', 404);

      await fastify.prisma.targetSchool.delete({ where: { id: sid } });

      await fastify.prisma.operationLog.create({
        data: {
          studentId: id,
          actorId: user.sub,
          actionType: 'school_remove',
          detail: { schoolId: sid, schoolName: school.universityName } as any,
        },
      });

      return reply.status(204).send();
    }
  );
}
