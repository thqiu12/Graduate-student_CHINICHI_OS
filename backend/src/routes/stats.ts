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
}
