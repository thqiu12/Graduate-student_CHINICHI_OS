// src/jobs/weekly-summary-teacher.job.ts
// 知日塾大学院考学进度管理系统 - 班主任周报任务
// 每周一 8:30 统计每位班主任负责的学生数据：
//   - 风险学生数（有未移除的风险标签）
//   - 逾期任务数（status=overdue）
//   - 本周截止任务数（dueDate 在本周内）
// → 给每位班主任发送周报通知

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createRedisConnection } from './queue';

/**
 * 执行「班主任周报」的核心逻辑
 * 可独立调用（用于测试）或由 Worker 触发
 */
export async function runWeeklySummaryTeacher(prisma: PrismaClient): Promise<void> {
  console.log('[weekly-summary-teacher] 开始生成班主任周报...');

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

  // 查找所有当前在职的班主任（student_teacher 表中 endedAt=null）
  const activeTeacherRelations = await prisma.studentTeacher.findMany({
    where: { endedAt: null },
    select: { teacherId: true },
    distinct: ['teacherId'],
  });

  if (activeTeacherRelations.length === 0) {
    console.log('[weekly-summary-teacher] 没有在职班主任，任务结束');
    return;
  }

  const teacherIds = activeTeacherRelations.map((r) => r.teacherId);
  console.log(`[weekly-summary-teacher] 发现 ${teacherIds.length} 位班主任，开始统计...`);

  for (const teacherId of teacherIds) {
    // 获取该班主任当前负责的所有学生
    const teacherStudents = await prisma.studentTeacher.findMany({
      where: {
        teacherId,
        endedAt: null,
      },
      include: {
        teacher: { select: { id: true, name: true } },
        student: {
          select: { id: true },
        },
      },
    });

    if (teacherStudents.length === 0) continue;

    const teacherName = teacherStudents[0].teacher.name;
    const studentIds = teacherStudents.map((ts) => ts.student.id);

    // 统计风险学生数（有未移除的风险标签）
    const riskStudentCount = await prisma.studentRiskTag.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: studentIds },
        removedAt: null, // 未移除的风险标签
      },
    });

    // 统计逾期任务数（status=overdue，属于这批学生的规划）
    const overdueTaskCount = await prisma.periodPlanTask.count({
      where: {
        status: 'overdue',
        plan: {
          studentId: { in: studentIds },
        },
      },
    });

    // 统计本周截止的任务数（dueDate 在本周内，且未完成）
    const weekDueTaskCount = await prisma.periodPlanTask.count({
      where: {
        dueDate: {
          gte: weekStart,
          lte: weekEnd,
        },
        status: { in: ['pending', 'in_progress'] },
        plan: {
          studentId: { in: studentIds },
        },
      },
    });

    // 构建周报内容
    const weekStartStr = weekStart.toLocaleDateString('zh-CN');
    const weekEndStr = weekEnd.toLocaleDateString('zh-CN');

    const title = `[周报] ${weekStartStr} - ${weekEndStr} 您的学生周报`;
    const content = [
      `本周（${weekStartStr} ~ ${weekEndStr}）您负责的学生概况：`,
      `• 负责学生总数：${studentIds.length} 人`,
      `• 风险学生数：${riskStudentCount.length} 人（有未解除的风险标签）`,
      `• 逾期任务数：${overdueTaskCount} 个`,
      `• 本周截止任务数：${weekDueTaskCount} 个`,
      '',
      riskStudentCount.length > 0
        ? '请重点关注风险学生，及时跟进处理。'
        : '本周无风险学生，继续保持！',
    ].join('\n');

    // 发送周报通知
    await prisma.notification.create({
      data: {
        userId: teacherId,
        type: 'weekly_summary_teacher',
        title,
        content,
      },
    });

    console.log(
      `[weekly-summary-teacher] 已发送周报给班主任 ${teacherName}（${studentIds.length}名学生，${riskStudentCount.length}个风险，${overdueTaskCount}个逾期，${weekDueTaskCount}个本周截止）`,
    );
  }

  console.log('[weekly-summary-teacher] 班主任周报发送完成');
}

/**
 * 创建 BullMQ Worker，监听队列并执行任务
 */
export function createWeeklySummaryTeacherWorker(prisma: PrismaClient): Worker {
  const connection = createRedisConnection();

  const worker = new Worker(
    'weekly-summary-teacher',
    async (_job: Job) => {
      await runWeeklySummaryTeacher(prisma);
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[weekly-summary-teacher] 任务 ${job.id} 完成`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[weekly-summary-teacher] 任务 ${job?.id} 失败:`, err);
  });

  worker.on('error', (err) => {
    console.error('[weekly-summary-teacher] Worker 错误:', err);
  });

  return worker;
}
