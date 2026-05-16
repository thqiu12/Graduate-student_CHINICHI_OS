// src/routes/risk-tags.ts
// 知日塾大学院考学进度管理系统 - 风险标签路由

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';

const VALID_TAG_CODES = ['pace_risk', 'attitude_issue', 'inno_gap', 'preparation_weak', 'exam_repeat'];

const addTagSchema = z.object({
  tagCode: z.string().refine(v => VALID_TAG_CODES.includes(v), '无效的风险标签码'),
  reason: z.string().default(''),
});

export async function riskTagRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/students/:id/risk-tags
  fastify.get(
    '/students/:id/risk-tags',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const tags = await fastify.prisma.studentRiskTag.findMany({
        where: { studentId: id, removedAt: null },
        include: { tag: true },
        orderBy: { taggedAt: 'desc' },
      });
      return reply.send({ data: tags });
    }
  );

  // POST /api/students/:id/risk-tags
  fastify.post(
    '/students/:id/risk-tags',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id } = request.params as { id: string };
      const { tagCode, reason } = addTagSchema.parse(request.body);

      const student = await fastify.prisma.student.findUnique({ where: { id } });
      if (!student) throw new AppError(ErrorCode.NOT_FOUND, '学生不存在', 404);

      const riskTag = await fastify.prisma.riskTag.findFirst({ where: { code: tagCode } });
      if (!riskTag) throw new AppError(ErrorCode.NOT_FOUND, '风险标签不存在', 404);

      const existing = await fastify.prisma.studentRiskTag.findFirst({
        where: { studentId: id, tagId: riskTag.id, removedAt: null },
      });
      if (existing) throw new AppError(ErrorCode.CONFLICT, '该风险标签已存在', 409);

      const studentTag = await fastify.prisma.studentRiskTag.create({
        data: {
          studentId: id,
          tagId: riskTag.id,
          taggedBy: user.sub,
          reason,
        },
        include: { tag: true },
      });

      await fastify.prisma.operationLog.create({
        data: {
          studentId: id,
          actorId: user.sub,
          actionType: 'tag_add',
          detail: { tagCode, tagName: riskTag.label } as any,
        },
      });

      return reply.status(201).send(studentTag);
    }
  );

  // DELETE /api/students/:id/risk-tags/:tagCode
  fastify.delete(
    '/students/:id/risk-tags/:tagCode',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id, tagCode } = request.params as { id: string; tagCode: string };

      const riskTag = await fastify.prisma.riskTag.findFirst({ where: { code: tagCode } });
      if (!riskTag) throw new AppError(ErrorCode.NOT_FOUND, '风险标签不存在', 404);

      const studentTag = await fastify.prisma.studentRiskTag.findFirst({
        where: { studentId: id, tagId: riskTag.id, removedAt: null },
      });
      if (!studentTag) throw new AppError(ErrorCode.NOT_FOUND, '标签不存在或已移除', 404);

      await fastify.prisma.studentRiskTag.update({
        where: { id: studentTag.id },
        data: { removedAt: new Date(), removedBy: user.sub },
      });

      await fastify.prisma.operationLog.create({
        data: {
          studentId: id,
          actorId: user.sub,
          actionType: 'tag_remove',
          detail: { tagCode, tagName: riskTag.label } as any,
        },
      });

      return reply.status(204).send();
    }
  );
}
