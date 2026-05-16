// src/jobs/check-unset-plans.job.ts
// 知日塾大学院考学进度管理系统 - 未设定规划检查任务
// 每天 9:00 扫描入塾>7天无规划的学生，通知学科负责人，写 operation_logs

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createRedisConnection } from './queue';

const DAYS_THRESHOLD = 7; // 入塾超过7天未设定规划触发告警

/**
 * 执行「未设定规划」检查的核心逻辑
 * 可独立调用（用于测试）或由 Worker 触发
 */
export async function runCheckUnsetPlans(prisma: PrismaClient): Promise<void> {
  console.log('[check-unset-plans] 开始扫描未设定规划的学生...');

  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - DAYS_THRESHOLD);

  // 查找：入塾超过 7 天，且没有任何 period_plan 记录的学生
  const studentsWithoutPlan = await prisma.student.findMany({
    where: {
      entryDate: {
        lte: thresholdDate, // 入塾日期在7天前或更早
      },
      periodPlans: {
        none: {}, // 完全没有规划记录
      },
    },
    include: {
      user: { select: { id: true, name: true } },
      campus: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
      teachers: {
        where: { endedAt: null },
        include: { teacher: { select: { id: true, name: true } } },
        take: 1,
      },
    },
  });

  if (studentsWithoutPlan.length === 0) {
    console.log('[check-unset-plans] 未发现需要告警的学生，任务结束');
    return;
  }

  console.log(`[check-unset-plans] 发现 ${studentsWithoutPlan.length} 名学生未设定规划`);

  for (const student of studentsWithoutPlan) {
    const entryDays = Math.floor(
      (Date.now() - (student.entryDate?.getTime() ?? Date.now())) / (1000 * 60 * 60 * 24),
    );

    // 查找学科负责人
    const subjectHeads = await prisma.userRole.findMany({
      where: {
        role: { code: 'subject_head' },
        subjectId: student.subjectId,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    const alertContent = `【未设定规划告警】学生 ${student.user.name} 入塾已 ${entryDays} 天，班主任尚未设定考学规划。请督促班主任尽快制定规划。`;

    // 发送站内通知给学科负责人
    for (const head of subjectHeads) {
      await prisma.notification.create({
        data: {
          userId: head.userId,
          type: 'alert_no_plan',
          title: `[告警] ${student.user.name} 入塾 ${entryDays} 天未设定规划`,
          content: alertContent,
          relatedId: student.id,
        },
      });
    }

    // 如果没有学科负责人，通知教务总负责人
    if (subjectHeads.length === 0) {
      const adminUsers = await prisma.userRole.findMany({
        where: { role: { code: 'admin_total' } },
        include: { user: { select: { id: true, name: true } } },
      });

      for (const admin of adminUsers) {
        await prisma.notification.create({
          data: {
            userId: admin.userId,
            type: 'alert_no_plan',
            title: `[升级告警] ${student.user.name} 入塾 ${entryDays} 天未设定规划（无学科负责人）`,
            content: alertContent + '（注意：该学科暂无负责人，告警已升级）',
            relatedId: student.id,
          },
        });
      }
    }

    // 写入操作日志
    await prisma.operationLog.create({
      data: {
        studentId: student.id,
        actorId: null,
        actorName: '系统自动',
        actionType: 'alert_no_plan',
        targetType: 'student',
        targetId: student.id,
        detail: {
          entryDays,
          entryDate: student.entryDate,
          subjectName: student.subject?.name,
          campusName: student.campus?.name,
          alertSentTo: subjectHeads.map((h) => ({ id: h.userId, name: h.user.name })),
          triggeredAt: new Date().toISOString(),
        },
      },
    });

    console.log(
      `[check-unset-plans] 已告警：学生 ${student.user.name}（入塾${entryDays}天），通知了 ${subjectHeads.length} 位学科负责人`,
    );
  }

  console.log('[check-unset-plans] 任务执行完成');
}

/**
 * 创建 BullMQ Worker，监听队列并执行任务
 */
export function createCheckUnsetPlansWorker(prisma: PrismaClient): Worker {
  const connection = createRedisConnection();

  const worker = new Worker(
    'check-unset-plans',
    async (_job: Job) => {
      await runCheckUnsetPlans(prisma);
    },
    {
      connection,
      concurrency: 1, // 同时只运行一个检查任务
    },
  );

  worker.on('completed', (job) => {
    console.log(`[check-unset-plans] 任务 ${job.id} 完成`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[check-unset-plans] 任务 ${job?.id} 失败:`, err);
  });

  worker.on('error', (err) => {
    console.error('[check-unset-plans] Worker 错误:', err);
  });

  return worker;
}
