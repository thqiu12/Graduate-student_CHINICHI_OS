// src/stores/auth.store.ts
// 知日塾大学院考学进度管理系统 - 认证状态 Zustand Store
// 管理：user, token, role, login/logout actions

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { tokenStorage } from '../api/client';

// ─── 类型定义 ─────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  phone?: string | null;
  avatarUrl?: string | null;
  roles: string[];
  studentId?: string | null; // 学生角色专有，Student 表的 ID
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface AuthState {
  // 状态
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;

  // 计算属性（便于角色检查）
  isAdminTotal: boolean;
  isSubjectHead: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  isManagement: boolean;    // 学科负责人或教务总负责人

  // Actions
  login: (data: LoginResponse) => void;
  logout: () => void;
  updateUser: (user: Partial<AuthUser>) => void;
}

// ─── 角色检查辅助函数 ─────────────────────────────────────
const checkRole = (roles: string[], role: string): boolean => roles.includes(role);

// ─── Store 定义 ───────────────────────────────────────────
export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      // 初始状态
      user: null,
      token: tokenStorage.getToken(),
      isAuthenticated: !!tokenStorage.getToken(),
      isAdminTotal: false,
      isSubjectHead: false,
      isTeacher: false,
      isStudent: false,
      isManagement: false,

      // 登录
      login: (data: LoginResponse) => {
        tokenStorage.setToken(data.accessToken);
        tokenStorage.setRefreshToken(data.refreshToken);

        const roles = data.user.roles;
        set({
          user: data.user,
          token: data.accessToken,
          isAuthenticated: true,
          isAdminTotal: checkRole(roles, 'admin_total'),
          isSubjectHead: checkRole(roles, 'subject_head'),
          isTeacher: checkRole(roles, 'teacher'),
          isStudent: checkRole(roles, 'student'),
          isManagement:
            checkRole(roles, 'admin_total') || checkRole(roles, 'subject_head'),
        });
      },

      // 登出
      logout: () => {
        tokenStorage.clearAll();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isAdminTotal: false,
          isSubjectHead: false,
          isTeacher: false,
          isStudent: false,
          isManagement: false,
        });
      },

      // 更新用户信息（如修改头像后）
      updateUser: (updates: Partial<AuthUser>) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        }));
      },
    }),
    {
      name: 'chinichi-auth', // localStorage key
      storage: createJSONStorage(() => localStorage),
      // 只持久化必要的字段（不持久化计算属性，登录时重新计算）
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
      // 从持久化数据恢复时重新计算角色属性
      onRehydrateStorage: () => (state) => {
        if (state?.user?.roles) {
          const roles = state.user.roles;
          state.isAuthenticated = !!state.token;
          state.isAdminTotal = checkRole(roles, 'admin_total');
          state.isSubjectHead = checkRole(roles, 'subject_head');
          state.isTeacher = checkRole(roles, 'teacher');
          state.isStudent = checkRole(roles, 'student');
          state.isManagement =
            checkRole(roles, 'admin_total') || checkRole(roles, 'subject_head');
        }
      },
    },
  ),
);

// ─── 监听全局登出事件（由 axios 拦截器触发）────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.getState().logout();
  });
}

// ─── 选择器（优化渲染性能）──────────────────────────────
export const selectUser = (state: AuthState): AuthUser | null => state.user;
export const selectIsAuthenticated = (state: AuthState): boolean => state.isAuthenticated;
export const selectIsStudent = (state: AuthState): boolean => state.isStudent;
export const selectIsTeacher = (state: AuthState): boolean =>
  state.isTeacher || state.isSubjectHead || state.isAdminTotal;
export const selectIsManagement = (state: AuthState): boolean => state.isManagement;
