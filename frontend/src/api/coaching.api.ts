// src/api/coaching.api.ts
// 辅导记录 API

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';

export interface CoachingRecord {
  id: string;
  studentId: string;
  teacherId: string;
  coachedAt: string;
  form: string;
  content: string;
  nextDate?: string;
  schoolIds: string[];
  todos: Array<{ id: number; title: string; dueDate?: string }>;
  createdAt: string;
}

export interface AddCoachingBody {
  date: string;
  summary: string;
  nextAction?: string;
  form?: 'face' | 'online' | 'phone' | 'message';
  todos?: Array<{ title: string; dueDate?: string }>;
}

export function useCoachingRecords(studentId: string) {
  return useQuery({
    queryKey: ['coaching', studentId],
    queryFn: async () => {
      const res = await apiClient.get(`/students/${studentId}/coaching-records`);
      return res.data as { data: CoachingRecord[]; total: number };
    },
    enabled: !!studentId,
  });
}

export function useAddCoachingRecord(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AddCoachingBody) => {
      const res = await apiClient.post(`/students/${studentId}/coaching-records`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coaching', studentId] }),
  });
}
