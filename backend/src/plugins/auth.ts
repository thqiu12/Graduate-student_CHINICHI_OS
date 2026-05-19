// src/plugins/auth.ts
// 知日塾大学院考学进度管理系统 - Fastify JWT 插件封装
// 注册 JWT 插件，提供 verifyToken decorator

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fp = require('fastify-plugin');
import fastifyJwt from '@fastify/jwt';
import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

// JWT Payload 类型定义
export interface JwtPayload {
  sub: string;        // 用户 ID
  name: string;       // 用户姓名
  roles: string[];    // 角色列表
  type?: string;      // token 类型 (access / refresh)
  jti?: string;       // JWT ID，用于精确撤销（Redis 黑名单 key）
  iat?: number;
  exp?: number;
}

// 声明 Fastify 类型扩展
declare module 'fastify' {
  interface FastifyInstance {
    verifyToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// 声明 JWT 类型扩展
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('JWT_SECRET 环境变量未设置');
  }

  // JWT_SECRET 强度校验：生产环境必须 >= 32 字符,且禁止使用 .env.example 中的占位串
  const MIN_SECRET_LENGTH = 32;
  const PLACEHOLDER_SECRETS = new Set([
    'your-super-secret-jwt-key-change-in-production',
    'your-super-secret-key',
    'secret',
    'changeme',
  ]);
  const isProduction = process.env['NODE_ENV'] === 'production';
  const tooShort = jwtSecret.length < MIN_SECRET_LENGTH;
  const isPlaceholder = PLACEHOLDER_SECRETS.has(jwtSecret);
  if (isProduction && (tooShort || isPlaceholder)) {
    throw new Error(
      `JWT_SECRET 不满足强度要求（生产环境需 ≥${MIN_SECRET_LENGTH} 字符且非占位值）`,
    );
  }
  if (!isProduction && (tooShort || isPlaceholder)) {
    fastify.log.warn(
      `JWT_SECRET 强度不足（当前 ${jwtSecret.length} 字符），生产环境前请更换为 ≥${MIN_SECRET_LENGTH} 字符的随机字符串`,
    );
  }

  // 注册 JWT 插件
  await fastify.register(fastifyJwt, {
    secret: jwtSecret,
    sign: {
      expiresIn: process.env['JWT_ACCESS_EXPIRES_IN'] ?? '2h',
    },
  });

  // 注册 verifyToken 装饰器，用于路由中验证 JWT
  fastify.decorate(
    'verifyToken',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.status(401).send({
          code: 'UNAUTHORIZED',
          message: '请先登录',
        });
      }
    },
  );

  fastify.log.info('JWT 认证插件已注册');
};

export default fp(authPlugin, {
  name: 'auth',
});
