// src/plugins/prisma.ts
// 知日塾大学院考学进度管理系统 - Fastify Prisma 插件
// 将 PrismaClient 注入到 Fastify 实例，作为全局可用的数据库客户端

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

const prismaPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
  });

  // 连接数据库
  await prisma.$connect();

  // 注册到 Fastify 实例
  fastify.decorate('prisma', prisma);

  // 应用关闭时断开连接
  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
  });

  fastify.log.info('Prisma 数据库客户端已连接');
};

export default fp(prismaPlugin, {
  name: 'prisma',
});
