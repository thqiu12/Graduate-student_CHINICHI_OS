// src/routes/notifications.ts
// 知日塾大学院考学进度管理系统 - 通知路由
// 包含：通知列表 + 标记已读接口

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, createError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';
import { assertStudentAccess } from '../utils/access-control';

// ─── 请求参数 Schema ─────────────────────────────────────
const listQuerySchema = z.object({
  isRead: z.enum(['true', 'false']).optional(),
  type: z.string().optional(),
  page: z.string().optional().transform(Number).default('1'),
  pageSize: z.string().optional().transform(Number).default('20'),
});

interface NotificationParams {
  id: string;
}

// ─── 路由注册函数 ─────────────────────────────────────────
export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/notifications - 我的通知列表
  fastify.get(
    '/notifications',
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const query = listQuerySchema.parse(request.query);

      const whereClause: Record<string, unknown> = { userId: user.sub };

      if (query.isRead !== undefined) {
        whereClause['isRead'] = query.isRead === 'true';
      }
      if (query.type) {
        whereClause['type'] = query.type;
      }

      const page = isNaN(query.page) ? 1 : query.page;
      const pageSize = isNaN(query.pageSize) ? 20 : query.pageSize;

      const [total, notifications, unreadCount] = await Promise.all([
        fastify.prisma.notification.count({ where: whereClause }),
        fastify.prisma.notification.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        fastify.prisma.notification.count({
          where: { userId: user.sub, isRead: false },
        }),
      ]);

      return reply.send({
        data: notifications,
        unreadCount,
        pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      });
    },
  );

  // POST /api/notifications/:id/read - 标记单条通知为已读
  fastify.post<{ Params: NotificationParams }>(
    '/notifications/:id/read',
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
      request: FastifyRequest<{ Params: NotificationParams }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const user = request.user as JwtPayload;

      // 确保通知属于当前用户
      const notification = await fastify.prisma.notification.findFirst({
        where: { id, userId: user.sub },
      });

      if (!notification) {
        throw createError.notFound('通知', id);
      }

      if (notification.isRead) {
        return reply.send({ message: '通知已经是已读状态' });
      }

      const updated = await fastify.prisma.notification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      });

      return reply.send({ data: updated, message: '已标记为已读' });
    },
  );

  // POST /api/notifications/read-all - 全部标为已读
  fastify.post(
    '/notifications/read-all',
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;

      const result = await fastify.prisma.notification.updateMany({
        where: { userId: user.sub, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });

      return reply.send({
        message: `已将 ${result.count} 条通知标为已读`,
        count: result.count,
      });
    },
  );

  // POST /api/notifications/push - 班主任手动推送给学生
  fastify.post<{
    Body: { studentId: string; title: string; content?: string };
  }>(
    '/notifications/push',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER]),
      ],
    },
    async (
      request: FastifyRequest<{
        Body: { studentId: string; title: string; content?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const user = request.user as JwtPayload;
      const { studentId, title, content } = request.body;

      if (!studentId || !title) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '学生ID和标题不能为空');
      }

      await assertStudentAccess(fastify, user, studentId);

      // 找到学生的 userId
      const student = await fastify.prisma.student.findUnique({
        where: { id: studentId },
        select: { userId: true },
      });

      if (!student) {
        throw createError.studentNotFound(studentId);
      }

      const notification = await fastify.prisma.notification.create({
        data: {
          userId: student.userId,
          type: 'teacher_push',
          title,
          content: content ?? null,
          relatedId: studentId,
        },
      });

      // 同时创建推送渠道记录（站内通知）
      await fastify.prisma.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel: 'in_app',
          status: 'sent',
          sentAt: new Date(),
        },
      });

      return reply.status(201).send({
        success: true,
        notificationId: notification.id,
      });
    },
  );
}
