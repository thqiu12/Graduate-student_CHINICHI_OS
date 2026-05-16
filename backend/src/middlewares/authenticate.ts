// src/middlewares/authenticate.ts
// 知日塾大学院考学进度管理系统 - JWT 验证中间件
// 验证请求头中的 Bearer Token，将解码后的用户信息挂载到 request.user

import { FastifyRequest, FastifyReply } from 'fastify';

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
    } catch (_err) {
      // 忽略错误，允许匿名访问
    }
  }
}
