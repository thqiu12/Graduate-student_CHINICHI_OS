// src/routes/students.ts
// 知日塾大学院考学进度管理系统 - 学生管理路由
// 包含：CRUD + 批量导入接口骨架

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, createError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';

// ─── 请求体 Schema ───────────────────────────────────────
const createStudentSchema = z.object({
  name: z.string().min(1, '姓名不能为空'),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  campusId: z.number().int().positive(),
  subjectId: z.number().int().positive(),
  teacherId: z.string().uuid('班主任ID格式不正确'),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
  targetYear: z.string().optional(),
  targetSeason: z.string().optional(),
  jlptLevel: z.string().optional(),
  jlptScore: z.number().int().optional(),
  undergradMajor: z.string().optional(),
  undergradGpa: z.number().min(0).max(4).optional(),
  notes: z.string().optional(),
});

const updateStudentSchema = createStudentSchema.partial().omit({ phone: true, teacherId: true });

const listQuerySchema = z.object({
  campusId: z.string().optional().transform(Number),
  subjectId: z.string().optional().transform(Number),
  teacherId: z.string().optional(),
  status: z.string().optional(),
  riskTagCode: z.string().optional(),
  search: z.string().optional(),
  page: z.string().optional().transform(Number).default('1'),
  pageSize: z.string().optional().transform(Number).default('20'),
});

type CreateStudentBody = z.infer<typeof createStudentSchema>;
type UpdateStudentBody = z.infer<typeof updateStudentSchema>;

interface StudentParams {
  id: string;
}

// ─── 路由注册函数 ─────────────────────────────────────────
export async function studentRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/students - 学生列表（支持筛选）
  fastify.get(
    '/students',
    {
      preHandler: [
        authenticate,
        authorize([
          Roles.ADMIN_TOTAL,
          Roles.SUBJECT_HEAD,
          Roles.TEACHER,
        ]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const query = listQuerySchema.parse(request.query);

      const whereClause: Record<string, unknown> = {};

      // 教务总负责人可查看全部学生
      // 学科负责人只能查看本学科学生
      // 班主任只能查看自己负责的学生
      if (user.roles.includes(Roles.TEACHER) && !user.roles.includes(Roles.ADMIN_TOTAL) && !user.roles.includes(Roles.SUBJECT_HEAD)) {
        whereClause['teachers'] = {
          some: { teacherId: user.sub, endedAt: null },
        };
      }

      if (query.campusId) whereClause['campusId'] = query.campusId;
      if (query.subjectId) whereClause['subjectId'] = query.subjectId;
      if (query.teacherId) {
        whereClause['teachers'] = {
          some: { teacherId: query.teacherId, endedAt: null },
        };
      }
      if (query.riskTagCode) {
        whereClause['riskTags'] = {
          some: {
            tag: { code: query.riskTagCode },
            removedAt: null,
          },
        };
      }
      if (query.search) {
        whereClause['user'] = {
          name: { contains: query.search, mode: 'insensitive' },
        };
      }

      const page = isNaN(query.page) ? 1 : query.page;
      const pageSize = isNaN(query.pageSize) ? 20 : query.pageSize;

      const [total, students] = await Promise.all([
        fastify.prisma.student.count({ where: whereClause }),
        fastify.prisma.student.findMany({
          where: whereClause,
          include: {
            user: { select: { id: true, name: true, phone: true, avatarUrl: true } },
            campus: true,
            subject: true,
            teachers: {
              where: { endedAt: null },
              include: { teacher: { select: { id: true, name: true } } },
              take: 1,
            },
            riskTags: {
              where: { removedAt: null },
              include: { tag: true },
            },
            periodPlans: {
              where: { status: 'active' },
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      return reply.send({
        data: students,
        pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      });
    },
  );

  // GET /api/students/:id - 学生详情
  fastify.get<{ Params: StudentParams }>(
    '/students/:id',
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
      request: FastifyRequest<{ Params: StudentParams }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const user = request.user as JwtPayload;

      // 学生只能查看自己
      if (user.roles.includes(Roles.STUDENT)) {
        const student = await fastify.prisma.student.findFirst({
          where: { id, userId: user.sub },
        });
        if (!student) {
          throw createError.forbidden('只能查看自己的档案');
        }
      }

      const student = await fastify.prisma.student.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true, phone: true, email: true, avatarUrl: true } },
          campus: true,
          subject: true,
          teachers: {
            orderBy: { startedAt: 'desc' },
            include: { teacher: { select: { id: true, name: true } } },
          },
          riskTags: {
            include: { tag: true, taggedByUser: { select: { id: true, name: true } } },
          },
          periodPlans: {
            orderBy: [{ periodCode: 'asc' }, { version: 'desc' }],
            include: { tasks: { orderBy: { sortOrder: 'asc' } } },
          },
          targetSchools: {
            include: { progressNodes: true, innoTracking: true },
          },
          coachingRecords: {
            orderBy: { coachedAt: 'desc' },
            take: 10,
          },
          files: {
            include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
          },
        },
      });

      if (!student) {
        throw createError.studentNotFound(id);
      }

      return reply.send({ data: student });
    },
  );

  // POST /api/students - 新增学生
  fastify.post<{ Body: CreateStudentBody }>(
    '/students',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER]),
      ],
    },
    async (
      request: FastifyRequest<{ Body: CreateStudentBody }>,
      reply: FastifyReply,
    ) => {
      const parsed = createStudentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '请求参数错误', parsed.error.flatten());
      }
      const body = parsed.data;

      // 检查手机号是否已存在
      const existingUser = await fastify.prisma.user.findUnique({
        where: { phone: body.phone },
      });
      if (existingUser) {
        throw new AppError(ErrorCode.USER_ALREADY_EXISTS, `手机号 ${body.phone} 已被注册`);
      }

      // 事务创建用户和学生档案
      const result = await fastify.prisma.$transaction(async (tx) => {
        // 创建用户账号
        const newUser = await tx.user.create({
          data: {
            name: body.name,
            phone: body.phone,
            isActive: true,
          },
        });

        // 分配学生角色
        await tx.userRole.create({
          data: {
            userId: newUser.id,
            roleId: 4, // student role
          },
        });

        // 创建学生档案
        const student = await tx.student.create({
          data: {
            userId: newUser.id,
            campusId: body.campusId,
            subjectId: body.subjectId,
            entryDate: new Date(body.entryDate),
            targetYear: body.targetYear,
            targetSeason: body.targetSeason,
            jlptLevel: body.jlptLevel,
            jlptScore: body.jlptScore,
            undergradMajor: body.undergradMajor,
            undergradGpa: body.undergradGpa,
            notes: body.notes,
          },
        });

        // 关联班主任
        await tx.studentTeacher.create({
          data: {
            studentId: student.id,
            teacherId: body.teacherId,
          },
        });

        return { user: newUser, student };
      });

      return reply.status(201).send({ data: result, message: '学生档案创建成功' });
    },
  );

  // PATCH /api/students/:id - 更新学生信息
  fastify.patch<{ Params: StudentParams; Body: UpdateStudentBody }>(
    '/students/:id',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER]),
      ],
    },
    async (
      request: FastifyRequest<{ Params: StudentParams; Body: UpdateStudentBody }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const parsed = updateStudentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '请求参数错误', parsed.error.flatten());
      }
      const body = parsed.data;

      const student = await fastify.prisma.student.findUnique({ where: { id } });
      if (!student) {
        throw createError.studentNotFound(id);
      }

      const updated = await fastify.prisma.student.update({
        where: { id },
        data: {
          campusId: body.campusId,
          subjectId: body.subjectId,
          entryDate: body.entryDate ? new Date(body.entryDate) : undefined,
          targetYear: body.targetYear,
          targetSeason: body.targetSeason,
          jlptLevel: body.jlptLevel,
          jlptScore: body.jlptScore,
          undergradMajor: body.undergradMajor,
          undergradGpa: body.undergradGpa,
          notes: body.notes,
        },
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
      });

      return reply.send({ data: updated, message: '学生信息更新成功' });
    },
  );

  // POST /api/students/:id/teacher - 变更班主任
  fastify.post<{
    Params: StudentParams;
    Body: { teacherId: string; changeReason: string };
  }>(
    '/students/:id/teacher',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD]),
      ],
    },
    async (
      request: FastifyRequest<{
        Params: StudentParams;
        Body: { teacherId: string; changeReason: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { teacherId, changeReason } = request.body;
      const user = request.user as JwtPayload;

      const student = await fastify.prisma.student.findUnique({ where: { id } });
      if (!student) {
        throw createError.studentNotFound(id);
      }

      await fastify.prisma.$transaction(async (tx) => {
        // 关闭旧的班主任关联
        await tx.studentTeacher.updateMany({
          where: { studentId: id, endedAt: null },
          data: { endedAt: new Date() },
        });

        // 创建新的班主任关联
        await tx.studentTeacher.create({
          data: {
            studentId: id,
            teacherId,
            changedBy: user.sub,
            changeReason,
          },
        });

        // 写操作日志
        await tx.operationLog.create({
          data: {
            studentId: id,
            actorId: user.sub,
            actorName: user.name,
            actionType: 'teacher_change',
            targetType: 'student_teacher',
            detail: { newTeacherId: teacherId, changeReason },
          },
        });
      });

      return reply.send({ message: '班主任变更成功' });
    },
  );

  // POST /api/students/import - Excel 批量导入（骨架）
  fastify.post(
    '/students/import',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD]),
      ],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // TODO: 实现 Excel 解析逻辑（使用 xlsx 库）
      // 1. 解析上传的 .xlsx 文件
      // 2. 验证每行数据格式
      // 3. 预览并返回异常行
      // 4. 确认后批量创建学生档案
      return reply.status(501).send({
        code: 'NOT_IMPLEMENTED',
        message: 'Excel 批量导入功能待实现（Phase 4）',
      });
    },
  );
}
