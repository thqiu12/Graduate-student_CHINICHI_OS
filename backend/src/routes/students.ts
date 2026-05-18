// src/routes/students.ts
// 知日塾大学院考学进度管理系统 - 学生管理路由
// 包含：CRUD + 批量导入接口骨架

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, createError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';
import { assertStudentAccess, buildStudentScopeWhere } from '../utils/access-control';

// ─── 请求体 Schema ───────────────────────────────────────
const createStudentSchema = z.object({
  name: z.string().min(1, '姓名不能为空'),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  campusId: z.number().int().positive(),
  subjectId: z.number().int().positive(),
  teacherId: z.string().uuid('班主任ID格式不正确').optional(),
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
  targetSeason: z.string().optional(),
  search: z.string().optional(),
  page: z.string().optional().transform(Number).default('1'),
  pageSize: z.string().optional().transform(Number).default('20'),
});

type CreateStudentBody = z.infer<typeof createStudentSchema>;
type UpdateStudentBody = z.infer<typeof updateStudentSchema>;
type ImportStudentRow = CreateStudentBody & { rowNumber: number };

interface StudentParams {
  id: string;
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function mapImportRows(csvText: string): ImportStudentRow[] {
  const rows = parseCsv(csvText);
  const [header, ...bodyRows] = rows;
  if (!header) return [];

  const headerMap = new Map(header.map((name, index) => [name, index]));
  const pick = (row: string[], keys: string[]) => {
    const index = keys.map((key) => headerMap.get(key)).find((idx) => idx !== undefined);
    return index === undefined ? undefined : row[index];
  };

  return bodyRows.map((row, idx) => ({
    rowNumber: idx + 2,
    name: pick(row, ['name', '姓名']) ?? '',
    phone: pick(row, ['phone', '手机号']) ?? '',
    campusId: Number(pick(row, ['campusId', '校区ID'])),
    subjectId: Number(pick(row, ['subjectId', '学科ID'])),
    teacherId: pick(row, ['teacherId', '班主任ID']),
    entryDate: pick(row, ['entryDate', '入学日期']) ?? '',
    targetYear: pick(row, ['targetYear', '目标年份']),
    targetSeason: pick(row, ['targetSeason', '目标考季']),
    jlptLevel: pick(row, ['jlptLevel', 'JLPT等级']),
    jlptScore: pick(row, ['jlptScore', 'JLPT分数']) ? Number(pick(row, ['jlptScore', 'JLPT分数'])) : undefined,
    undergradMajor: pick(row, ['undergradMajor', '本科专业']),
    undergradGpa: pick(row, ['undergradGpa', '本科GPA']) ? Number(pick(row, ['undergradGpa', '本科GPA'])) : undefined,
    notes: pick(row, ['notes', '备注']),
  }));
}

async function assertCanUseSubject(
  fastify: FastifyInstance,
  user: JwtPayload,
  subjectId: number,
): Promise<void> {
  if (user.roles.includes(Roles.ADMIN_TOTAL)) return;
  if (user.roles.includes(Roles.SUBJECT_HEAD)) {
    const role = await fastify.prisma.userRole.findFirst({
      where: {
        userId: user.sub,
        subjectId,
        role: { code: Roles.SUBJECT_HEAD },
      },
    });
    if (role) return;
  }
  if (user.roles.includes(Roles.TEACHER)) return;
  throw createError.forbidden('无权创建或修改该学科学生');
}

async function assertTeacherUser(
  fastify: FastifyInstance,
  teacherId: string,
): Promise<void> {
  const teacher = await fastify.prisma.user.findFirst({
    where: {
      id: teacherId,
      isActive: true,
      userRoles: { some: { role: { code: Roles.TEACHER } } },
    },
    select: { id: true },
  });
  if (!teacher) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, '班主任不存在或不是有效班主任账号');
  }
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

      const whereClause: Record<string, unknown> = await buildStudentScopeWhere(fastify, user);

      if (query.campusId) whereClause['campusId'] = query.campusId;
      if (query.subjectId) {
        const scopedSubject = whereClause['subjectId'] as { in?: number[] } | number | undefined;
        if (typeof scopedSubject === 'object' && scopedSubject?.in) {
          whereClause['subjectId'] = scopedSubject.in.includes(query.subjectId) ? query.subjectId : -1;
        } else {
          whereClause['subjectId'] = query.subjectId;
        }
      }
      if (query.teacherId && !user.roles.includes(Roles.TEACHER)) {
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
      if (query.targetSeason) {
        whereClause['targetSeason'] = query.targetSeason;
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
              where: { status: { in: ['pending', 'change_pending', 'active'] } },
              take: 3,
              orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
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

  // GET /api/students/export - 导出学生 CSV
  fastify.get(
    '/students/export',
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
      const whereClause = await buildStudentScopeWhere(fastify, user);

      const students = await fastify.prisma.student.findMany({
        where: whereClause,
        include: {
          user: { select: { name: true, phone: true, email: true } },
          campus: true,
          subject: true,
          teachers: {
            where: { endedAt: null },
            include: { teacher: { select: { name: true } } },
            take: 1,
          },
          riskTags: {
            where: { removedAt: null },
            include: { tag: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const header = [
        '学生ID',
        '姓名',
        '手机号',
        '邮箱',
        '校区',
        '学科',
        '班主任',
        '入学日期',
        '目标年份',
        '目标考季',
        'JLPT等级',
        'JLPT分数',
        '本科专业',
        '本科GPA',
        '风险标签',
        '备注',
      ];
      const rows = students.map((student) => [
        student.id,
        student.user.name,
        student.user.phone,
        student.user.email,
        student.campus?.name,
        student.subject?.name,
        student.teachers[0]?.teacher.name,
        student.entryDate?.toISOString().slice(0, 10),
        student.targetYear,
        student.targetSeason,
        student.jlptLevel,
        student.jlptScore,
        student.undergradMajor,
        student.undergradGpa,
        student.riskTags.map((risk) => risk.tag.label).join(';'),
        student.notes,
      ]);

      const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="students-${new Date().toISOString().slice(0, 10)}.csv"`)
        .send(`\uFEFF${csv}`);
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

      await assertStudentAccess(fastify, user, id);

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

      const safeStudent = user.roles.includes(Roles.STUDENT)
        ? {
            ...student,
            periodPlans: student.periodPlans.map((plan) => ({
              ...plan,
              tasks: plan.status === 'active' ? plan.tasks : [],
            })),
          }
        : student;

      return reply.send({ data: safeStudent });
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
      const user = request.user as JwtPayload;
      await assertCanUseSubject(fastify, user, body.subjectId);

      const isOnlyTeacher = user.roles.includes(Roles.TEACHER) &&
        !user.roles.includes(Roles.SUBJECT_HEAD) &&
        !user.roles.includes(Roles.ADMIN_TOTAL);
      const teacherId = isOnlyTeacher
        ? user.sub
        : body.teacherId ?? (user.roles.includes(Roles.TEACHER) ? user.sub : null);
      if (!teacherId) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '请选择班主任');
      }
      await assertTeacherUser(fastify, teacherId);

      // 检查手机号是否已存在
      const existingUser = await fastify.prisma.user.findUnique({
        where: { phone: body.phone },
      });
      if (existingUser) {
        throw new AppError(ErrorCode.USER_ALREADY_EXISTS, `手机号 ${body.phone} 已被注册`);
      }

      // 事务创建用户和学生档案
      const result = await fastify.prisma.$transaction(async (tx) => {
        const studentRole = await tx.role.findUnique({ where: { code: Roles.STUDENT } });
        if (!studentRole) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, '学生角色未初始化');
        }

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
            roleId: studentRole.id,
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
            teacherId,
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
      await assertStudentAccess(fastify, request.user as JwtPayload, id);
      if (body.subjectId !== undefined) {
        await assertCanUseSubject(fastify, request.user as JwtPayload, body.subjectId);
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
      await assertStudentAccess(fastify, user, id);

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

  // POST /api/students/import - CSV 批量导入
  fastify.post(
    '/students/import',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as JwtPayload;
      const parts = request.parts();
      let csvText = '';

      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          csvText = buffer.toString('utf8').replace(/^\uFEFF/, '');
          break;
        }
      }

      if (!csvText) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '请上传 CSV 文件');
      }

      const rows = mapImportRows(csvText);
      if (rows.length === 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'CSV 中没有可导入的数据');
      }

      const errors: Array<{ rowNumber: number; message: string }> = [];
      const validRows: Array<CreateStudentBody & { rowNumber: number; teacherId: string }> = [];
      for (const row of rows) {
        const parsed = createStudentSchema.safeParse(row);
        if (!parsed.success) {
          errors.push({ rowNumber: row.rowNumber, message: parsed.error.errors[0]?.message ?? '数据格式错误' });
        } else if (!parsed.data.teacherId) {
          errors.push({ rowNumber: row.rowNumber, message: '批量导入必须提供班主任ID' });
        } else {
          validRows.push({ ...parsed.data, rowNumber: row.rowNumber, teacherId: parsed.data.teacherId });
        }
      }

      const phones = validRows.map((row) => row.phone);
      const teacherIds = [...new Set(validRows.map((row) => row.teacherId))];
      const existingUsers = phones.length
        ? await fastify.prisma.user.findMany({
            where: { phone: { in: phones } },
            select: { phone: true },
          })
        : [];
      const teachers = teacherIds.length
        ? await fastify.prisma.user.findMany({
            where: {
              id: { in: teacherIds },
              isActive: true,
              userRoles: { some: { role: { code: Roles.TEACHER } } },
            },
            select: { id: true },
          })
        : [];
      const existingPhones = new Set(existingUsers.map((u) => u.phone));
      const validTeacherIds = new Set(teachers.map((teacher) => teacher.id));
      const duplicatePhones = new Set(phones.filter((phone, idx) => phones.indexOf(phone) !== idx));

      validRows.forEach((row) => {
        if (existingPhones.has(row.phone)) {
          errors.push({ rowNumber: row.rowNumber, message: `手机号 ${row.phone} 已存在` });
        }
        if (duplicatePhones.has(row.phone)) {
          errors.push({ rowNumber: row.rowNumber, message: `手机号 ${row.phone} 在导入文件中重复` });
        }
        if (!validTeacherIds.has(row.teacherId)) {
          errors.push({ rowNumber: row.rowNumber, message: `班主任ID ${row.teacherId} 不存在或不是有效班主任账号` });
        }
      });

      if (errors.length > 0) {
        return reply.status(400).send({
          code: 'IMPORT_VALIDATION_ERROR',
          message: '导入数据存在错误，请修正后重试',
          errors,
        });
      }

      const result = await fastify.prisma.$transaction(async (tx) => {
        const studentRole = await tx.role.findUnique({ where: { code: Roles.STUDENT } });
        if (!studentRole) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, '学生角色未初始化');
        }

        const created = [];
        for (const row of validRows) {
          const newUser = await tx.user.create({
            data: {
              name: row.name,
              phone: row.phone,
              isActive: true,
            },
          });

          await tx.userRole.create({
            data: {
              userId: newUser.id,
              roleId: studentRole.id,
            },
          });

          const student = await tx.student.create({
            data: {
              userId: newUser.id,
              campusId: row.campusId,
              subjectId: row.subjectId,
              entryDate: new Date(row.entryDate),
              targetYear: row.targetYear,
              targetSeason: row.targetSeason,
              jlptLevel: row.jlptLevel,
              jlptScore: row.jlptScore,
              undergradMajor: row.undergradMajor,
              undergradGpa: row.undergradGpa,
              notes: row.notes,
            },
          });

          await tx.studentTeacher.create({
            data: {
              studentId: student.id,
              teacherId: row.teacherId,
            },
          });

          created.push(student);
        }

        await tx.operationLog.create({
          data: {
            actorId: user.sub,
            actorName: user.name,
            actionType: 'students_import',
            targetType: 'student',
            detail: { count: created.length } as any,
          },
        });

        return created;
      });

      return reply.status(201).send({
        data: { imported: result.length },
        message: `成功导入 ${result.length} 名学生`,
      });
    },
  );
}
