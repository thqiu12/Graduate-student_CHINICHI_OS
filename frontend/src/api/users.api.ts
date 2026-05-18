// src/api/users.api.ts
// 知日塾大学院考学进度管理系统 - 用户账号管理 API

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';

// ─── 类型定义 ─────────────────────────────────────────────

export interface UserItem {
  id: string;
  name: string;
  phone?: string | null;
  roles: string[];
  campusId?: number | null;
  subjectId?: number | null;
  status: 'active' | 'disabled';
  createdAt?: string;
}

export interface UsersResponse {
  data: UserItem[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface CreateUserBody {
  name: string;
  phone: string;
  password: string;
  roleCode: string;
  campusId?: number | null;
  subjectId?: number | null;
}

export interface UpdateUserBody {
  name?: string;
  phone?: string;
  password?: string;
  roleCode?: string;
  campusId?: number | null;
  subjectId?: number | null;
}

export interface RoleOption {
  label: string;
  value: string;
}

export interface CampusItem {
  id: number;
  name: string;
}

export interface SubjectItem {
  id: number;
  name: string;
}

// ─── Query Keys ───────────────────────────────────────────

export const userQueryKeys = {
  all: ['users'] as const,
  list: (params?: Record<string, unknown>) => ['users', 'list', params] as const,
  roles: ['users', 'roles'] as const,
  campuses: ['users', 'campuses'] as const,
  subjects: ['users', 'subjects'] as const,
};

// ─── Hooks ────────────────────────────────────────────────

export function useUsers(params?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: userQueryKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<UsersResponse>('/users', { params });
      const raw = res.data;
      return {
        data: raw.data as UserItem[],
        total: raw.pagination?.total ?? 0,
        page: raw.pagination?.page ?? 1,
        pageSize: raw.pagination?.pageSize ?? 20,
      };
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateUserBody) => {
      const res = await apiClient.post('/users', body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: userQueryKeys.all }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & UpdateUserBody) => {
      const res = await apiClient.patch(`/users/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: userQueryKeys.all }),
  });
}

export function useDisableUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/users/${id}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: userQueryKeys.all }),
  });
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiClient.patch(`/users/${id}/status`, { isActive });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: userQueryKeys.all }),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: userQueryKeys.roles,
    queryFn: async () => {
      try {
        const res = await apiClient.get<{ data: RoleOption[] }>('/users/roles');
        return res.data.data as RoleOption[];
      } catch {
        // 后端无此接口时返回静态数据
        return [
          { label: '教务总负责人', value: 'admin_total' },
          { label: '学科负责人', value: 'subject_head' },
          { label: '班主任', value: 'teacher' },
          { label: '学生', value: 'student' },
        ] as RoleOption[];
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCampuses() {
  return useQuery({
    queryKey: userQueryKeys.campuses,
    queryFn: async () => {
      const res = await apiClient.get<{ data: CampusItem[] }>('/users/campuses');
      return res.data.data as CampusItem[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: userQueryKeys.subjects,
    queryFn: async () => {
      const res = await apiClient.get<{ data: SubjectItem[] }>('/users/subjects');
      return res.data.data as SubjectItem[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
