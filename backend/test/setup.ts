// 全局测试环境配置
// - 强制 NODE_ENV=test,关掉限流、不要 pino-pretty
// - 提供稳定的 JWT_SECRET / COOKIE_SECRET,避免 JWT_SECRET 强度校验拒启动

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-test-test-test-test-test-test-test-test-test';
process.env.COOKIE_SECRET = 'test-cookie-secret-test-cookie-secret-test';
process.env.LOG_LEVEL = process.env['TEST_LOG'] ?? 'silent';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// 让所有 Redis 黑名单调用直接成功/返回 false,而无需真实 Redis
import { vi } from 'vitest';

vi.mock('../src/utils/redis', () => {
  const store = new Map<string, number>();
  return {
    getRedis: () => null,
    closeRedis: vi.fn(),
    blacklistJti: vi.fn(async (jti: string, ttl: number) => {
      if (jti && ttl > 0) store.set(jti, Date.now() + ttl * 1000);
    }),
    isJtiBlacklisted: vi.fn(async (jti?: string) => {
      if (!jti) return false;
      const exp = store.get(jti);
      if (!exp) return false;
      if (Date.now() > exp) {
        store.delete(jti);
        return false;
      }
      return true;
    }),
    __reset: () => store.clear(),
  };
});

// 关掉 BullMQ 启动(test/setup 是顶层 import,reach 之前 mock 已生效)
vi.mock('../src/jobs/queue', () => ({
  scheduleRecurringJobs: vi.fn(async () => {}),
  closeAllQueues: vi.fn(async () => {}),
  createRedisConnection: vi.fn(() => null),
}));
