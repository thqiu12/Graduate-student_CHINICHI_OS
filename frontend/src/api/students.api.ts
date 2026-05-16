// src/api/students.api.ts
// 学生相关 API

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';

export interface StudentListItem {
  id: string;
  userId: string;
  campusId?: number;
  subjectId?: number;
  entryDate?: string;
  targetYear?: string;
  targetSeason?: string;
  jlptLevel?: string;
  jlptScore?: number;
  undergradMajor?: string;
  undergradGpa?: number;
  user: { id: string; name: string; phone?: string };
  riskTags?: Array<{ tag: { code: string; label: string; color?: string } }>;
  periodPlans?: Array<{ id: string; status: string; sentAt?: string }>;
}

export interface CreateStudentBody {
  name: string;
  phone: string;
  campusId: number;
  subjectId: number;
  teacherId: string;
  entryDate: string;
  targetYear?: string;
  targetSeason?: string;
  jlptLevel?: string;
  jlptScore?: number;
  undergradMajor?: string;
  undergradGpa?: number;
  notes?: string;
}

// 学生列表
export function useStudents(params?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['students', params],
    queryFn: async () => {
      const res = await apiClient.get('/students', { params });
      // 后端格式: { data: [...], pagination: { total, page, pageSize } }
      const raw = res.data;
      return {
        data: raw.data as StudentListItem[],
        total: raw.pagination?.total ?? raw.total ?? 0,
        page: raw.pagination?.page ?? raw.page ?? 1,
        pageSize: raw.pagination?.pageSize ?? raw.pageSize ?? 20,
      };
    },
  });
}

// 单个学生详情
export function useStudent(id: string) {
  return useQuery({
    queryKey: ['students', id],
    queryFn: async () => {
      const res = await apiClient.get(`/students/${id}`);
      // 后端格式: { data: {...} } 或直接 {...}
      return (res.data?.data ?? res.data) as StudentListItem;
    },
    enabled: !!id,
  });
}

// 创建学生
export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateStudentBody) => {
      const res = await apiClient.post('/students', body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students'] }),
  });
}
