// src/utils/redis.ts
// 进程内共享的 IORedis 单例，BullMQ 队列与 JWT 黑名单复用同一连接。

import IORedis from 'ioredis';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

let sharedConnection: IORedis | null = null;

export function getRedis(): IORedis {
  if (sharedConnection) return sharedConnection;

  const connection = new IORedis(redisUrl, {
    // BullMQ 要求 maxRetriesPerRequest=null；JWT 黑名单只是几次 EXISTS/SETEX，沿用即可。
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  connection.on('error', (err) => {
    console.error('[Redis] 连接错误:', err);
  });

  connection.on('connect', () => {
    console.log('[Redis] 连接成功');
  });

  sharedConnection = connection;
  return connection;
}

export async function closeRedis(): Promise<void> {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}

// ─── Token 黑名单 ────────────────────────────────────────
// key: auth:bl:<jti>，value: '1'，TTL = token 剩余有效期
const BL_PREFIX = 'auth:bl:';

export async function blacklistJti(jti: string, ttlSeconds: number): Promise<void> {
  if (!jti) return;
  // SETEX 拒绝 ttl<=0，因此对已过期 token 直接跳过（无需拉黑）
  if (ttlSeconds <= 0) return;
  await getRedis().setex(`${BL_PREFIX}${jti}`, ttlSeconds, '1');
}

export async function isJtiBlacklisted(jti: string | undefined): Promise<boolean> {
  if (!jti) return false;
  const exists = await getRedis().exists(`${BL_PREFIX}${jti}`);
  return exists === 1;
}
