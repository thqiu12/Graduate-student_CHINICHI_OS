// src/index.ts
// 知日塾大学院考学进度管理系统 - Fastify 服务主入口
// 注册所有插件、路由，启动服务，配置健康检查 /health

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';

// 插件
import prismaPlugin from './plugins/prisma';
import authPlugin from './plugins/auth';

// 路由
import { authRoutes } from './routes/auth';
import { studentRoutes } from './routes/students';
import { planRoutes } from './routes/plans';
import { notificationRoutes } from './routes/notifications';
import { coachingRoutes } from './routes/coaching';
import { schoolRoutes } from './routes/schools';
import { riskTagRoutes } from './routes/risk-tags';
import { fileRoutes } from './routes/files';
import { innoRoutes } from './routes/inno';
import { statsRoutes } from './routes/stats';
import { userRoutes } from './routes/users';

// 工具
import { AppError } from './utils/errors';
import { verifyCsrf, CSRF_HEADER } from './utils/auth-cookies';

// BullMQ
import { scheduleRecurringJobs, closeAllQueues } from './jobs/queue';
import { createCheckUnsetPlansWorker } from './jobs/check-unset-plans.job';
import { createCheckUnconfirmedPlansWorker } from './jobs/check-unconfirmed-plans.job';
import { createCheckOverdueTasksWorker } from './jobs/check-overdue-tasks.job';
import { createWeeklySummaryTeacherWorker } from './jobs/weekly-summary-teacher.job';
import { createWeeklySummaryDeptWorker } from './jobs/weekly-summary-dept.job';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const NODE_ENV = process.env['NODE_ENV'] ?? 'development';
// 是否在响应体里暴露内部错误细节。仅在显式开启时为 true，避免 NODE_ENV 误配导致泄露。
const EXPOSE_ERROR_DETAILS = process.env['EXPOSE_ERROR_DETAILS'] === 'true';

/**
 * 构建 Fastify 应用实例
 */
async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      ...(NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
          }
        : {}),
    },
  });

  // ─── 安全头（Helmet）────────────────────────────────────
  // 关闭 CSP 默认策略：前端是独立 SPA，CSP 需要随前端构建一起规划，此处先打开基础安全头
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // ─── CORS ────────────────────────────────────────────────
  // 开发环境不再使用 origin: true（防止 .env 误传到生产即放开全站）。
  // 支持 CORS_ORIGIN 逗号分隔多域；保留 Vercel 预览域名匹配。
  const corsOriginsEnv = process.env['CORS_ORIGIN'];
  const corsAllowList: (string | RegExp)[] = corsOriginsEnv
    ? corsOriginsEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : NODE_ENV === 'development'
      ? ['http://localhost:5173', 'http://127.0.0.1:5173']
      : ['https://chinichi.jp'];
  corsAllowList.push(/\.vercel\.app$/);
  await fastify.register(cors, {
    origin: corsAllowList,
    credentials: true,
    exposedHeaders: [CSRF_HEADER],
  });

  // ─── Cookie ──────────────────────────────────────────────
  // 用于把 JWT 放进 HttpOnly Cookie + 实现 double-submit CSRF
  await fastify.register(cookie, {
    secret: process.env['COOKIE_SECRET'] ?? process.env['JWT_SECRET'] ?? 'chinichi-cookie-dev',
  });

  // ─── 限流（防暴力穷举）──────────────────────────────────
  // 全局默认：每 IP 每分钟 300 次；登录/发码等敏感路由在路由层加更严格的限制
  await fastify.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    allowList: NODE_ENV === 'test' ? () => true : undefined,
  });

  // ─── Multipart（文件上传）────────────────────────────────
  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB 限制
    },
  });

  // ─── 自定义插件 ──────────────────────────────────────────
  await fastify.register(prismaPlugin);
  await fastify.register(authPlugin);

  // ─── 全局 CSRF 守卫(double-submit cookie) ─────────────
  // 仅对"带 access cookie 的非幂等请求"强制要求 X-CSRF-Token 头
  // 与 cookie 中的 csrf token 一致。Bearer/无会话请求直接放行。
  fastify.addHook('preHandler', async (request, reply) => {
    if (!verifyCsrf(request)) {
      reply.status(403).send({
        code: 'CSRF_INVALID',
        message: 'CSRF 校验失败,请刷新页面后重试',
      });
    }
  });

  // ─── 全局错误处理 ────────────────────────────────────────
  fastify.setErrorHandler((error, _request, reply) => {
    // AppError（业务错误）
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Fastify 验证错误
    if (error.validation) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: '请求参数验证失败',
        details: error.validation,
      });
    }

    // 未处理的错误
    fastify.log.error(error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: EXPOSE_ERROR_DETAILS ? error.message : '服务器内部错误',
    });
  });

  // ─── 404 处理 ────────────────────────────────────────────
  fastify.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      code: 'NOT_FOUND',
      message: '请求的接口不存在',
    });
  });

  // ─── 健康检查路由 ────────────────────────────────────────
  fastify.get('/health', async (_request, reply) => {
    let dbStatus = 'ok';
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
    } catch (_err) {
      dbStatus = 'error';
    }

    const status = dbStatus === 'ok' ? 'ok' : 'degraded';
    return reply.status(status === 'ok' ? 200 : 503).send({
      status,
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? '1.0.0',
      services: {
        database: dbStatus,
      },
    });
  });

  // ─── API 路由（带 /api 前缀）────────────────────────────
  await fastify.register(
    async (api) => {
      await api.register(async (app) => {
        await authRoutes(app);
        await studentRoutes(app);
        await planRoutes(app);
        await notificationRoutes(app);
        await coachingRoutes(app);
        await schoolRoutes(app);
        await riskTagRoutes(app);
        await fileRoutes(app);
        await innoRoutes(app);
        await statsRoutes(app);
        await userRoutes(app);
      });
    },
    { prefix: '/api' },
  );

  return fastify;
}

/**
 * 启动服务
 */
async function start(): Promise<void> {
  const fastify = await buildApp();

  // 启动定时任务（仅生产/开发环境，测试环境跳过）
  if (NODE_ENV !== 'test') {
    try {
      await scheduleRecurringJobs();
      // 注册所有 Worker
      createCheckUnsetPlansWorker(fastify.prisma);
      createCheckUnconfirmedPlansWorker(fastify.prisma);
      createCheckOverdueTasksWorker(fastify.prisma);
      createWeeklySummaryTeacherWorker(fastify.prisma);
      createWeeklySummaryDeptWorker(fastify.prisma);
      fastify.log.info('BullMQ 定时任务已启动（5个Worker）');
    } catch (err) {
      fastify.log.warn({ err }, 'BullMQ 启动失败（Redis 可能未连接）');
    }
  }

  // 优雅退出处理
  const gracefulShutdown = async (signal: string): Promise<void> => {
    fastify.log.info(`收到 ${signal} 信号，开始优雅退出...`);
    try {
      await fastify.close();
      await closeAllQueues();
      fastify.log.info('服务已优雅退出');
      process.exit(0);
    } catch (err) {
      fastify.log.error({ err }, '退出时发生错误');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // 启动监听
  try {
    const address = await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`知日塾考学进度管理系统启动成功: ${address}`);
    fastify.log.info(`环境: ${NODE_ENV}`);
    fastify.log.info(`健康检查: ${address}/health`);
  } catch (err) {
    fastify.log.error({ err }, '服务启动失败');
    process.exit(1);
  }
}

start();
