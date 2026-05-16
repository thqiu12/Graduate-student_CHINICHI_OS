// src/jobs/queue.ts
// 知日塾大学院考学进度管理系统 - BullMQ 队列初始化
// 定义 8 个任务队列

import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';

// ─── Redis 连接配置 ───────────────────────────────────────
const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

/**
 * 创建共享的 Redis 连接（BullMQ 要求 lazyConnect: false）
 */
export function createRedisConnection(): IORedis {
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null, // BullMQ 要求此配置
    enableReadyCheck: false,
  });

  connection.on('error', (err) => {
    console.error('[Redis] 连接错误:', err);
  });

  connection.on('connect', () => {
    console.log('[Redis] 连接成功');
  });

  return connection;
}

// 共享连接实例
const sharedConnection = createRedisConnection();

const defaultQueueOptions: QueueOptions = {
  connection: sharedConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
};

// ═══════════════════════════════════════
// 队列定义（8个）
// ═══════════════════════════════════════

/**
 * 队列1: 检查未设定规划的学生
 * 触发：每天 9:00
 * 执行：扫描入塾>7天无规划学生，告警学科负责人
 */
export const checkUnsetPlansQueue = new Queue('check-unset-plans', defaultQueueOptions);

/**
 * 队列2: 检查未确认规划
 * 触发：每天 9:00
 * 执行：扫描待确认规划，触发相应级别提醒（24h/3d/7d）
 */
export const checkUnconfirmedPlansQueue = new Queue('check-unconfirmed-plans', defaultQueueOptions);

/**
 * 队列3: 检查逾期任务
 * 触发：每天 8:00
 * 执行：扫描逾期任务，推送给班主任+学生
 */
export const checkOverdueTasksQueue = new Queue('check-overdue-tasks', defaultQueueOptions);

/**
 * 队列4: 截止日临近提醒
 * 触发：每天 9:00
 * 执行：出愿截止/考试前 14/7/3/1 天提醒
 */
export const checkDeadlineApproachingQueue = new Queue(
  'check-deadline-approaching',
  defaultQueueOptions,
);

/**
 * 队列5: 内诺跟进提醒
 * 触发：每天 10:00
 * 执行：内诺邮件10天无回复提醒，30天无进展升级
 */
export const checkInnoFollowupQueue = new Queue('check-inno-followup', defaultQueueOptions);

/**
 * 队列6: 班主任周报
 * 触发：每周一 8:30
 * 执行：风险学生+本周截止任务摘要
 */
export const weeklySummaryTeacherQueue = new Queue(
  'weekly-summary-teacher',
  defaultQueueOptions,
);

/**
 * 队列7: 学科负责人周报
 * 触发：每周一 9:00
 * 执行：学科整体进度+风险学生列表
 */
export const weeklySummaryDeptQueue = new Queue('weekly-summary-dept', defaultQueueOptions);

/**
 * 队列8: 发送通知（实时队列）
 * 触发：实时
 * 执行：处理所有通知推送（站内/钉钉/微信/短信）
 */
export const sendNotificationsQueue = new Queue('send-notifications', defaultQueueOptions);

// ─── 队列集合导出 ─────────────────────────────────────────
export const allQueues = [
  checkUnsetPlansQueue,
  checkUnconfirmedPlansQueue,
  checkOverdueTasksQueue,
  checkDeadlineApproachingQueue,
  checkInnoFollowupQueue,
  weeklySummaryTeacherQueue,
  weeklySummaryDeptQueue,
  sendNotificationsQueue,
] as const;

/**
 * 关闭所有队列连接（应用退出时调用）
 */
export async function closeAllQueues(): Promise<void> {
  await Promise.all(allQueues.map((q) => q.close()));
  await sharedConnection.quit();
  console.log('[BullMQ] 所有队列已关闭');
}

/**
 * 调度定时任务（应用启动时调用）
 * 使用 cron 表达式定义重复任务
 */
export async function scheduleRecurringJobs(): Promise<void> {
  // 每天 8:00 - 检查逾期任务
  await checkOverdueTasksQueue.add(
    'daily-check',
    {},
    { repeat: { pattern: '0 8 * * *' } },
  );

  // 每天 9:00 - 检查未设定规划
  await checkUnsetPlansQueue.add(
    'daily-check',
    {},
    { repeat: { pattern: '0 9 * * *' } },
  );

  // 每天 9:00 - 检查未确认规划
  await checkUnconfirmedPlansQueue.add(
    'daily-check',
    {},
    { repeat: { pattern: '5 9 * * *' } },
  );

  // 每天 9:00 - 截止日临近提醒
  await checkDeadlineApproachingQueue.add(
    'daily-check',
    {},
    { repeat: { pattern: '10 9 * * *' } },
  );

  // 每天 10:00 - 内诺跟进提醒
  await checkInnoFollowupQueue.add(
    'daily-check',
    {},
    { repeat: { pattern: '0 10 * * *' } },
  );

  // 每周一 8:30 - 班主任周报
  await weeklySummaryTeacherQueue.add(
    'weekly-report',
    {},
    { repeat: { pattern: '30 8 * * 1' } },
  );

  // 每周一 9:00 - 学科负责人周报
  await weeklySummaryDeptQueue.add(
    'weekly-report',
    {},
    { repeat: { pattern: '0 9 * * 1' } },
  );

  console.log('[BullMQ] 定时任务已调度');
}
