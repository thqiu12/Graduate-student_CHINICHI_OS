// src/routes/files.ts
// 知日塾大学院考学进度管理系统 - 文件管理路由
// 存储后端通过 utils/storage 适配:本地盘(dev) 或 阿里云 OSS(生产)

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';
import { assertStudentAccess } from '../utils/access-control';
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
    versions: true;
    uploader: { select: { name: true } };
  };
}>;

function serializeFile(file: FileWithRelations) {
  return {
    id: file.id,
    fileName: file.displayName,
    fileType: file.fileType,
    description: file.versions[0]?.notes ?? undefined,
    createdAt: file.createdAt,
    uploader: file.uploader,
    versions: file.versions.map((version) => ({
      id: version.id,
      versionNo: version.versionNo,
      size: version.fileSize ? Number(version.fileSize) : 0,
      mimeType: version.mimeType,
      createdAt: version.uploadedAt,
    })),
  };
}

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
        include: {
          versions: { orderBy: { versionNo: 'desc' } },
          uploader: { select: { name: true } },
        },
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

      // 2) 计算版本号(research_plan 累加)
      let versionNo = 1;
      if (fileType === 'research_plan') {
        const existing = await fastify.prisma.file.count({
          where: { studentId: id, fileType: 'research_plan' },
        });
        versionNo = existing + 1;
      }

      // 3) 落存储 → 落 DB。put 失败直接抛出;DB 写失败则同步把刚写入的对象删除以免泄漏。
      const ext = path.extname(originalName);
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
          include: { versions: true, uploader: { select: { name: true } } },
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
      // 本地: 直接流回
      return reply
        .header('Content-Type', version.mimeType ?? 'application/octet-stream')
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
}
