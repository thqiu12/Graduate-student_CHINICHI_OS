// src/routes/auth.ts
// 知日塾大学院考学进度管理系统 - 认证路由
// 包含：微信登录 + 手机号登录接口骨架

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../utils/errors';
import { blacklistJti } from '../utils/redis';
import {
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE,
} from '../utils/auth-cookies';

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
 * 生成包含用户角色信息的 JWT Token。
 * 每个 token 都带独立 jti（JWT ID），便于在 Redis 黑名单里精确撤销。
 */
async function generateTokens(
  fastify: FastifyInstance,
  userId: string,
  userName: string,
  roles: string[],
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = fastify.jwt.sign(
    { sub: userId, name: userName, roles, jti: randomUUID() } as any,
    { expiresIn: process.env['JWT_ACCESS_EXPIRES_IN'] ?? '2h' },
  );

  const refreshToken = fastify.jwt.sign(
    { sub: userId, name: userName, roles, type: 'refresh', jti: randomUUID() } as any,
    { expiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] ?? '30d' },
  );

  return { accessToken, refreshToken };
}

/**
 * 计算 token 剩余 TTL（秒）。已过期返回 0。
 */
function ttlSecondsFromExp(exp: number | undefined): number {
  if (!exp) return 0;
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, exp - now);
}

// ─── 路由注册函数 ─────────────────────────────────────────
export async function authRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── POST /api/auth/login ─── 账号密码登录（手机号 + 密码）
  // 路由级限流：按 IP 每 5 分钟最多 10 次，按 phone 每 5 分钟最多 10 次，防止暴力穷举
  fastify.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '5 minutes',
          keyGenerator: (req) => {
            const body = (req.body as { phone?: string } | undefined) ?? {};
            return `login:${req.ip}:${body.phone ?? ''}`;
          },
        },
      },
    },
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

      // 写入 HttpOnly Cookie + CSRF Cookie;
      // 同时在响应体里也回传 token,旧客户端可继续走 Authorization 头(过渡期)。
      const csrfToken = setAuthCookies(reply, { accessToken, refreshToken });

      return reply.send({
        data: {
          accessToken,
          refreshToken,
          csrfToken,
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
    {
      // 路由级限流：每 IP+phone 每 15 分钟最多 5 次，防止短信轰炸
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
          keyGenerator: (req) => {
            const body = (req.body as { phone?: string } | undefined) ?? {};
            return `send-sms:${req.ip}:${body.phone ?? ''}`;
          },
        },
      },
    },
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

      // 开发环境且显式开启 dev-bypass 时返回固定验证码（仅本地联调使用）。
      // 仅 NODE_ENV=development 不足以放行 —— 必须再设 ENABLE_DEV_SMS_BYPASS=true，
      // 避免 staging/未设 NODE_ENV 的环境意外暴露免密登录。
      if (
        process.env['NODE_ENV'] === 'development' &&
        process.env['ENABLE_DEV_SMS_BYPASS'] === 'true'
      ) {
        fastify.log.warn({ phone }, '[DEV-ONLY] 跳过真实短信，固定验证码 123456');
        return reply.send({ message: '验证码已发送（开发模式）', expiresIn: 300 });
      }

      throw new AppError(
        ErrorCode.NOT_IMPLEMENTED,
        '短信服务尚未配置，无法发送验证码',
      );
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

      // dev-bypass：同 send-sms，必须 NODE_ENV=development 且 ENABLE_DEV_SMS_BYPASS=true。
      // 仅靠 NODE_ENV 不安全（默认即 development，staging 误配会暴露免密登录）。
      const isDev = process.env['NODE_ENV'] === 'development';
      const devBypassEnabled = process.env['ENABLE_DEV_SMS_BYPASS'] === 'true';
      if (!isDev || !devBypassEnabled) {
        throw new AppError(
          ErrorCode.NOT_IMPLEMENTED,
          '短信验证码登录尚未接入，请使用账号密码登录',
        );
      }
      if (code !== '123456') {
        throw new AppError(ErrorCode.SMS_CODE_INVALID, '验证码不正确或已过期');
      }
      fastify.log.warn(
        { phone },
        '[DEV-ONLY] 使用固定验证码 123456 完成手机号登录（ENABLE_DEV_SMS_BYPASS=true）',
      );

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

      const csrfToken = setAuthCookies(reply, { accessToken, refreshToken });

      return reply.send({
        data: {
          accessToken,
          refreshToken,
          csrfToken,
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
  fastify.post<{ Body: { refreshToken?: string } }>(
    '/auth/refresh',
    async (
      request: FastifyRequest<{ Body: { refreshToken?: string } }>,
      reply: FastifyReply,
    ) => {
      // 优先从 cookie 读 refresh token,降级到请求体(老客户端)
      const refreshTokenStr =
        request.cookies?.[REFRESH_COOKIE] ?? request.body?.refreshToken;
      if (!refreshTokenStr) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '缺少 Refresh Token');
      }

      let payload: { sub: string; type?: string; jti?: string; exp?: number };
      try {
        payload = fastify.jwt.verify<{ sub: string; type?: string; jti?: string; exp?: number }>(
          refreshTokenStr,
        );
      } catch (_err) {
        throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Refresh Token 已过期，请重新登录');
      }

      if (payload.type !== 'refresh') {
        throw new AppError(ErrorCode.UNAUTHORIZED, '无效的 Token 类型');
      }

      // 若该 refresh token 已被撤销（拉黑），拒绝复用
      const { isJtiBlacklisted } = await import('../utils/redis');
      if (await isJtiBlacklisted(payload.jti)) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Refresh Token 已失效，请重新登录');
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

      // 轮转：颁发新 token 后，把旧 refresh token 拉黑，杜绝复用
      if (payload.jti) {
        await blacklistJti(payload.jti, ttlSecondsFromExp(payload.exp));
      }

      // 同步写回新 cookie + CSRF
      const csrfToken = setAuthCookies(reply, {
        accessToken,
        refreshToken: newRefreshToken,
      });

      return reply.send({
        data: { accessToken, refreshToken: newRefreshToken, csrfToken },
      });
    },
  );

  // POST /api/auth/logout - 登出：撤销当前 access token + 提交的 refresh token
  fastify.post<{ Body: { refreshToken?: string } }>(
    '/auth/logout',
    async (
      request: FastifyRequest<{ Body: { refreshToken?: string } }>,
      reply: FastifyReply,
    ) => {
      // 1) 撤销当前请求所带的 access token（Authorization Bearer 或 cookie）
      try {
        const decoded = await request.jwtVerify<{ jti?: string; exp?: number }>();
        if (decoded?.jti) {
          await blacklistJti(decoded.jti, ttlSecondsFromExp(decoded.exp));
        }
      } catch (_err) {
        // access token 已过期或缺失也视为登出成功，无需报错
      }

      // 2) 撤销 refresh token(cookie 优先,降级到请求体)
      const refreshToken = request.cookies?.[REFRESH_COOKIE] ?? request.body?.refreshToken;
      if (refreshToken) {
        try {
          const decoded = fastify.jwt.verify<{ jti?: string; exp?: number; type?: string }>(
            refreshToken,
          );
          if (decoded?.type === 'refresh' && decoded.jti) {
            await blacklistJti(decoded.jti, ttlSecondsFromExp(decoded.exp));
          }
        } catch (_err) {
          // 已过期/伪造的 refresh token 无需处理
        }
      }

      // 3) 清掉所有认证 cookie
      clearAuthCookies(reply);

      return reply.send({ message: '已登出' });
    },
  );
}
