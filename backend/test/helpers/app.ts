// 测试用应用工厂:用 mock Prisma 构建 Fastify 实例,跳过 BullMQ。
import type { PrismaClient } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/index';

export interface TestApp {
  app: FastifyInstance;
  prisma: DeepMockProxy<PrismaClient>;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const prisma = mockDeep<PrismaClient>();
  // 默认让 $transaction 把传进来的 callback 直接当 tx 执行(用同一个 mock)
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: PrismaClient) => unknown)(prisma);
    }
    return arg;
  });

  const app = await buildApp({ prisma, disableRateLimit: true });
  await app.ready();
  return {
    app,
    prisma,
    close: async () => {
      await app.close();
    },
  };
}

/** 从 Set-Cookie 头里抠出指定 cookie 的值,找不到返回 null */
export function extractCookie(setCookieHeader: string | string[] | undefined, name: string): string | null {
  if (!setCookieHeader) return null;
  const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const line of arr) {
    const match = new RegExp(`(?:^|; )${name}=([^;]+)`).exec(line);
    if (match) return decodeURIComponent(match[1]!);
  }
  return null;
}
