// src/middlewares/authenticate.ts
// 知日塾大学院考学进度管理系统 - JWT 验证中间件
// 验证请求头/Cookie 中的 Token，并查 Redis 黑名单防止已撤销 token 复用。

import { FastifyRequest, FastifyReply } from 'fastify';
import { isJtiBlacklisted } from '../utils/redis';

async function rejectIfRevoked(request: FastifyRequest): Promise<boolean> {
  const payload = request.user as { jti?: string } | undefined;
  return isJtiBlacklisted(payload?.jti);
}

/**
 * JWT 认证中间件
 * 用法：在路由中添加 preHandler: [authenticate]
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (_err) {
    reply.status(401).send({
      code: 'UNAUTHORIZED',
      message: '认证失败，请重新登录',
    });
    return;
  }

  if (await rejectIfRevoked(request)) {
    reply.status(401).send({
      code: 'TOKEN_REVOKED',
      message: '登录已失效，请重新登录',
    });
  }
}

/**
 * 可选认证中间件（不强制要求 Token，有则解析，无则跳过）
 * 用于某些公开但需区分登录状态的接口
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      await request.jwtVerify();
      if (await rejectIfRevoked(request)) {
        // 已撤销的 token 在 optional 模式下当作匿名
        (request as { user?: unknown }).user = undefined;
      }
    } catch (_err) {
      // 忽略错误，允许匿名访问
    }
  }
}
