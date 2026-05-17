// src/jobs/check-overdue-tasks.job.ts
// 知日塾大学院考学进度管理系统 - 逾期任务检查
// 每天 8:00 扫描 dueDate < 今天 且 status=pending/in_progress 的任务
// → 将状态更新为 overdue → 给学生和班主任发通知

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createRedisConnection } from './queue';

/**
 * 执行「逾期任务」检查的核心逻辑
 * 可独立调用（用于测试）或由 Worker 触发
 */
export async function runCheckOverdueTasks(prisma: PrismaClient): Promise<void> {
  console.log('[check-overdue-tasks] 开始扫描逾期任务...');

  // 今天零时（截止日 < 今天表示已逾期）
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 今天的起止时间，用于防重查询
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // 查询所有逾期但未标记为 overdue 的任务
  const overdueTasks = await prisma.periodPlanTask.findMany({
    where: {
      dueDate: { lt: today }, // 截止日早于今天
      status: { in: ['pending', 'in_progress'] }, // 尚未完成或标记逾期
    },
    include: {
      plan: {
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
      },
    },
  });

  if (overdueTasks.length === 0) {
    console.log('[check-overdue-tasks] 没有逾期任务，任务结束');
    return;
  }

  console.log(`[check-overdue-tasks] 发现 ${overdueTasks.length} 个逾期任务`);

  let updatedCount = 0;
  let notifiedCount = 0;

  for (const task of overdueTasks) {
    const student = task.plan.student;
    const studentUser = student.user;
    const currentTeacher = student.teachers[0]?.teacher ?? null;

    // 将任务状态更新为 overdue
    await prisma.periodPlanTask.update({
      where: { id: task.id },
      data: { status: 'overdue' },
    });
    updatedCount++;

    const dueDateStr = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString('zh-CN')
      : '未知';

    // 通知学生：任务已逾期
    const existingStudentNotif = await prisma.notification.findFirst({
      where: {
        userId: studentUser.id,
        type: 'task_overdue',
        relatedId: task.id,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    });

    if (!existingStudentNotif) {
      await prisma.notification.create({
        data: {
          userId: studentUser.id,
          type: 'task_overdue',
          title: `[逾期提醒] 任务「${task.title}」已逾期`,
          content: `您的任务「${task.title}」截止日为 ${dueDateStr}，已逾期未完成，请尽快处理。`,
          relatedId: task.id,
        },
      });
      notifiedCount++;
    }

    // 通知班主任：学生任务逾期
    if (currentTeacher) {
      const existingTeacherNotif = await prisma.notification.findFirst({
        where: {
          userId: currentTeacher.id,
          type: 'task_overdue_teacher',
          relatedId: task.id,
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      });

      if (!existingTeacherNotif) {
        await prisma.notification.create({
          data: {
            userId: currentTeacher.id,
            type: 'task_overdue_teacher',
            title: `[逾期提醒] 学生 ${studentUser.name} 的任务已逾期`,
            content: `学生 ${studentUser.name} 的任务「${task.title}」截止日为 ${dueDateStr}，已逾期未完成，请督促学生尽快完成。`,
            relatedId: task.id,
          },
        });
        notifiedCount++;
      }
    }
  }

  console.log(
    `[check-overdue-tasks] 任务执行完成，更新 ${updatedCount} 个任务为逾期，发送 ${notifiedCount} 条通知`,
  );
}

/**
 * 创建 BullMQ Worker，监听队列并执行任务
 */
export function createCheckOverdueTasksWorker(prisma: PrismaClient): Worker {
  const connection = createRedisConnection();

  const worker = new Worker(
    'check-overdue-tasks',
    async (_job: Job) => {
      await runCheckOverdueTasks(prisma);
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[check-overdue-tasks] 任务 ${job.id} 完成`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[check-overdue-tasks] 任务 ${job?.id} 失败:`, err);
  });

  worker.on('error', (err) => {
    console.error('[check-overdue-tasks] Worker 错误:', err);
  });

  return worker;
}
