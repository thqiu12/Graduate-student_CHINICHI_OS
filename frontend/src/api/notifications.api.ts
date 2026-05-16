// src/api/notifications.api.ts
// 知日塾大学院考学进度管理系统 - 通知 API 层

import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import apiClient from './client';

// ─── 类型定义 ─────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  content?: string | null;
  relatedId?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  data: Notification[];
  unreadCount: number;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// ─── 通知类型中文映射 ──────────────────────────────────────

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  plan_sent:       '📋 规划已发送',
  plan_confirmed:  '✅ 规划已确认',
  plan_rejected:   '⚠️ 规划有异议',
  plan_changed:    '🔄 规划已更新',
  task_due:        '⏰ 任务即将截止',
  task_overdue:    '🔴 任务已逾期',
  teacher_push:    '📢 班主任通知',
  risk_tagged:     '⚠️ 风险标签',
  system:          '🔔 系统通知',
};

// ─── Query Keys ───────────────────────────────────────────

export const notificationQueryKeys = {
  all: ['notifications'] as const,
  list: (params?: Record<string, unknown>) => ['notifications', 'list', params] as const,
  unread: () => ['notifications', 'unread'] as const,
};

// ─── API 函数 ─────────────────────────────────────────────

async function fetchNotifications(isRead?: boolean): Promise<NotificationsResponse> {
  const params: Record<string, string> = { pageSize: '50' };
  if (isRead !== undefined) params['isRead'] = String(isRead);
  const res = await apiClient.get<NotificationsResponse>('/notifications', { params });
  return res.data;
}

async function markRead(id: string): Promise<void> {
  await apiClient.post(`/notifications/${id}/read`);
}

async function markAllRead(): Promise<{ count: number }> {
  const res = await apiClient.post<{ count: number }>('/notifications/read-all');
  return res.data;
}

// ─── Hooks ────────────────────────────────────────────────

export function useNotifications(isRead?: boolean): UseQueryResult<NotificationsResponse, Error> {
  return useQuery({
    queryKey: notificationQueryKeys.list({ isRead }),
    queryFn: () => fetchNotifications(isRead),
    staleTime: 15 * 1000, // 15秒内不重新请求
  });
}

export function useMarkRead(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
  });
}

export function useMarkAllRead(): UseMutationResult<{ count: number }, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
  });
}
