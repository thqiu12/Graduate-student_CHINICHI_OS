// src/api/schools.api.ts
// 志望校 API

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';

export interface TargetSchool {
  id: string;
  studentId: string;
  universityName: string;
  department?: string;
  rank?: number;
  professorName?: string;
  examTypes: string[];
  applicationStart?: string;
  applicationEnd?: string;
  examDate?: string;
  result?: string;
  createdAt: string;
  innoTracking?: { status: string; contactCount: number; confirmedAt?: string };
}

export function useTargetSchools(studentId: string) {
  return useQuery({
    queryKey: ['schools', studentId],
    queryFn: async () => {
      const res = await apiClient.get(`/students/${studentId}/target-schools`);
      return res.data as { data: TargetSchool[] };
    },
    enabled: !!studentId,
  });
}

export function useAddSchool(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<TargetSchool>) => {
      const res = await apiClient.post(`/students/${studentId}/target-schools`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schools', studentId] }),
  });
}

export function useDeleteSchool(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (schoolId: string) => {
      await apiClient.delete(`/students/${studentId}/target-schools/${schoolId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schools', studentId] }),
  });
}
