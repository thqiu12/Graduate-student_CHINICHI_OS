// src/App.tsx
// 知日塾大学院考学进度管理系统 - 路由配置，按角色分流
// 使用 React Router v6 + 基于角色的路由守卫

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Spin, ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/auth.store';
import type { AuthState } from './stores/auth.store';

// ─── 懒加载页面组件 ───────────────────────────────────────
const StudentHomePage = lazy(() => import('./pages/student/Home'));
const PlanConfirmPage = lazy(() => import('./pages/student/PlanConfirm'));

// TODO: 以下页面待实现
// const LoginPage = lazy(() => import('./pages/auth/Login'));
// const TeacherDashboard = lazy(() => import('./pages/teacher/Dashboard'));
// const StudentListPage = lazy(() => import('./pages/teacher/StudentList'));
// const StudentDetailPage = lazy(() => import('./pages/teacher/StudentDetail'));
// const NotificationsPage = lazy(() => import('./pages/common/Notifications'));

// ─── React Query Client ───────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

// ─── 加载中占位组件 ───────────────────────────────────────
const PageLoading: React.FC = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
    }}
  >
    <Spin size="large" tip="加载中..." />
  </div>
);

// ─── 路由守卫：需要登录 ───────────────────────────────────
const RequireAuth: React.FC = () => {
  const isAuthenticated = useAuthStore((state: AuthState) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

// ─── 路由守卫：只有学生可访问 ────────────────────────────
const RequireStudent: React.FC = () => {
  const isStudent = useAuthStore((state: AuthState) => state.isStudent);
  const isAuthenticated = useAuthStore((state: AuthState) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!isStudent) {
    return <Navigate to="/teacher" replace />;
  }

  return <Outlet />;
};

// ─── 路由守卫：只有老师及以上可访问 ─────────────────────
const RequireTeacher: React.FC = () => {
  const isTeacher = useAuthStore(
    (state: AuthState) =>
      state.isTeacher || state.isSubjectHead || state.isAdminTotal,
  );
  const isAuthenticated = useAuthStore((state: AuthState) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!isTeacher) {
    return <Navigate to="/student" replace />;
  }

  return <Outlet />;
};

// ─── 智能根路由：按角色自动跳转 ─────────────────────────
const RootRedirect: React.FC = () => {
  const { isAuthenticated, isStudent, isTeacher, isSubjectHead, isAdminTotal } =
    useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isStudent && !isTeacher && !isSubjectHead && !isAdminTotal) {
    return <Navigate to="/student" replace />;
  }

  return <Navigate to="/teacher" replace />;
};

// ─── 临时登录页（骨架） ───────────────────────────────────
const LoginPage: React.FC = () => {
  const { login } = useAuthStore();

  const handleDevLogin = (role: string) => {
    // 开发测试用：模拟不同角色登录
    login({
      accessToken: 'dev-token',
      refreshToken: 'dev-refresh-token',
      user: {
        id: role === 'student'
          ? '00000000-0000-0000-0000-000000000003'
          : role === 'teacher'
            ? '00000000-0000-0000-0000-000000000002'
            : '00000000-0000-0000-0000-000000000001',
        name: role === 'student' ? '测试学生' : role === 'teacher' ? '测试班主任' : '测试管理员',
        roles: [role],
      },
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        gap: 16,
        background: '#f0f2f5',
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>
        知日塾大学院考学进度管理系统
      </div>
      <div style={{ color: '#666', marginBottom: 24 }}>开发环境 - 快速登录</div>
      <button
        onClick={() => handleDevLogin('student')}
        style={{
          padding: '12px 32px',
          background: '#1677ff',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 16,
        }}
      >
        以学生身份登录
      </button>
      <button
        onClick={() => handleDevLogin('teacher')}
        style={{
          padding: '12px 32px',
          background: '#52c41a',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 16,
        }}
      >
        以班主任身份登录
      </button>
      <button
        onClick={() => handleDevLogin('admin_total')}
        style={{
          padding: '12px 32px',
          background: '#722ed1',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 16,
        }}
      >
        以管理员身份登录
      </button>
    </div>
  );
};

// ─── 主应用组件 ───────────────────────────────────────────

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 6,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif',
          },
        }}
      >
        <AntdApp>
          <BrowserRouter>
            <Suspense fallback={<PageLoading />}>
              <Routes>
                {/* 根路由：自动按角色分流 */}
                <Route path="/" element={<RootRedirect />} />

                {/* 登录页 */}
                <Route path="/login" element={<LoginPage />} />

                {/* ─── 学生路由 ─────────────────────────── */}
                <Route element={<RequireStudent />}>
                  <Route path="/student" element={<StudentHomePage />} />
                  <Route
                    path="/student/plan-confirm/:planId"
                    element={<PlanConfirmPage />}
                  />
                  {/* TODO: 待实现的学生页面 */}
                  {/* <Route path="/student/notifications" element={<NotificationsPage />} /> */}
                  {/* <Route path="/student/schools" element={<StudentSchoolsPage />} /> */}
                  {/* <Route path="/student/files" element={<StudentFilesPage />} /> */}
                </Route>

                {/* ─── 教师路由 ─────────────────────────── */}
                <Route element={<RequireTeacher />}>
                  {/* TODO: 待实现的教师页面 */}
                  <Route
                    path="/teacher"
                    element={
                      <div style={{ padding: 24 }}>
                        <h2>班主任看板（待实现）</h2>
                        <p>此页面将展示：待跟进学生、风险学生列表、学生进度概览</p>
                      </div>
                    }
                  />
                  {/* <Route path="/teacher/students" element={<StudentListPage />} /> */}
                  {/* <Route path="/teacher/students/:id" element={<StudentDetailPage />} /> */}
                  {/* <Route path="/teacher/notifications" element={<NotificationsPage />} /> */}
                </Route>

                {/* ─── 通用路由 ─────────────────────────── */}
                <Route element={<RequireAuth />}>
                  {/* 通用页面待添加 */}
                </Route>

                {/* 404 */}
                <Route
                  path="*"
                  element={
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '64px',
                        color: '#666',
                      }}
                    >
                      <h1>404</h1>
                      <p>页面不存在</p>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AntdApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
};

export default App;
