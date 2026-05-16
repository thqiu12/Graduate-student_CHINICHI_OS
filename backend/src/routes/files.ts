// src/routes/files.ts
// 知日塾大学院考学进度管理系统 - 文件管理路由

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';

const UPLOAD_DIR = '/home/work/uploads';
const FILE_TYPES = ['research_plan', 'transcript', 'certificate', 'other'];
const FILE_TYPE_NAMES: Record<string, string> = {
  research_plan: '研究计划书',
  transcript: '成绩单',
  certificate: '证明文件',
  other: '其他文件',
};

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

      const files = await fastify.prisma.file.findMany({
        where: { studentId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          versions: { orderBy: { versionNo: 'desc' } },
          uploader: { select: { name: true } },
        },
      });

      // 按 fileType 分组
      const grouped: Record<string, typeof files> = {};
      for (const ft of FILE_TYPES) {
        grouped[ft] = [];
      }
      for (const file of files) {
        const ft = FILE_TYPES.includes(file.fileType) ? file.fileType : 'other';
        grouped[ft]!.push(file);
      }

      return reply.send({ data: grouped, typeNames: FILE_TYPE_NAMES });
    }
  );

  // POST /api/students/:id/files（multipart 上传）
  fastify.post(
    '/students/:id/files',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const { id } = request.params as { id: string };

      const student = await fastify.prisma.student.findUnique({ where: { id } });
      if (!student) throw new AppError(ErrorCode.NOT_FOUND, '学生不存在', 404);

      const parts = request.parts();
      let fileType = 'other';
      let description = '';
      let savedPath = '';
      let originalName = '';
      let fileSize = 0;

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
          const writeStream = fs.createWriteStream(savedPath);
          await pipeline(part.file, writeStream);
          fileSize = fs.statSync(savedPath).size;
        }
      }

      if (!savedPath) throw new AppError(ErrorCode.VALIDATION_ERROR, '未上传文件', 400);

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

      return reply.status(201).send(file);
    }
  );
}
