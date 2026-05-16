// src/index.ts
// 知日塾大学院考学进度管理系统 - Fastify 服务主入口
// 注册所有插件、路由，启动服务，配置健康检查 /health

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';

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

// 工具
import { AppError } from './utils/errors';

// BullMQ
import { scheduleRecurringJobs, closeAllQueues } from './jobs/queue';
import { createCheckUnsetPlansWorker } from './jobs/check-unset-plans.job';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const NODE_ENV = process.env['NODE_ENV'] ?? 'development';

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

  // ─── CORS ────────────────────────────────────────────────
  await fastify.register(cors, {
    origin:
      NODE_ENV === 'development'
        ? true // 开发环境允许所有来源
        : [
            process.env['CORS_ORIGIN'] ?? 'https://chinichi.jp',
            /\.vercel\.app$/, // 允许所有 Vercel 预览域名
          ],
    credentials: true,
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
      message: NODE_ENV === 'development' ? error.message : '服务器内部错误',
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
      createCheckUnsetPlansWorker(fastify.prisma);
      fastify.log.info('BullMQ 定时任务已启动');
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
