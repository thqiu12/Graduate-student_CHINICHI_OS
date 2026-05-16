// src/api/plans.api.ts
// 知日塾大学院考学进度管理系统 - 规划相关 API 函数与 React Query Hooks
// 完整实现：useStudentPlans, useSendPlan, useConfirmPlan, useRejectPlan, useChangePlan

import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import apiClient from './client';
import type {
  PeriodPlan,
  PlansResponse,
  PlanResponse,
  CreatePlanRequest,
  ChangePlanRequest,
  RejectPlanRequest,
} from '../types/plan';
import type { OperationLog } from '../types/student';

// ─── API 函数 ─────────────────────────────────────────────

/**
 * 获取学生所有规划
 */
async function fetchStudentPlans(studentId: string): Promise<PeriodPlan[]> {
  const response = await apiClient.get<PlansResponse>(`/students/${studentId}/plans`);
  return response.data.data;
}

/**
 * 创建规划（草稿）
 */
async function createPlan(
  studentId: string,
  body: CreatePlanRequest,
): Promise<PeriodPlan> {
  const response = await apiClient.post<PlanResponse>(`/students/${studentId}/plans`, body);
  return response.data.data;
}

/**
 * 发送规划给学生确认
 */
async function sendPlan(studentId: string, planId: string): Promise<PeriodPlan> {
  const response = await apiClient.post<PlanResponse>(
    `/students/${studentId}/plans/${planId}/send`,
  );
  return response.data.data;
}

/**
 * 学生确认规划
 */
async function confirmPlan(studentId: string, planId: string): Promise<PeriodPlan> {
  const response = await apiClient.post<PlanResponse>(
    `/students/${studentId}/plans/${planId}/confirm`,
  );
  return response.data.data;
}

/**
 * 学生提出异议
 */
async function rejectPlan(
  studentId: string,
  planId: string,
  body: RejectPlanRequest,
): Promise<void> {
  await apiClient.post(`/students/${studentId}/plans/${planId}/reject`, body);
}

/**
 * 发起规划变更
 */
async function changePlan(
  studentId: string,
  planId: string,
  body: ChangePlanRequest,
): Promise<PeriodPlan> {
  const response = await apiClient.post<PlanResponse>(
    `/students/${studentId}/plans/${planId}/change`,
    body,
  );
  return response.data.data;
}

/**
 * 获取操作日志
 */
async function fetchOperationLogs(studentId: string): Promise<OperationLog[]> {
  const response = await apiClient.get<{ data: OperationLog[] }>(
    `/students/${studentId}/logs`,
  );
  return response.data.data;
}

// ─── React Query Hooks ────────────────────────────────────

// Query Key 工厂（保证一致性）
export const planQueryKeys = {
  all: (studentId: string) => ['plans', studentId] as const,
  logs: (studentId: string) => ['operation-logs', studentId] as const,
} as const;

/**
 * 获取学生所有规划的 Hook
 */
export function useStudentPlans(studentId: string): UseQueryResult<PeriodPlan[], Error> {
  return useQuery({
    queryKey: planQueryKeys.all(studentId),
    queryFn: () => fetchStudentPlans(studentId),
    enabled: !!studentId,
    staleTime: 30 * 1000, // 30秒内不重新请求
  });
}

/**
 * 获取操作日志的 Hook
 */
export function useOperationLogs(studentId: string): UseQueryResult<OperationLog[], Error> {
  return useQuery({
    queryKey: planQueryKeys.logs(studentId),
    queryFn: () => fetchOperationLogs(studentId),
    enabled: !!studentId,
  });
}

/**
 * 创建规划的 Mutation Hook
 */
export function useCreatePlan(
  studentId: string,
): UseMutationResult<PeriodPlan, Error, CreatePlanRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreatePlanRequest) => createPlan(studentId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planQueryKeys.all(studentId) });
    },
  });
}

/**
 * 发送规划给学生确认的 Mutation Hook
 */
export function useSendPlan(
  studentId: string,
): UseMutationResult<PeriodPlan, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planId: string) => sendPlan(studentId, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planQueryKeys.all(studentId) });
      queryClient.invalidateQueries({ queryKey: planQueryKeys.logs(studentId) });
    },
  });
}

/**
 * 学生确认规划的 Mutation Hook
 */
export function useConfirmPlan(
  studentId: string,
): UseMutationResult<PeriodPlan, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planId: string) => confirmPlan(studentId, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planQueryKeys.all(studentId) });
      queryClient.invalidateQueries({ queryKey: planQueryKeys.logs(studentId) });
    },
  });
}

/**
 * 学生提出异议的 Mutation Hook
 */
export function useRejectPlan(
  studentId: string,
): UseMutationResult<void, Error, { planId: string; content: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId, content }: { planId: string; content: string }) =>
      rejectPlan(studentId, planId, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planQueryKeys.all(studentId) });
      queryClient.invalidateQueries({ queryKey: planQueryKeys.logs(studentId) });
    },
  });
}

/**
 * 发起规划变更的 Mutation Hook
 */
export function useChangePlan(
  studentId: string,
): UseMutationResult<PeriodPlan, Error, { planId: string } & ChangePlanRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId, ...body }: { planId: string } & ChangePlanRequest) =>
      changePlan(studentId, planId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planQueryKeys.all(studentId) });
      queryClient.invalidateQueries({ queryKey: planQueryKeys.logs(studentId) });
    },
  });
}
