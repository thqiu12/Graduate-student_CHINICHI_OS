// src/routes/inno.ts
// 知日塾大学院考学进度管理系统 - 内诺跟踪路由（仅理科生）

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';
import { assertStudentAccess } from '../utils/access-control';

const updateInnoSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'confirmed', 'rejected']).optional(),
  notes: z.string().optional(),
  confirmedAt: z.string().optional(),
});

const addContactSchema = z.object({
  method: z.enum(['email', 'visit', 'video_call', 'phone', 'other']).optional(),
  contactDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  summary: z.string().min(1, '沟通内容不能为空'),
});

export async function innoRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/students/:id/inno
  fastify.get(
    '/students/:id/inno',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER, Roles.STUDENT])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      await assertStudentAccess(fastify, request.user as JwtPayload, id);

      const schools = await fastify.prisma.targetSchool.findMany({
        where: { studentId: id },
        include: {
          innoTracking: {
            include: {
              contacts: { orderBy: { contactDate: 'desc' } },
            },
          },
        },
        orderBy: { rank: 'asc' },
      });

      return reply.send({ data: schools });
    }
  );

  // POST /api/students/:id/inno/:schoolId
  fastify.post(
    '/students/:id/inno/:schoolId',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id, schoolId } = request.params as { id: string; schoolId: string };
      await assertStudentAccess(fastify, user, id);
      const body = updateInnoSchema.parse(request.body);

      const school = await fastify.prisma.targetSchool.findFirst({
        where: { id: schoolId, studentId: id },
      });
      if (!school) throw new AppError(ErrorCode.NOT_FOUND, '志望校不存在', 404);

      const tracking = await fastify.prisma.$transaction(async (tx) => {
        const nextTracking = await tx.innoTracking.upsert({
          where: { schoolId },
          create: {
            schoolId,
            status: body.status ?? 'not_started',
            notes: body.notes,
            confirmedAt: body.confirmedAt ? new Date(body.confirmedAt) : null,
          },
          update: {
            ...(body.status && { status: body.status }),
            ...(body.notes !== undefined && { notes: body.notes }),
            ...(body.confirmedAt && { confirmedAt: new Date(body.confirmedAt) }),
          },
          include: { contacts: true },
        });

        if (body.status === 'confirmed') {
          await tx.schoolProgressNode.updateMany({
            where: { schoolId, nodeCode: 'inno' },
            data: { isDone: true, doneAt: new Date(), doneBy: user.sub },
          });
        }

        if (body.status) {
          await tx.operationLog.create({
            data: {
              studentId: id,
              actorId: user.sub,
              actorName: user.name,
              actionType: body.status === 'confirmed' ? 'inno_confirmed' : 'inno_status_update',
              targetType: 'inno_tracking',
              targetId: nextTracking.id,
              detail: {
                schoolId,
                schoolName: school.universityName,
                trackingId: nextTracking.id,
                status: body.status,
              } as any,
            },
          });
        }

        return nextTracking;
      });

      return reply.send(tracking);
    }
  );

  // POST /api/students/:id/inno/:schoolId/contacts
  fastify.post(
    '/students/:id/inno/:schoolId/contacts',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id, schoolId } = request.params as { id: string; schoolId: string };
      await assertStudentAccess(fastify, user, id);
      const body = addContactSchema.parse(request.body);

      const school = await fastify.prisma.targetSchool.findFirst({
        where: { id: schoolId, studentId: id },
      });
      if (!school) throw new AppError(ErrorCode.NOT_FOUND, '志望校不存在', 404);

      const contact = await fastify.prisma.$transaction(async (tx) => {
        const tracking = await tx.innoTracking.upsert({
          where: { schoolId },
          create: {
            schoolId,
            status: 'in_progress',
            contactCount: 1,
            lastContactAt: body.contactDate ? new Date(body.contactDate) : new Date(),
          },
          update: {
            contactCount: { increment: 1 },
            lastContactAt: body.contactDate ? new Date(body.contactDate) : new Date(),
          },
        });

        const nextContact = await tx.innoContact.create({
          data: {
            trackingId: tracking.id,
            method: body.method,
            contactDate: body.contactDate ? new Date(body.contactDate) : new Date(),
            summary: body.summary,
            createdBy: user.sub,
          },
        });

        await tx.operationLog.create({
          data: {
            studentId: id,
            actorId: user.sub,
            actorName: user.name,
            actionType: 'inno_contact_add',
            targetType: 'inno_tracking',
            targetId: tracking.id,
            detail: {
              schoolId,
              schoolName: school.universityName,
              contactId: nextContact.id,
              method: body.method,
              contactDate: nextContact.contactDate,
            } as any,
          },
        });

        return nextContact;
      });

      return reply.status(201).send(contact);
    }
  );
}
