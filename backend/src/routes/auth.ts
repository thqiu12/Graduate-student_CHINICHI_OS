// src/routes/auth.ts
// 知日塾大学院考学进度管理系统 - 认证路由
// 包含：微信登录 + 手机号登录接口骨架

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { AppError, ErrorCode } from '../utils/errors';

// ─── 请求体 Schema ───────────────────────────────────────
const phoneLoginSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  code: z.string().length(6, '验证码为6位数字'),
});

const sendSmsSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
});

const wechatLoginSchema = z.object({
  code: z.string().min(1, '微信授权码不能为空'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh Token 不能为空'),
});

type PhoneLoginBody = z.infer<typeof phoneLoginSchema>;
type WechatLoginBody = z.infer<typeof wechatLoginSchema>;

// ─── 辅助函数 ─────────────────────────────────────────────
/**
 * 生成包含用户角色信息的 JWT Token
 */
async function generateTokens(
  fastify: FastifyInstance,
  userId: string,
  userName: string,
  roles: string[],
): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = { sub: userId, name: userName, roles };

  const accessToken = fastify.jwt.sign(payload, {
    expiresIn: process.env['JWT_ACCESS_EXPIRES_IN'] ?? '2h',
  });

  const refreshToken = fastify.jwt.sign(
    { sub: userId, name: userName, roles, type: 'refresh' } as any,
    { expiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] ?? '30d' },
  );

  return { accessToken, refreshToken };
}

// ─── 路由注册函数 ─────────────────────────────────────────
export async function authRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── POST /api/auth/login ─── 账号密码登录（手机号 + 密码）
  fastify.post(
    '/auth/login',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { phone: string; password: string };

      if (!body.phone || !body.password) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '手机号和密码不能为空');
      }

      // 查找用户
      const user = await fastify.prisma.user.findUnique({
        where: { phone: body.phone },
        include: { userRoles: { include: { role: true } } },
      });

      if (!user || !user.isActive) {
        throw new AppError(ErrorCode.UNAUTHORIZED, '账号不存在或已禁用');
      }

      if (!user.passwordHash) {
        throw new AppError(ErrorCode.UNAUTHORIZED, '该账号未设置密码，请联系管理员');
      }

      // 验证密码
      const isValid = await bcrypt.compare(body.password, user.passwordHash);
      if (!isValid) {
        throw new AppError(ErrorCode.UNAUTHORIZED, '密码错误');
      }

      const roles = user.userRoles.map((ur) => ur.role.code);
      const { accessToken, refreshToken } = await generateTokens(fastify, user.id, user.name, roles);

      // 学生附带 studentId
      let studentId: string | null = null;
      if (roles.includes('student')) {
        const studentProfile = await fastify.prisma.student.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });
        studentId = studentProfile?.id ?? null;
      }

      return reply.send({
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            name: user.name,
            phone: user.phone,
            avatarUrl: user.avatarUrl,
            roles,
            studentId,
          },
        },
        message: '登录成功',
      });
    },
  );

  // POST /api/auth/send-sms - 发送短信验证码
  fastify.post<{ Body: { phone: string } }>(
    '/auth/send-sms',
    async (request: FastifyRequest<{ Body: { phone: string } }>, reply: FastifyReply) => {
      const parsed = sendSmsSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '手机号格式不正确', parsed.error.flatten());
      }
      const { phone } = parsed.data;

      // TODO: 调用阿里云短信服务发送验证码
      // 1. 生成 6 位随机验证码
      // 2. 存入 Redis（key: sms:verify:{phone}，TTL: 300s）
      // 3. 调用阿里云短信 API 发送
      // 4. 记录发送频率（防刷：同一手机号 60s 内不重复发送）

      // 开发环境模拟：固定验证码 123456
      if (process.env['NODE_ENV'] === 'development') {
        fastify.log.info(`[开发模式] 手机号 ${phone} 的验证码为: 123456`);
        return reply.send({ message: '验证码已发送（开发模式）', expiresIn: 300 });
      }

      return reply.send({ message: '验证码已发送', expiresIn: 300 });
    },
  );

  // POST /api/auth/phone-login - 手机号+验证码登录
  fastify.post<{ Body: PhoneLoginBody }>(
    '/auth/phone-login',
    async (
      request: FastifyRequest<{ Body: PhoneLoginBody }>,
      reply: FastifyReply,
    ) => {
      const parsed = phoneLoginSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '参数错误', parsed.error.flatten());
      }
      const { phone, code } = parsed.data;

      // 验证短信验证码（演示系统固定允许 123456）
      if (code !== '123456') {
        throw new AppError(ErrorCode.SMS_CODE_INVALID, '验证码不正确或已过期');
      }

      // 查找用户
      const user = await fastify.prisma.user.findUnique({
        where: { phone },
        include: {
          userRoles: { include: { role: true } },
        },
      });

      if (!user) {
        throw new AppError(ErrorCode.USER_NOT_FOUND, '该手机号未注册，请联系管理员');
      }

      if (!user.isActive) {
        throw new AppError(ErrorCode.FORBIDDEN, '账号已被禁用，请联系管理员');
      }

      const roles = user.userRoles.map((ur) => ur.role.code);
      const { accessToken, refreshToken } = await generateTokens(
        fastify,
        user.id,
        user.name,
        roles,
      );

      // 如果是学生角色，附带 studentId（Student 表的 ID）
      let studentId: string | null = null;
      if (roles.includes('student')) {
        const studentProfile = await fastify.prisma.student.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });
        studentId = studentProfile?.id ?? null;
      }

      return reply.send({
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            name: user.name,
            phone: user.phone,
            avatarUrl: user.avatarUrl,
            roles,
            studentId, // 学生角色时附带，其他角色为 null
          },
        },
        message: '登录成功',
      });
    },
  );

  // POST /api/auth/wechat-login - 微信扫码登录
  fastify.post<{ Body: WechatLoginBody }>(
    '/auth/wechat-login',
    async (
      request: FastifyRequest<{ Body: WechatLoginBody }>,
      reply: FastifyReply,
    ) => {
      const parsed = wechatLoginSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '参数错误', parsed.error.flatten());
      }
      const { code } = parsed.data;

      // TODO: 调用微信开放平台 OAuth2 接口获取 openid
      // 1. 用 code 换取 access_token 和 openid
      //    GET https://api.weixin.qq.com/sns/oauth2/access_token?
      //      appid=APP_ID&secret=APP_SECRET&code=CODE&grant_type=authorization_code
      // 2. 用 openid 查找用户
      // 3. 如果用户不存在，引导绑定手机号
      // 4. 生成 JWT

      fastify.log.info(`[微信登录] 授权码: ${code}`);

      // 骨架实现，实际需要调用微信 API
      throw new AppError(
        ErrorCode.WECHAT_AUTH_FAILED,
        '微信登录功能开发中，请使用手机号登录',
      );
    },
  );

  // POST /api/auth/refresh - 刷新 Token
  fastify.post<{ Body: { refreshToken: string } }>(
    '/auth/refresh',
    async (
      request: FastifyRequest<{ Body: { refreshToken: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = refreshTokenSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '参数错误');
      }

      let payload: { sub: string; type?: string };
      try {
        payload = fastify.jwt.verify<{ sub: string; type?: string }>(
          parsed.data.refreshToken,
        );
      } catch (_err) {
        throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Refresh Token 已过期，请重新登录');
      }

      if (payload.type !== 'refresh') {
        throw new AppError(ErrorCode.UNAUTHORIZED, '无效的 Token 类型');
      }

      const user = await fastify.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { userRoles: { include: { role: true } } },
      });

      if (!user || !user.isActive) {
        throw new AppError(ErrorCode.UNAUTHORIZED, '用户不存在或已被禁用');
      }

      const roles = user.userRoles.map((ur) => ur.role.code);
      const { accessToken, refreshToken: newRefreshToken } = await generateTokens(
        fastify,
        user.id,
        user.name,
        roles,
      );

      return reply.send({
        data: { accessToken, refreshToken: newRefreshToken },
      });
    },
  );

  // POST /api/auth/logout - 登出（客户端清除 Token 即可，服务端可加入黑名单）
  fastify.post(
    '/auth/logout',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // TODO: 将 Token 加入 Redis 黑名单（可选，按安全需求决定）
      return reply.send({ message: '已登出' });
    },
  );
}
