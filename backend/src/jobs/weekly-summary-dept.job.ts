// src/jobs/weekly-summary-dept.job.ts
// 知日塾大学院考学进度管理系统 - 学科负责人周报任务
// 每周一 9:00 统计每位学科负责人所负责学科的数据：
//   - 学科学生总数
//   - 无规划学生数（无 period_plans 记录）
//   - 风险学生数（有未移除的风险标签）
//   - 逾期任务数
//   - 待确认规划数（status=pending）
// → 给每位学科负责人发送周报通知

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createRedisConnection } from './queue';

/**
 * 执行「学科负责人周报」的核心逻辑
 * 可独立调用（用于测试）或由 Worker 触发
 */
export async function runWeeklySummaryDept(prisma: PrismaClient): Promise<void> {
  console.log('[weekly-summary-dept] 开始生成学科负责人周报...');

  // 计算本周的起止时间（周一 00:00 ~ 周日 23:59）
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=周日, 1=周一...
  // 本周一
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  weekStart.setHours(0, 0, 0, 0);
  // 本周日
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // 查询所有学科负责人（含其负责的学科ID）
  const subjectHeadRoles = await prisma.userRole.findMany({
    where: {
      role: { code: 'subject_head' },
      subjectId: { not: null },
    },
    include: {
      user: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
    },
  });

  if (subjectHeadRoles.length === 0) {
    console.log('[weekly-summary-dept] 没有学科负责人，任务结束');
    return;
  }

  console.log(`[weekly-summary-dept] 发现 ${subjectHeadRoles.length} 位学科负责人，开始统计...`);

  for (const headRole of subjectHeadRoles) {
    const subjectId = headRole.subjectId as number;
    const subjectName = headRole.subject?.name ?? `学科${subjectId}`;
    const headUserId = headRole.userId;
    const headUserName = headRole.user.name;

    // 查询该学科下的所有学生
    const subjectStudents = await prisma.student.findMany({
      where: { subjectId },
      select: { id: true },
    });

    const studentIds = subjectStudents.map((s) => s.id);
    const totalStudentCount = studentIds.length;

    if (totalStudentCount === 0) {
      // 学科下没有学生，发简短通知
      await prisma.notification.create({
        data: {
          userId: headUserId,
          type: 'weekly_summary_dept',
          title: `[周报] ${subjectName} 学科周报`,
          content: `本周「${subjectName}」学科暂无在读学生。`,
        },
      });
      continue;
    }

    // 统计无规划学生数（没有任何 period_plans 记录）
    const studentsWithPlan = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        periodPlans: { some: {} },
      },
      select: { id: true },
    });
    const noPlanCount = totalStudentCount - studentsWithPlan.length;

    // 统计风险学生数（有未移除的风险标签）
    const riskStudentGroups = await prisma.studentRiskTag.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: studentIds },
        removedAt: null,
      },
    });
    const riskStudentCount = riskStudentGroups.length;

    // 统计逾期任务总数
    const overdueTaskCount = await prisma.periodPlanTask.count({
      where: {
        status: 'overdue',
        plan: { studentId: { in: studentIds } },
      },
    });

    // 统计待确认规划数（status=pending）
    const pendingPlanCount = await prisma.periodPlan.count({
      where: {
        studentId: { in: studentIds },
        status: 'pending',
      },
    });

    // 统计本周截止任务数
    const weekDueTaskCount = await prisma.periodPlanTask.count({
      where: {
        dueDate: { gte: weekStart, lte: weekEnd },
        status: { in: ['pending', 'in_progress'] },
        plan: { studentId: { in: studentIds } },
      },
    });

    // 构建周报内容
    const weekStartStr = weekStart.toLocaleDateString('zh-CN');
    const weekEndStr = weekEnd.toLocaleDateString('zh-CN');

    const title = `[周报] ${subjectName} 学科周报（${weekStartStr} - ${weekEndStr}）`;
    const content = [
      `「${subjectName}」学科本周（${weekStartStr} ~ ${weekEndStr}）数据概览：`,
      '',
      `• 学科学生总数：${totalStudentCount} 人`,
      `• 无规划学生数：${noPlanCount} 人`,
      `• 风险学生数：${riskStudentCount} 人`,
      `• 逾期任务数：${overdueTaskCount} 个`,
      `• 待确认规划数：${pendingPlanCount} 份`,
      `• 本周截止任务数：${weekDueTaskCount} 个`,
      '',
      noPlanCount > 0
        ? `⚠ 有 ${noPlanCount} 名学生尚未制定规划，请督促班主任跟进。`
        : '所有学生均已设定规划。',
    ].join('\n');

    // 发送周报通知
    await prisma.notification.create({
      data: {
        userId: headUserId,
        type: 'weekly_summary_dept',
        title,
        content,
      },
    });

    console.log(
      `[weekly-summary-dept] 已发送周报给学科负责人 ${headUserName}（${subjectName}，${totalStudentCount}名学生，${riskStudentCount}个风险，${overdueTaskCount}个逾期）`,
    );
  }

  console.log('[weekly-summary-dept] 学科负责人周报发送完成');
}

/**
 * 创建 BullMQ Worker，监听队列并执行任务
 */
export function createWeeklySummaryDeptWorker(prisma: PrismaClient): Worker {
  const connection = createRedisConnection();

  const worker = new Worker(
    'weekly-summary-dept',
    async (_job: Job) => {
      await runWeeklySummaryDept(prisma);
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[weekly-summary-dept] 任务 ${job.id} 完成`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[weekly-summary-dept] 任务 ${job?.id} 失败:`, err);
  });

  worker.on('error', (err) => {
    console.error('[weekly-summary-dept] Worker 错误:', err);
  });

  return worker;
}
