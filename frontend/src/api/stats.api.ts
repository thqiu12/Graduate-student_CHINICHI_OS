// src/api/stats.api.ts
// 统计看板 API

import { useQuery } from '@tanstack/react-query';
import apiClient from './client';

export function useStatsOverview() {
  return useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: async () => {
      const res = await apiClient.get('/stats/overview');
      return res.data as {
        totalStudents: number;
        riskStudents: number;
        noRecentPlanStudents: number;
        pendingConfirmation: number;
        planStats: Record<string, number>;
      };
    },
  });
}

export function useExamSeasonStats() {
  return useQuery({
    queryKey: ['stats', 'exam-seasons'],
    queryFn: async () => {
      const res = await apiClient.get('/stats/exam-seasons');
      return res.data as {
        data: Record<string, { total: number; innoCount: number; innoRate: string }>;
      };
    },
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ['stats', 'alerts'],
    queryFn: async () => {
      const res = await apiClient.get('/stats/alerts');
      return res.data as {
        noPlan: Array<{ id: string; name: string; planStatus: string }>;
        pendingTooLong: Array<{ id: string; name: string; sentAt: string; planStatus: string }>;
      };
    },
  });
}
