// src/App.tsx
// 知日塾大学院考学进度管理系统 - 路由配置（完整版）

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Spin, ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/auth.store';
import AppLayout from './components/Layout/AppLayout';

// ─── 懒加载页面组件 ────────────────────────────────────────
const LoginPage = lazy(() => import('./pages/auth/Login'));

// 学生
const StudentHomePage = lazy(() => import('./pages/student/Home'));
const PlanConfirmPage = lazy(() => import('./pages/student/PlanConfirm'));

// 班主任
const TeacherDashboard = lazy(() => import('./pages/teacher/Dashboard'));
const StudentListPage = lazy(() => import('./pages/teacher/StudentList'));
const StudentDetailPage = lazy(() => import('./pages/teacher/StudentDetail'));

// 管理端
const SubjectHeadDashboard = lazy(() => import('./pages/management/SubjectHeadDashboard'));
const AdminDashboard = lazy(() => import('./pages/management/AdminDashboard'));

// ─── React Query Client ────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30 * 1000, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

// ─── 加载占位 ──────────────────────────────────────────────
const PageLoading: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" tip="加载中..." />
  </div>
);

// ─── 路由守卫：学生 ────────────────────────────────────────
const RequireStudent: React.FC = () => {
  const { isAuthenticated, isStudent } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isStudent) return <Navigate to="/teacher" replace />;
  return <Outlet />;
};

// ─── 路由守卫：教师及以上 ──────────────────────────────────
const RequireTeacher: React.FC = () => {
  const { isAuthenticated, isTeacher, isSubjectHead, isAdminTotal } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isTeacher && !isSubjectHead && !isAdminTotal) return <Navigate to="/student" replace />;
  return <Outlet />;
};

// ─── 路由守卫：管理端 ──────────────────────────────────────
const RequireManagement: React.FC = () => {
  const { isAuthenticated, isSubjectHead, isAdminTotal } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isSubjectHead && !isAdminTotal) return <Navigate to="/teacher" replace />;
  return <Outlet />;
};

// ─── 智能根路由 ────────────────────────────────────────────
const RootRedirect: React.FC = () => {
  const { isAuthenticated, isStudent, isTeacher, isSubjectHead, isAdminTotal } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isAdminTotal) return <Navigate to="/admin" replace />;
  if (isSubjectHead) return <Navigate to="/subject-head" replace />;
  if (isTeacher) return <Navigate to="/teacher" replace />;
  if (isStudent) return <Navigate to="/student" replace />;
  return <Navigate to="/login" replace />;
};

// ─── 主应用 ────────────────────────────────────────────────
const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 6,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif',
          },
        }}
      >
        <AntdApp>
          <BrowserRouter>
            <Suspense fallback={<PageLoading />}>
              <Routes>
                {/* 根路由 */}
                <Route path="/" element={<RootRedirect />} />
                <Route path="/login" element={<LoginPage />} />

                {/* ─── 学生路由（含布局）──────────── */}
                <Route element={<RequireStudent />}>
                  <Route element={<AppLayout />}>
                    <Route path="/student" element={<StudentHomePage />} />
                    <Route path="/student/plan-confirm/:planId" element={<PlanConfirmPage />} />
                  </Route>
                </Route>

                {/* ─── 教师路由（含布局）──────────── */}
                <Route element={<RequireTeacher />}>
                  <Route element={<AppLayout />}>
                    <Route path="/teacher" element={<TeacherDashboard />} />
                    <Route path="/teacher/students" element={<StudentListPage />} />
                    <Route path="/teacher/students/:id" element={<StudentDetailPage />} />
                  </Route>
                </Route>

                {/* ─── 管理端路由（含布局）─────────── */}
                <Route element={<RequireManagement />}>
                  <Route element={<AppLayout />}>
                    <Route path="/subject-head" element={<SubjectHeadDashboard />} />
                    <Route path="/admin" element={<AdminDashboard />} />
                  </Route>
                </Route>

                {/* 404 */}
                <Route path="*" element={
                  <div style={{ textAlign: 'center', padding: '64px', color: '#666' }}>
                    <h1>404</h1><p>页面不存在</p>
                  </div>
                } />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AntdApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
};

export default App;
