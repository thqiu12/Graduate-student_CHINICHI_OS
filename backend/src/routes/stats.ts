// src/routes/stats.ts
// 知日塾大学院考学进度管理系统 - 统计看板路由

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middlewares/authenticate';
import { authorize, Roles } from '../middlewares/authorize';

export async function statsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/stats/overview
  fastify.get(
    '/stats/overview',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD])] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const [totalStudents, riskStudentsRaw, plansData] = await Promise.all([
        fastify.prisma.student.count(),
        fastify.prisma.studentRiskTag.findMany({
          where: { removedAt: null },
          select: { studentId: true },
          distinct: ['studentId'],
        }),
        fastify.prisma.periodPlan.groupBy({
          by: ['status'],
          _count: { id: true },
        }),
      ]);

      const planStats: Record<string, number> = {};
      for (const p of plansData) {
        planStats[p.status] = p._count.id;
      }

      // 7天内无规划的学生
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const studentsWithPlans = await fastify.prisma.periodPlan.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { studentId: true },
        distinct: ['studentId'],
      });
      const studentsWithPlanIds = new Set(studentsWithPlans.map(p => p.studentId));
      const allStudentIds = await fastify.prisma.student.findMany({ select: { id: true } });
      const noRecentPlanCount = allStudentIds.filter(s => !studentsWithPlanIds.has(s.id)).length;

      return reply.send({
        totalStudents,
        riskStudents: riskStudentsRaw.length,
        noRecentPlanStudents: noRecentPlanCount,
        planStats,
        pendingConfirmation: (planStats['pending'] ?? 0) + (planStats['change_pending'] ?? 0),
      });
    }
  );

  // GET /api/stats/exam-seasons
  fastify.get(
    '/stats/exam-seasons',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD])] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const schools = await fastify.prisma.targetSchool.findMany({
        include: { innoTracking: { select: { status: true } } },
      });

      const seasons: Record<string, { total: number; innoCount: number; innoRate: string }> = {
        summer: { total: 0, innoCount: 0, innoRate: '0%' },
        winter: { total: 0, innoCount: 0, innoRate: '0%' },
      };

      for (const school of schools) {
        for (const examType of school.examTypes) {
          if (!['summer', 'winter'].includes(examType)) continue;
          const season = examType as 'summer' | 'winter';
          seasons[season]!.total++;
          if (school.innoTracking?.status === 'confirmed') {
            seasons[season]!.innoCount++;
          }
          break; // 每所学校只计一次
        }
      }

      for (const key of ['summer', 'winter'] as const) {
        const s = seasons[key]!;
        s.innoRate = s.total > 0 ? `${Math.round((s.innoCount / s.total) * 100)}%` : '0%';
      }

      return reply.send({ data: seasons });
    }
  );

  // GET /api/stats/alerts
  fastify.get(
    '/stats/alerts',
    { preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD])] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600 * 1000);

      const students = await fastify.prisma.student.findMany({
        include: {
          user: { select: { name: true } },
          periodPlans: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, createdAt: true, sentAt: true },
          },
        },
      });

      const noPlan: Array<{ id: string; name: string | undefined; planStatus: string }> = [];
      const pendingTooLong: Array<{ id: string; name: string | undefined; sentAt: Date | null | undefined; planStatus: string }> = [];

      for (const s of students) {
        const latestPlan = s.periodPlans[0];
        if (!latestPlan) {
          noPlan.push({ id: s.id, name: s.user?.name, planStatus: 'none' });
        } else if (latestPlan.status === 'draft') {
          if (new Date(latestPlan.createdAt) < sevenDaysAgo) {
            noPlan.push({ id: s.id, name: s.user?.name, planStatus: latestPlan.status });
          }
        } else if (latestPlan.status === 'pending' || latestPlan.status === 'change_pending') {
          if (latestPlan.sentAt && new Date(latestPlan.sentAt) < threeDaysAgo) {
            pendingTooLong.push({
              id: s.id,
              name: s.user?.name,
              sentAt: latestPlan.sentAt,
              planStatus: latestPlan.status,
            });
          }
        }
      }

      return reply.send({ noPlan, pendingTooLong });
    }
  );

  // ─── GET /api/stats/calendar ─── 日历视图事件接口
  fastify.get(
    '/stats/calendar',
    {
      preHandler: [
        authenticate,
        authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD, Roles.TEACHER]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { start?: string; end?: string };
      const start = query.start ? new Date(query.start) : new Date(Date.now() - 90 * 24 * 3600 * 1000);
      const end = query.end ? new Date(query.end) : new Date(Date.now() + 180 * 24 * 3600 * 1000);

      const events: Array<{
        date: string;
        type: 'task_due' | 'school_apply' | 'exam' | 'plan_end';
        studentName: string;
        title: string;
        detail: string;
      }> = [];

      // 1. 任务截止（task_due）—— 红点
      const tasks = await fastify.prisma.periodPlanTask.findMany({
        where: {
          dueDate: { gte: start, lte: end },
          status: { not: 'done' },
        },
        include: {
          plan: {
            include: {
              student: { include: { user: { select: { name: true } } } },
            },
          },
        },
      });
      for (const t of tasks) {
        if (!t.dueDate) continue;
        events.push({
          date: t.dueDate.toISOString().slice(0, 10),
          type: 'task_due',
          studentName: t.plan.student.user?.name ?? '未知',
          title: t.title,
          detail: `任务截止：${t.title}（${t.priority}优先级）`,
        });
      }

      // 2. 出愿截止（school_apply）—— 黄点
      const schools = await fastify.prisma.targetSchool.findMany({
        where: {
          applicationEnd: { gte: start, lte: end },
        },
        include: {
          student: { include: { user: { select: { name: true } } } },
        },
      });
      for (const s of schools) {
        if (!s.applicationEnd) continue;
        events.push({
          date: s.applicationEnd.toISOString().slice(0, 10),
          type: 'school_apply',
          studentName: s.student.user?.name ?? '未知',
          title: s.universityName,
          detail: `出愿截止：${s.universityName}${s.department ? ' ' + s.department : ''}`,
        });
      }

      // 3. 考试日期（exam）—— 绿点
      const examSchools = await fastify.prisma.targetSchool.findMany({
        where: {
          examDate: { gte: start, lte: end },
        },
        include: {
          student: { include: { user: { select: { name: true } } } },
        },
      });
      for (const s of examSchools) {
        if (!s.examDate) continue;
        events.push({
          date: s.examDate.toISOString().slice(0, 10),
          type: 'exam',
          studentName: s.student.user?.name ?? '未知',
          title: s.universityName,
          detail: `考试日期：${s.universityName}${s.department ? ' ' + s.department : ''}`,
        });
      }

      // 4. 阶段结束（plan_end）—— 蓝点
      const plans = await fastify.prisma.periodPlan.findMany({
        where: {
          endDate: { gte: start, lte: end },
          status: { in: ['active', 'pending', 'change_pending'] },
        },
        include: {
          student: { include: { user: { select: { name: true } } } },
        },
      });
      for (const p of plans) {
        events.push({
          date: p.endDate.toISOString().slice(0, 10),
          type: 'plan_end',
          studentName: p.student.user?.name ?? '未知',
          title: p.stageName,
          detail: `阶段结束：${p.stageName}（${p.periodCode}）`,
        });
      }

      return reply.send({ data: events });
    },
  );

  // ─── GET /api/stats/teacher-dashboard ─── 班主任看板专用统计
  // 返回：阶段分布 + 内诺状态分布（仅理科学生的志望校内诺）
  fastify.get(
    '/stats/teacher-dashboard',
    {
      preHandler: [
        authenticate,
        authorize([Roles.TEACHER, Roles.SUBJECT_HEAD, Roles.ADMIN_TOTAL]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 获取当前班主任负责的所有学生
      const students = await fastify.prisma.student.findMany({
        select: {
          id: true,
          periodPlans: {
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              periodCode: true,
              stageName: true,
              status: true,
            },
          },
          targetSchools: {
            select: {
              id: true,
              universityName: true,
              innoTracking: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      });

      // 阶段分布统计
      const stageMap: Record<string, { code: string; stageName: string; count: number }> = {};
      let noActivePlan = 0;

      for (const s of students) {
        const latest = s.periodPlans[0];
        if (!latest || latest.status !== 'active') {
          noActivePlan++;
          continue;
        }
        const key = latest.periodCode;
        if (!stageMap[key]) {
          stageMap[key] = { code: key, stageName: latest.stageName, count: 0 };
        }
        stageMap[key].count++;
      }

      const stageDistribution = Object.values(stageMap).sort((a, b) =>
        a.code.localeCompare(b.code),
      );

      // 内诺状态统计（汇总所有学生的志望校内诺）
      const innoStatusMap: Record<string, number> = {
        not_started: 0,
        in_progress: 0,
        confirmed: 0,
        rejected: 0,
      };
      let innoTotal = 0;

      for (const s of students) {
        for (const school of s.targetSchools) {
          if (school.innoTracking) {
            const status = school.innoTracking.status ?? 'not_started';
            innoStatusMap[status] = (innoStatusMap[status] ?? 0) + 1;
            innoTotal++;
          }
        }
      }

      // 内诺确认率
      const innoRate =
        innoTotal > 0
          ? Math.round((innoStatusMap['confirmed'] / innoTotal) * 100)
          : 0;

      return reply.send({
        totalStudents: students.length,
        noActivePlan,
        stageDistribution,
        inno: {
          total: innoTotal,
          confirmed: innoStatusMap['confirmed'],
          inProgress: innoStatusMap['in_progress'],
          notStarted: innoStatusMap['not_started'],
          rejected: innoStatusMap['rejected'],
          rate: innoRate,
        },
      });
    },
  );
}
