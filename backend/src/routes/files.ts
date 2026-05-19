// src/routes/files.ts
// 知日塾大学院考学进度管理系统 - 文件管理路由
// 存储后端通过 utils/storage 适配:本地盘(dev) 或 阿里云 OSS(生产)

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, createError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';
import { assertStudentAccess } from '../utils/access-control';
import { createInAppNotification } from '../utils/notifications';
import { Prisma } from '@prisma/client';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { getStorage } from '../utils/storage';

const FILE_TYPES = [
  'research_plan',
  'transcript',
  'recommendation',
  'language_score',
  'certificate',
  'professor_email',
  'application_receipt',
  'other',
];
const STUDENT_UPLOAD_TYPES = ['research_plan', 'transcript', 'recommendation', 'language_score', 'certificate'];

// 允许上传的扩展名白名单（小写，含点号）。
// 主动拒绝：.html/.htm/.svg/.js/.jsx/.ts/.tsx/.exe/.bat/.sh/.com 等
// 可被浏览器内联解析或可执行的类型，避免被当成"用户内容"误执行。
const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.txt', '.csv',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.zip',
]);

const FILE_TYPE_NAMES: Record<string, string> = {
  research_plan: '研究计划书',
  transcript: '成绩单',
  certificate: '证明文件',
  recommendation: '推荐信',
  language_score: '语言成绩证明',
  professor_email: '教授邮件截图',
  application_receipt: '出愿受理通知',
  other: '其他文件',
};

type FileWithRelations = Prisma.FileGetPayload<{
  include: {
    versions: {
      include: {
        uploader: { select: { id: true; name: true } };
        feedbacks: {
          include: {
            author: { select: { id: true; name: true } };
            resolvedByUser: { select: { id: true; name: true } };
          };
        };
      };
    };
    uploader: { select: { name: true } };
  };
}>;

function serializeFile(file: FileWithRelations) {
  // 版本按 versionNo 倒序;每个版本附带"本次修改说明"(notes) 和老师批注
  const versions = [...file.versions]
    .sort((a, b) => b.versionNo - a.versionNo)
    .map((version) => ({
      id: version.id,
      versionNo: version.versionNo,
      size: version.fileSize ? Number(version.fileSize) : 0,
      mimeType: version.mimeType,
      createdAt: version.uploadedAt,
      notes: version.notes ?? null,
      uploader: version.uploader,
      feedbacks: [...version.feedbacks]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((f) => ({
          id: f.id,
          content: f.content,
          status: f.status,
          createdAt: f.createdAt,
          resolvedAt: f.resolvedAt,
          author: f.author,
          resolvedByUser: f.resolvedByUser,
        })),
    }));
  const pendingFeedbackCount = versions.reduce(
    (sum, v) => sum + v.feedbacks.filter((f) => f.status === 'pending').length,
    0,
  );
  return {
    id: file.id,
    fileName: file.displayName,
    fileType: file.fileType,
    description: versions[0]?.notes ?? undefined,
    createdAt: file.createdAt,
    uploader: file.uploader,
    versions,
    pendingFeedbackCount,
  };
}

const FILE_WITH_RELATIONS_INCLUDE = {
  versions: {
    orderBy: { versionNo: 'desc' as const },
    include: {
      uploader: { select: { id: true, name: true } },
      feedbacks: {
        orderBy: { createdAt: 'asc' as const },
        include: {
          author: { select: { id: true, name: true } },
          resolvedByUser: { select: { id: true, name: true } },
        },
      },
    },
  },
  uploader: { select: { name: true } },
};

export async function fileRoutes(fastify: FastifyInstance): Promise<void> {
  const storage = getStorage();
  fastify.log.info({ driver: storage.driver }, '文件存储驱动已就绪');

  // GET /api/students/:id/files
  fastify.get(
    '/students/:id/files',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER, Roles.STUDENT])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      await assertStudentAccess(fastify, request.user as JwtPayload, id);

      const files = await fastify.prisma.file.findMany({
        where: { studentId: id },
        orderBy: { createdAt: 'desc' },
        include: FILE_WITH_RELATIONS_INCLUDE,
      });

      const grouped: Record<string, ReturnType<typeof serializeFile>[]> = {};
      for (const ft of FILE_TYPES) {
        grouped[ft] = [];
      }
      for (const file of files) {
        const ft = FILE_TYPES.includes(file.fileType) ? file.fileType : 'other';
        grouped[ft]!.push(serializeFile(file));
      }

      return reply.send({ data: grouped, typeNames: FILE_TYPE_NAMES });
    }
  );

  // POST /api/students/:id/files（multipart 上传）
  fastify.post(
    '/students/:id/files',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER, Roles.STUDENT])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id } = request.params as { id: string };
      await assertStudentAccess(fastify, user, id);

      const student = await fastify.prisma.student.findUnique({ where: { id } });
      if (!student) throw new AppError(ErrorCode.NOT_FOUND, '学生不存在', 404);

      // 1) 解析 multipart,把文件读成 Buffer(已经有 50MB 上限,见 index.ts)
      const parts = request.parts();
      let fileType = 'other';
      let description = '';
      let originalName = '';
      let mimeType = '';
      let buffer: Buffer | null = null;

      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'fileType' && FILE_TYPES.includes(String(part.value))) {
            fileType = String(part.value);
          }
          if (part.fieldname === 'description') {
            description = String(part.value);
          }
        } else if (part.type === 'file') {
          originalName = part.filename;
          mimeType = part.mimetype;
          buffer = await part.toBuffer();
        }
      }

      if (!buffer || !originalName) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '未上传文件', 400);
      }
      if (user.roles.includes(Roles.STUDENT) && !STUDENT_UPLOAD_TYPES.includes(fileType)) {
        throw new AppError(ErrorCode.FILE_TYPE_NOT_ALLOWED, '学生不能上传该类型文件');
      }
      const ext = path.extname(originalName).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        throw new AppError(
          ErrorCode.FILE_TYPE_NOT_ALLOWED,
          `不允许上传 ${ext || '该类型'} 文件`,
        );
      }

      // 2) 计算版本号(research_plan 累加)
      let versionNo = 1;
      if (fileType === 'research_plan') {
        const existing = await fastify.prisma.file.count({
          where: { studentId: id, fileType: 'research_plan' },
        });
        versionNo = existing + 1;
      }

      // 3) 落存储 → 落 DB。put 失败直接抛出;DB 写失败则同步把刚写入的对象删除以免泄漏。
      // ext 已在上方完成白名单校验，这里复用变量。
      const fileId = randomUUID();
      const putResult = await storage.put({
        studentId: id,
        fileId,
        ext,
        mimeType,
        body: buffer,
      });

      const displayName = description || originalName;
      let file: FileWithRelations;
      try {
        file = await fastify.prisma.file.create({
          data: {
            id: fileId,
            studentId: id,
            fileType,
            displayName,
            uploadedBy: user.sub,
            versions: {
              create: {
                versionNo,
                ossKey: putResult.storageKey,
                fileSize: BigInt(putResult.size),
                mimeType,
                uploadedBy: user.sub,
                notes: description || undefined,
              },
            },
          },
          include: FILE_WITH_RELATIONS_INCLUDE,
        });
      } catch (err) {
        // DB 失败 → 回滚刚写入存储的对象,避免成"孤儿文件"
        await storage.delete(putResult.storageKey).catch((cleanupErr) => {
          fastify.log.warn({ cleanupErr, key: putResult.storageKey }, '回滚孤儿文件失败');
        });
        throw err;
      }

      await fastify.prisma.operationLog.create({
        data: {
          studentId: id,
          actorId: user.sub,
          actorName: user.name,
          actionType: 'file_upload',
          targetType: 'file',
          targetId: file.id,
          detail: { fileId: file.id, fileType, displayName, versionNo } as any,
        },
      });

      return reply.status(201).send({ data: serializeFile(file), message: '文件上传成功' });
    }
  );

  // GET /api/students/:id/files/:fileId/versions/:versionId/download
  fastify.get(
    '/students/:id/files/:fileId/versions/:versionId/download',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER, Roles.STUDENT])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, fileId, versionId } = request.params as {
        id: string;
        fileId: string;
        versionId: string;
      };
      await assertStudentAccess(fastify, request.user as JwtPayload, id);

      const file = await fastify.prisma.file.findFirst({
        where: { id: fileId, studentId: id },
        include: {
          versions: { where: { id: versionId } },
        },
      });
      const version = file?.versions[0];
      if (!file || !version) {
        throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404);
      }

      const user = request.user as JwtPayload;
      await fastify.prisma.operationLog.create({
        data: {
          studentId: id,
          actorId: user.sub,
          actorName: user.name,
          actionType: 'file_download',
          targetType: 'file',
          targetId: fileId,
          detail: {
            fileId,
            versionId,
            displayName: file.displayName,
            versionNo: version.versionNo,
          } as any,
        },
      });

      const got = await storage.get(version.ossKey, file.displayName);
      // OSS: 302 到带签名的临时 URL,客户端直连下载,省后端带宽
      if (got.signedUrl) {
        return reply.redirect(302, got.signedUrl);
      }
      // 本地: 直接流回。强制 octet-stream + nosniff，避免浏览器对存储里
      // 任何用户上传的文件做内联渲染/嗅探（即使白名单已限制了上传扩展名）。
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('X-Content-Type-Options', 'nosniff')
        .header(
          'Content-Length',
          (version.fileSize ?? got.contentLength ?? '')?.toString() ?? undefined,
        )
        .header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(file.displayName)}`,
        )
        .send(got.stream);
    },
  );

  // DELETE /api/students/:id/files/:fileId
  fastify.delete(
    '/students/:id/files/:fileId',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER, Roles.STUDENT])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id, fileId } = request.params as { id: string; fileId: string };
      await assertStudentAccess(fastify, user, id);

      const file = await fastify.prisma.file.findFirst({
        where: { id: fileId, studentId: id },
        include: { versions: true },
      });
      if (!file) {
        throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404);
      }

      if (user.roles.includes(Roles.STUDENT) && file.uploadedBy !== user.sub) {
        throw new AppError(ErrorCode.FORBIDDEN, '只能删除自己上传的文件', 403);
      }

      await fastify.prisma.$transaction(async (tx) => {
        await tx.fileVersion.deleteMany({ where: { fileId } });
        await tx.file.delete({ where: { id: fileId } });
        await tx.operationLog.create({
          data: {
            studentId: id,
            actorId: user.sub,
            actorName: user.name,
            actionType: 'file_delete',
            targetType: 'file',
            targetId: fileId,
            detail: {
              fileId,
              displayName: file.displayName,
              fileType: file.fileType,
              versionCount: file.versions.length,
            } as any,
          },
        });
      });

      // DB 行已删,再清理对象;失败只记录日志,不影响响应。
      for (const version of file.versions) {
        try {
          await storage.delete(version.ossKey);
        } catch (err) {
          fastify.log.warn({ err, fileId, versionId: version.id }, '文件实体删除失败');
        }
      }

      return reply.send({ message: '文件已删除' });
    },
  );

  // ─── 批注反馈 ──────────────────────────────────────────────
  const feedbackBodySchema = z.object({
    content: z.string().min(1, '反馈内容不能为空').max(2000, '反馈过长'),
  });

  // POST /api/students/:id/files/:fileId/versions/:versionId/feedback
  //   老师/学科负责人/教务总负责人对某一版本写批注。
  fastify.post(
    '/students/:id/files/:fileId/versions/:versionId/feedback',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id, fileId, versionId } = request.params as {
        id: string;
        fileId: string;
        versionId: string;
      };
      await assertStudentAccess(fastify, user, id);

      const parsed = feedbackBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '参数错误', parsed.error.flatten());
      }

      // 验版本归属
      const version = await fastify.prisma.fileVersion.findFirst({
        where: { id: versionId, fileId, file: { studentId: id } },
        include: { file: { include: { student: { select: { userId: true } } } } },
      });
      if (!version) {
        throw createError.notFound('文件版本', versionId);
      }

      const feedback = await fastify.prisma.fileFeedback.create({
        data: {
          fileId,
          versionId,
          authorId: user.sub,
          content: parsed.data.content,
          status: 'pending',
        },
        include: {
          author: { select: { id: true, name: true } },
          resolvedByUser: { select: { id: true, name: true } },
        },
      });

      // 通知学生
      await createInAppNotification(fastify.prisma, {
        userId: version.file.student.userId,
        type: 'file_feedback',
        title: '收到老师对文书的批注',
        content: `${user.name} 对《${version.file.displayName}》第 ${version.versionNo} 版写了批注，请查看并处理。`,
        relatedId: fileId,
      });

      await fastify.prisma.operationLog.create({
        data: {
          studentId: id,
          actorId: user.sub,
          actorName: user.name,
          actionType: 'file_feedback_create',
          targetType: 'file_feedback',
          targetId: feedback.id,
          detail: { fileId, versionId, versionNo: version.versionNo } as any,
        },
      });

      return reply.status(201).send({ data: feedback, message: '批注已发送' });
    },
  );

  // PATCH /api/students/:id/files/:fileId/feedback/:feedbackId/resolve
  //   学生或老师标记反馈"已处理"（学生处理意味着已采纳；老师可代关闭）
  fastify.patch(
    '/students/:id/files/:fileId/feedback/:feedbackId/resolve',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER, Roles.STUDENT]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id, fileId, feedbackId } = request.params as {
        id: string;
        fileId: string;
        feedbackId: string;
      };
      await assertStudentAccess(fastify, user, id);

      const feedback = await fastify.prisma.fileFeedback.findFirst({
        where: { id: feedbackId, fileId, version: { file: { studentId: id } } },
        include: { author: { select: { id: true } } },
      });
      if (!feedback) {
        throw createError.notFound('批注', feedbackId);
      }
      if (feedback.status === 'resolved') {
        return reply.send({ data: feedback, message: '批注已是已处理状态' });
      }

      const updated = await fastify.prisma.fileFeedback.update({
        where: { id: feedbackId },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: user.sub,
        },
        include: {
          author: { select: { id: true, name: true } },
          resolvedByUser: { select: { id: true, name: true } },
        },
      });

      // 通知原作者(老师)
      if (feedback.author.id !== user.sub) {
        await createInAppNotification(fastify.prisma, {
          userId: feedback.author.id,
          type: 'file_feedback_resolved',
          title: '文书批注已处理',
          content: `${user.name} 已处理你的文书批注。`,
          relatedId: fileId,
        });
      }

      await fastify.prisma.operationLog.create({
        data: {
          studentId: id,
          actorId: user.sub,
          actorName: user.name,
          actionType: 'file_feedback_resolve',
          targetType: 'file_feedback',
          targetId: feedbackId,
          detail: { fileId, feedbackId } as any,
        },
      });

      return reply.send({ data: updated, message: '已标记为已处理' });
    },
  );

  // DELETE /api/students/:id/files/:fileId/feedback/:feedbackId
  //   仅作者可删除自己的 pending 批注;resolved 后保留作为审计
  fastify.delete(
    '/students/:id/files/:fileId/feedback/:feedbackId',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id, fileId, feedbackId } = request.params as {
        id: string;
        fileId: string;
        feedbackId: string;
      };
      await assertStudentAccess(fastify, user, id);

      const feedback = await fastify.prisma.fileFeedback.findFirst({
        where: { id: feedbackId, fileId, version: { file: { studentId: id } } },
      });
      if (!feedback) {
        throw createError.notFound('批注', feedbackId);
      }
      const isAdmin = user.roles.includes(Roles.ADMIN_TOTAL);
      if (feedback.authorId !== user.sub && !isAdmin) {
        throw createError.forbidden('只能删除自己的批注');
      }
      if (feedback.status === 'resolved') {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          '已处理的批注不可删除（保留为审计记录）',
        );
      }

      await fastify.prisma.fileFeedback.delete({ where: { id: feedbackId } });

      await fastify.prisma.operationLog.create({
        data: {
          studentId: id,
          actorId: user.sub,
          actorName: user.name,
          actionType: 'file_feedback_delete',
          targetType: 'file_feedback',
          targetId: feedbackId,
          detail: { fileId, feedbackId } as any,
        },
      });

      return reply.send({ message: '批注已删除' });
    },
  );
}
