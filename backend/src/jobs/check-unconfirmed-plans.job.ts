// src/jobs/check-unconfirmed-plans.job.ts
// 知日塾大学院考学进度管理系统 - 未确认规划检查任务
// 每天 9:05 扫描 status=pending 的 period_plans，按 sentAt 计算未确认时长：
//   - 24小时未确认 → 通知学生
//   - 3天未确认    → 通知班主任
//   - 7天未确认    → 通知学科负责人

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createRedisConnection } from './queue';
import { createInAppNotification } from '../utils/notifications';

// 各阶段时间阈值（毫秒）
const HOURS_24 = 24 * 60 * 60 * 1000;
const DAYS_3 = 3 * 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

/**
 * 执行「未确认规划」检查的核心逻辑
 * 可独立调用（用于测试）或由 Worker 触发
 */
export async function runCheckUnconfirmedPlans(prisma: PrismaClient): Promise<void> {
  console.log('[check-unconfirmed-plans] 开始扫描待确认规划...');

  const now = new Date();

  // 今天的起止时间，用于防重查询
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // 查询所有 status=pending 的规划（含相关学生、班主任、学科信息）
  const pendingPlans = await prisma.periodPlan.findMany({
    where: {
      status: 'pending',
      sentAt: { not: null }, // 已发送给学生的规划
    },
    include: {
      student: {
        include: {
          user: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          teachers: {
            where: { endedAt: null },
            include: { teacher: { select: { id: true, name: true } } },
            take: 1,
          },
        },
      },
    },
  });

  if (pendingPlans.length === 0) {
    console.log('[check-unconfirmed-plans] 没有待确认的规划，任务结束');
    return;
  }

  console.log(`[check-unconfirmed-plans] 发现 ${pendingPlans.length} 份待确认规划`);

  for (const plan of pendingPlans) {
    // sentAt 已在查询中确保非空
    const sentAt = plan.sentAt as Date;
    const unconfirmedMs = now.getTime() - sentAt.getTime();
    const unconfirmedHours = Math.floor(unconfirmedMs / (60 * 60 * 1000));
    const unconfirmedDays = Math.floor(unconfirmedMs / (24 * 60 * 60 * 1000));

    const student = plan.student;
    const studentUser = student.user;
    const currentTeacher = student.teachers[0]?.teacher ?? null;

    // ── 24小时未确认：通知学生本人 ──────────────────────────
    if (unconfirmedMs >= HOURS_24) {
      // 防重：今天是否已通知过学生
      const existingStudentNotif = await prisma.notification.findFirst({
        where: {
          userId: studentUser.id,
          type: 'plan_unconfirmed_student',
          relatedId: plan.id,
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      });

      if (!existingStudentNotif) {
        await createInAppNotification(prisma, {
          userId: studentUser.id,
          type: 'plan_unconfirmed_student',
          title: `[提醒] 您有一份规划待确认（已超过 ${unconfirmedHours} 小时）`,
          content: `您的「${plan.stageName}」阶段规划已发送 ${unconfirmedHours} 小时，请尽快查看并确认。`,
          relatedId: plan.id,
        });
        console.log(
          `[check-unconfirmed-plans] 已通知学生 ${studentUser.name}（规划ID: ${plan.id}，超时${unconfirmedHours}h）`,
        );
      }
    }

    // ── 3天未确认：通知班主任 ─────────────────────────────────
    if (unconfirmedMs >= DAYS_3 && currentTeacher) {
      const existingTeacherNotif = await prisma.notification.findFirst({
        where: {
          userId: currentTeacher.id,
          type: 'plan_unconfirmed_teacher',
          relatedId: plan.id,
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      });

      if (!existingTeacherNotif) {
        await createInAppNotification(prisma, {
          userId: currentTeacher.id,
          type: 'plan_unconfirmed_teacher',
          title: `[提醒] 学生 ${studentUser.name} 的规划已 ${unconfirmedDays} 天未确认`,
          content: `学生 ${studentUser.name} 的「${plan.stageName}」阶段规划已发送 ${unconfirmedDays} 天，学生尚未确认。请联系学生尽快处理。`,
          relatedId: plan.id,
        });
        console.log(
          `[check-unconfirmed-plans] 已通知班主任 ${currentTeacher.name}（规划ID: ${plan.id}，超时${unconfirmedDays}天）`,
        );
      }
    }

    // ── 7天未确认：通知学科负责人 ─────────────────────────────
    if (unconfirmedMs >= DAYS_7) {
      const subjectHeads = await prisma.userRole.findMany({
        where: {
          role: { code: 'subject_head' },
          subjectId: student.subjectId,
        },
        include: { user: { select: { id: true, name: true } } },
      });

      for (const head of subjectHeads) {
        const existingHeadNotif = await prisma.notification.findFirst({
          where: {
            userId: head.userId,
            type: 'plan_unconfirmed_dept',
            relatedId: plan.id,
            createdAt: { gte: todayStart, lte: todayEnd },
          },
        });

        if (!existingHeadNotif) {
          await createInAppNotification(prisma, {
            userId: head.userId,
            type: 'plan_unconfirmed_dept',
            title: `[升级告警] 学生 ${studentUser.name} 的规划已 ${unconfirmedDays} 天未确认`,
            content: `学生 ${studentUser.name} 的「${plan.stageName}」阶段规划已发送 ${unconfirmedDays} 天仍未确认，班主任催促无效。请您介入处理。`,
            relatedId: plan.id,
          });
          console.log(
            `[check-unconfirmed-plans] 已通知学科负责人 ${head.user.name}（规划ID: ${plan.id}，超时${unconfirmedDays}天）`,
          );
        }
      }
    }
  }

  console.log('[check-unconfirmed-plans] 任务执行完成');
}

/**
 * 创建 BullMQ Worker，监听队列并执行任务
 */
export function createCheckUnconfirmedPlansWorker(prisma: PrismaClient): Worker {
  const connection = createRedisConnection();

  const worker = new Worker(
    'check-unconfirmed-plans',
    async (_job: Job) => {
      await runCheckUnconfirmedPlans(prisma);
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[check-unconfirmed-plans] 任务 ${job.id} 完成`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[check-unconfirmed-plans] 任务 ${job?.id} 失败:`, err);
  });

  worker.on('error', (err) => {
    console.error('[check-unconfirmed-plans] Worker 错误:', err);
  });

  return worker;
}
