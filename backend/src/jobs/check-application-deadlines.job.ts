// src/jobs/check-application-deadlines.job.ts
// 出愿截止临近提醒。每天扫描 TargetSchool.applicationEnd 在 30/14/7/3/1 天后的志望校,
// 给学生 + 当前班主任 + 学科负责人各发一条站内通知。
// 同一 (school, day) 通过 (userId, type, relatedId, createdAt 当日) 防重。

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createRedisConnection } from './queue';
import { createInAppNotification } from '../utils/notifications';

const REMINDER_DAYS = [30, 14, 7, 3, 1] as const;
const NOTIFY_TYPE = 'application_deadline';

function dateOnly(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86400000);
}

export async function runCheckApplicationDeadlines(prisma: PrismaClient): Promise<void> {
  console.log('[check-application-deadlines] 扫描出愿截止...');

  const today = dateOnly(new Date());
  const todayStart = new Date(today);
  const tomorrowStart = new Date(today.getTime() + 86400000);
  const farLimit = new Date(today.getTime() + (REMINDER_DAYS[0] + 1) * 86400000);

  // 一次性把 [今天, today+31] 范围内有 applicationEnd 的志望校全捞回来
  const schools = await prisma.targetSchool.findMany({
    where: {
      applicationEnd: { gte: todayStart, lt: farLimit },
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

  if (schools.length === 0) {
    console.log('[check-application-deadlines] 近期无出愿截止');
    return;
  }

  // 一次查出所有相关学科的 subject_head,用于按 subjectId 索引
  const subjectIds = Array.from(
    new Set(
      schools
        .map((s) => s.student.subjectId)
        .filter((id): id is number => id !== null && id !== undefined),
    ),
  );
  const subjectHeadRoles = subjectIds.length === 0
    ? []
    : await prisma.userRole.findMany({
        where: {
          subjectId: { in: subjectIds },
          role: { code: 'subject_head' },
          user: { isActive: true },
        },
        select: { userId: true, subjectId: true },
      });
  const headsBySubject = new Map<number, string[]>();
  for (const r of subjectHeadRoles) {
    if (r.subjectId === null) continue;
    const list = headsBySubject.get(r.subjectId) ?? [];
    list.push(r.userId);
    headsBySubject.set(r.subjectId, list);
  }

  let sent = 0;

  for (const school of schools) {
    if (!school.applicationEnd) continue;
    const dueDay = dateOnly(school.applicationEnd);
    const remaining = daysBetween(dueDay, today);
    if (!REMINDER_DAYS.includes(remaining as (typeof REMINDER_DAYS)[number])) {
      continue;
    }

    const student = school.student;
    const recipients: Array<{ userId: string; role: 'student' | 'teacher' | 'subject_head' }> = [];
    recipients.push({ userId: student.user.id, role: 'student' });
    const currentTeacher = student.teachers[0]?.teacher;
    if (currentTeacher) {
      recipients.push({ userId: currentTeacher.id, role: 'teacher' });
    }
    const headIds = student.subjectId !== null && student.subjectId !== undefined
      ? headsBySubject.get(student.subjectId) ?? []
      : [];
    for (const headId of headIds) {
      if (headId !== student.user.id) {
        recipients.push({ userId: headId, role: 'subject_head' });
      }
    }

    const dueStr = dueDay.toISOString().slice(0, 10);
    const schoolName = `${school.universityName}${school.department ? ` · ${school.department}` : ''}`;

    for (const r of recipients) {
      // 防重:同一 (用户, type, relatedId=schoolId, 当日)只发一条
      const existing = await prisma.notification.findFirst({
        where: {
          userId: r.userId,
          type: NOTIFY_TYPE,
          relatedId: school.id,
          createdAt: { gte: todayStart, lt: tomorrowStart },
        },
        select: { id: true },
      });
      if (existing) continue;

      const title =
        r.role === 'student'
          ? `[出愿提醒] ${schoolName} 还有 ${remaining} 天截止`
          : `[出愿提醒] 学生 ${student.user.name} 的 ${schoolName} 还有 ${remaining} 天截止`;
      const content = `截止日: ${dueStr}。请尽快完成所有出愿材料提交。`;

      await createInAppNotification(prisma, {
        userId: r.userId,
        type: NOTIFY_TYPE,
        title,
        content,
        relatedId: school.id,
      });
      sent += 1;
    }
  }

  console.log(`[check-application-deadlines] 扫描 ${schools.length} 个志望校,发送 ${sent} 条通知`);
}

export function createCheckApplicationDeadlinesWorker(prisma: PrismaClient): Worker {
  const connection = createRedisConnection();

  const worker = new Worker(
    'check-deadline-approaching',
    async (_job: Job) => {
      await runCheckApplicationDeadlines(prisma);
    },
    { connection, concurrency: 1 },
  );

  worker.on('completed', (job) => {
    console.log(`[check-application-deadlines] 任务 ${job.id} 完成`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[check-application-deadlines] 任务 ${job?.id} 失败:`, err);
  });
  worker.on('error', (err) => {
    console.error('[check-application-deadlines] Worker 错误:', err);
  });

  return worker;
}
