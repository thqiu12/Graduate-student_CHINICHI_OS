// src/plugins/prisma.ts
// 知日塾大学院考学进度管理系统 - Fastify Prisma 插件
// 将 PrismaClient 注入到 Fastify 实例，作为全局可用的数据库客户端。
// 测试可通过 { client: mockPrisma } 注入 mock 实例,跳过真实数据库连接。

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fp = require('fastify-plugin');
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';

// 声明 Fastify 类型扩展，使 fastify.prisma 有类型提示
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export interface PrismaPluginOptions {
  /** 由调用方提供的 Prisma 客户端(测试场景注入 mock);未提供时插件自建并管理生命周期 */
  client?: PrismaClient;
}

const prismaPlugin: FastifyPluginAsync<PrismaPluginOptions> = async (
  fastify: FastifyInstance,
  opts,
) => {
  const externallyOwned = Boolean(opts?.client);
  const prisma =
    opts?.client ??
    new PrismaClient({
      log:
        process.env['NODE_ENV'] === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });

  if (!externallyOwned) {
    await prisma.$connect();
  }

  // 注:fastify.decorate 在某些场景(如把 Proxy/mock 当成 value)会处理不当,
  // 直接用 defineProperty 强制挂载,行为更可控。
  Object.defineProperty(fastify, 'prisma', {
    value: prisma,
    configurable: true,
    writable: true,
    enumerable: false,
  });

  // 应用关闭时断开自有连接;外部注入的由调用方负责
  fastify.addHook('onClose', async () => {
    if (!externallyOwned) {
      await prisma.$disconnect();
    }
  });

  fastify.log.info('Prisma 数据库客户端已连接');
};

export default fp(prismaPlugin, {
  name: 'prisma',
});
