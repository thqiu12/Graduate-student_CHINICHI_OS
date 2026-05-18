// src/routes/files.ts
// 知日塾大学院考学进度管理系统 - 文件管理路由

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';
import { assertStudentAccess } from '../utils/access-control';
import { Prisma } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';

const UPLOAD_DIR = process.env['UPLOAD_DIR'] ?? path.resolve(process.cwd(), 'uploads');
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

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function fileRoutes(fastify: FastifyInstance): Promise<void> {
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

      // 按 fileType 分组
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

      const parts = request.parts();
      let fileType = 'other';
      let description = '';
      let savedPath = '';
      let originalName = '';
      let fileSize = 0;
      let mimeType = '';

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
          const ext = path.extname(originalName);
          const safeName = `${id}_${Date.now()}${ext}`;
          savedPath = path.join(UPLOAD_DIR, safeName);
          mimeType = part.mimetype;
          const writeStream = fs.createWriteStream(savedPath);
          await pipeline(part.file, writeStream);
          fileSize = fs.statSync(savedPath).size;
        }
      }

      if (!savedPath) throw new AppError(ErrorCode.VALIDATION_ERROR, '未上传文件', 400);
      if (user.roles.includes(Roles.STUDENT) && !STUDENT_UPLOAD_TYPES.includes(fileType)) {
        if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
        throw new AppError(ErrorCode.FILE_TYPE_NOT_ALLOWED, '学生不能上传该类型文件');
      }

      // 计算版本号（research_plan 累加）
      let versionNo = 1;
      if (fileType === 'research_plan') {
        const existing = await fastify.prisma.file.count({
          where: { studentId: id, fileType: 'research_plan' },
        });
        versionNo = existing + 1;
      }

      const displayName = description || originalName;
      const file = await fastify.prisma.file.create({
        data: {
          studentId: id,
          fileType,
          displayName,
          uploadedBy: user.sub,
          versions: {
            create: {
              versionNo,
              ossKey: savedPath,
              fileSize: BigInt(fileSize),
              mimeType,
              uploadedBy: user.sub,
              notes: description || undefined,
            },
          },
        },
        include: { versions: true, uploader: { select: { name: true } } },
      });

      await fastify.prisma.operationLog.create({
        data: {
          studentId: id,
          actorId: user.sub,
          actionType: 'file_upload',
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

      if (!fs.existsSync(version.ossKey)) {
        throw new AppError(ErrorCode.NOT_FOUND, '文件实体不存在，请联系管理员重新上传', 404);
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

      return reply
        .header('Content-Type', version.mimeType ?? 'application/octet-stream')
        .header('Content-Length', version.fileSize?.toString() ?? undefined)
        .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.displayName)}`)
        .send(fs.createReadStream(version.ossKey));
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

      for (const version of file.versions) {
        if (fs.existsSync(version.ossKey)) {
          try {
            fs.unlinkSync(version.ossKey);
          } catch (err) {
            fastify.log.warn({ err, fileId, versionId: version.id }, '文件实体删除失败');
          }
        }
      }

      return reply.send({ message: '文件已删除' });
    },
  );
}
