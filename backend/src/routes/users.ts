// src/routes/users.ts
// 知日塾大学院考学进度管理系统 - 用户管理路由
// 包含：用户CRUD、角色列表、校区列表、学科列表

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';
import { AppError, createError, ErrorCode } from '../utils/errors';
import { JwtPayload } from '../plugins/auth';

// ─── 请求参数 Schema ─────────────────────────────────────

const listUsersQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  pageSize: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20)),
  role: z.string().optional(),
  keyword: z.string().optional(),
});

const createUserSchema = z.object({
  name: z.string().min(1, '姓名不能为空').max(50, '姓名不超过50个字符'),
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  password: z.string().min(6, '密码至少6位'),
  roleCode: z.string().min(1, '角色不能为空'),
  campusId: z.number().int().positive().optional(),
  subjectId: z.number().int().positive().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, '手机号格式不正确')
    .optional(),
  password: z.string().min(6).optional(),
  isActive: z.boolean().optional(),
  roleCode: z.string().min(1).optional(),
  campusId: z.number().int().positive().nullable().optional(),
  subjectId: z.number().int().positive().nullable().optional(),
});

interface UserParams {
  id: string;
}

function serializeUser(user: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
  userRoles: Array<{
    role: { code: string; name: string };
    campus: { id: number; name: string } | null;
    subject: { id: number; name: string } | null;
  }>;
}) {
  const primaryRole = user.userRoles[0] ?? null;
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    avatarUrl: user.avatarUrl,
    roles: user.userRoles.map((ur) => ur.role.code),
    roleCode: primaryRole?.role.code ?? null,
    roleName: primaryRole?.role.name ?? null,
    campusId: primaryRole?.campus?.id ?? null,
    campusName: primaryRole?.campus?.name ?? null,
    subjectId: primaryRole?.subject?.id ?? null,
    subjectName: primaryRole?.subject?.name ?? null,
    status: user.isActive ? 'active' : 'disabled',
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ─── 路由注册函数 ─────────────────────────────────────────
export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // ──────────────────────────────────────────────────────────
  // GET /api/users/roles - 获取角色列表（须放在 /users/:id 前注册）
  // ──────────────────────────────────────────────────────────
  fastify.get(
    '/users/roles',
    {
      preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL])],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const roles = await fastify.prisma.role.findMany({
        orderBy: { id: 'asc' },
      });
      return reply.send({ data: roles });
    },
  );

  // ──────────────────────────────────────────────────────────
  // GET /api/users/campuses - 获取校区列表（所有已登录用户）
  // ──────────────────────────────────────────────────────────
  fastify.get(
    '/users/campuses',
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
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const campuses = await fastify.prisma.campus.findMany({
        orderBy: { id: 'asc' },
      });
      return reply.send({ data: campuses });
    },
  );

  // ──────────────────────────────────────────────────────────
  // GET /api/users/subjects - 获取学科列表（所有已登录用户）
  // ──────────────────────────────────────────────────────────
  fastify.get(
    '/users/subjects',
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
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const subjects = await fastify.prisma.subject.findMany({
        orderBy: { id: 'asc' },
      });
      return reply.send({ data: subjects });
    },
  );

  // ──────────────────────────────────────────────────────────
  // GET /api/users - 获取用户列表
  // ──────────────────────────────────────────────────────────
  fastify.get(
    '/users',
    {
      preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = listUsersQuerySchema.parse(request.query);

      const page = isNaN(query.page) || query.page < 1 ? 1 : query.page;
      const pageSize =
        isNaN(query.pageSize) || query.pageSize < 1 ? 20 : query.pageSize;

      // 构建过滤条件
      const whereClause: Record<string, unknown> = {};

      // 关键词搜索（姓名或手机号模糊匹配）
      if (query.keyword) {
        whereClause['OR'] = [
          { name: { contains: query.keyword } },
          { phone: { contains: query.keyword } },
        ];
      }

      // 角色筛选
      if (query.role) {
        whereClause['userRoles'] = {
          some: {
            role: { code: query.role },
          },
        };
      }

      const [total, users] = await Promise.all([
        fastify.prisma.user.count({ where: whereClause }),
        fastify.prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatarUrl: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            userRoles: {
              include: {
                role: true,
                campus: true,
                subject: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      return reply.send({
        data: users.map(serializeUser),
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    },
  );

  // ──────────────────────────────────────────────────────────
  // POST /api/users - 创建用户
  // ──────────────────────────────────────────────────────────
  fastify.post(
    '/users',
    {
      preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user as JwtPayload;
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          '请求参数错误',
          parsed.error.flatten(),
        );
      }
      const body = parsed.data;

      // 验证手机号唯一性
      const existing = await fastify.prisma.user.findUnique({
        where: { phone: body.phone },
      });
      if (existing) {
        throw new AppError(
          ErrorCode.USER_ALREADY_EXISTS,
          `手机号 ${body.phone} 已被注册`,
        );
      }

      // 查找角色
      const role = await fastify.prisma.role.findUnique({
        where: { code: body.roleCode },
      });
      if (!role) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          `角色 ${body.roleCode} 不存在`,
        );
      }

      // 密码 bcrypt hash
      const passwordHash = await bcrypt.hash(body.password, 10);

      // 使用事务创建用户和角色关联
      const newUser = await fastify.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: body.name,
            phone: body.phone,
            passwordHash,
            isActive: true,
          },
        });

        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: role.id,
            campusId: body.campusId ?? null,
            subjectId: body.subjectId ?? null,
          },
        });

        await tx.operationLog.create({
          data: {
            actorId: currentUser.sub,
            actorName: currentUser.name,
            actionType: 'user_create',
            targetType: 'user',
            targetId: user.id,
            detail: {
              userName: body.name,
              phone: body.phone,
              roleCode: body.roleCode,
              campusId: body.campusId ?? null,
              subjectId: body.subjectId ?? null,
            } as any,
          },
        });

        return user;
      });

      // 查询完整用户信息（含角色）
      const userWithRoles = await fastify.prisma.user.findUnique({
        where: { id: newUser.id },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          avatarUrl: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          userRoles: {
            include: {
              role: true,
              campus: true,
              subject: true,
            },
          },
        },
      });

      return reply.status(201).send({ data: userWithRoles ? serializeUser(userWithRoles) : null });
    },
  );

  // ──────────────────────────────────────────────────────────
  // PATCH /api/users/:id - 修改用户信息
  // ──────────────────────────────────────────────────────────
  fastify.patch<{ Params: UserParams }>(
    '/users/:id',
    {
      preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL])],
    },
    async (
      request: FastifyRequest<{ Params: UserParams }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const currentUser = request.user as JwtPayload;

      const parsed = updateUserSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          '请求参数错误',
          parsed.error.flatten(),
        );
      }
      const body = parsed.data;

      // 确认用户存在
      const existingUser = await fastify.prisma.user.findUnique({
        where: { id },
      });
      if (!existingUser) {
        throw createError.notFound('用户', id);
      }

      // 检查手机号唯一性（排除自身）
      if (body.phone) {
        const phoneConflict = await fastify.prisma.user.findFirst({
          where: { phone: body.phone, id: { not: id } },
        });
        if (phoneConflict) {
          throw new AppError(
            ErrorCode.USER_ALREADY_EXISTS,
            `手机号 ${body.phone} 已被使用`,
          );
        }
      }

      // 构建更新数据
      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData['name'] = body.name;
      if (body.phone !== undefined) updateData['phone'] = body.phone;
      if (body.isActive !== undefined) updateData['isActive'] = body.isActive;
      if (body.password !== undefined) {
        updateData['passwordHash'] = await bcrypt.hash(body.password, 10);
      }

      // 更新角色（如果提供了 roleCode）
      if (body.roleCode !== undefined) {
        const role = await fastify.prisma.role.findUnique({
          where: { code: body.roleCode },
        });
        if (!role) {
          throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            `角色 ${body.roleCode} 不存在`,
          );
        }

        // 删除旧角色绑定，创建新角色绑定（同一用户只维护一个主角色）
        await fastify.prisma.$transaction(async (tx) => {
          await tx.userRole.deleteMany({ where: { userId: id } });
          await tx.userRole.create({
            data: {
              userId: id,
              roleId: role.id,
              campusId: body.campusId ?? null,
              subjectId: body.subjectId ?? null,
            },
          });
        });
      } else if (body.campusId !== undefined || body.subjectId !== undefined) {
        // 仅更新校区/学科（不改变角色）
        await fastify.prisma.userRole.updateMany({
          where: { userId: id },
          data: {
            ...(body.campusId !== undefined && { campusId: body.campusId }),
            ...(body.subjectId !== undefined && { subjectId: body.subjectId }),
          },
        });
      }

      // 更新用户基本信息
      const updatedUser = await fastify.prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          avatarUrl: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          userRoles: {
            include: {
              role: true,
              campus: true,
              subject: true,
            },
          },
        },
      });

      const changedFields = [
        body.name !== undefined ? 'name' : null,
        body.phone !== undefined ? 'phone' : null,
        body.password !== undefined ? 'password' : null,
        body.isActive !== undefined ? 'isActive' : null,
        body.roleCode !== undefined ? 'roleCode' : null,
        body.campusId !== undefined ? 'campusId' : null,
        body.subjectId !== undefined ? 'subjectId' : null,
      ].filter((field): field is string => field !== null);

      await fastify.prisma.operationLog.create({
        data: {
          actorId: currentUser.sub,
          actorName: currentUser.name,
          actionType: 'user_update',
          targetType: 'user',
          targetId: id,
          detail: {
            userName: updatedUser.name,
            changedFields,
            roleCode: body.roleCode,
            campusId: body.campusId,
            subjectId: body.subjectId,
          } as any,
        },
      });

      return reply.send({ data: serializeUser(updatedUser) });
    },
  );

  // ──────────────────────────────────────────────────────────
  // PATCH /api/users/:id/status - 启用/禁用用户
  // ──────────────────────────────────────────────────────────
  fastify.patch<{ Params: UserParams; Body: { isActive: boolean } }>(
    '/users/:id/status',
    {
      preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL])],
    },
    async (
      request: FastifyRequest<{ Params: UserParams; Body: { isActive: boolean } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const currentUser = request.user as JwtPayload;
      const body = z.object({ isActive: z.boolean() }).parse(request.body);

      if (currentUser.sub === id && !body.isActive) {
        throw new AppError(ErrorCode.FORBIDDEN, '不能禁用自己的账号');
      }

      const existingUser = await fastify.prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, isActive: true },
      });
      if (!existingUser) {
        throw createError.notFound('用户', id);
      }

      const updatedUser = await fastify.prisma.user.update({
        where: { id },
        data: { isActive: body.isActive },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          avatarUrl: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          userRoles: {
            include: {
              role: true,
              campus: true,
              subject: true,
            },
          },
        },
      });

      await fastify.prisma.operationLog.create({
        data: {
          actorId: currentUser.sub,
          actorName: currentUser.name,
          actionType: body.isActive ? 'user_enable' : 'user_disable',
          targetType: 'user',
          targetId: id,
          detail: {
            userName: existingUser.name,
            previousStatus: existingUser.isActive ? 'active' : 'disabled',
            nextStatus: body.isActive ? 'active' : 'disabled',
          } as any,
        },
      });

      return reply.send({ data: serializeUser(updatedUser) });
    },
  );

  // ──────────────────────────────────────────────────────────
  // DELETE /api/users/:id - 禁用用户（软删除）
  // ──────────────────────────────────────────────────────────
  fastify.delete<{ Params: UserParams }>(
    '/users/:id',
    {
      preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL])],
    },
    async (
      request: FastifyRequest<{ Params: UserParams }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const currentUser = request.user as JwtPayload;

      // 不允许禁用自己
      if (currentUser.sub === id) {
        throw new AppError(ErrorCode.FORBIDDEN, '不能禁用自己的账号');
      }

      // 确认用户存在
      const existingUser = await fastify.prisma.user.findUnique({
        where: { id },
      });
      if (!existingUser) {
        throw createError.notFound('用户', id);
      }

      await fastify.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: { isActive: false },
        });

        await tx.operationLog.create({
          data: {
            actorId: currentUser.sub,
            actorName: currentUser.name,
            actionType: 'user_disable',
            targetType: 'user',
            targetId: id,
            detail: {
              userName: existingUser.name,
              previousStatus: existingUser.isActive ? 'active' : 'disabled',
              nextStatus: 'disabled',
            } as any,
          },
        });
      });

      return reply.send({ message: `用户 ${existingUser.name} 已禁用` });
    },
  );
}
