// src/pages/auth/Login.tsx
// 知日塾大学院考学进度管理系统 - 角色选择直接进入（演示模式）

import React, { useState } from 'react';
import { Typography, message, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import apiClient from '../../api/client';

const { Title, Text } = Typography;

const ROLES = [
  {
    label: '教务总负责人',
    desc: '全局数据统览 · 学科管理',
    phone: '13900000001',
    bg: 'linear-gradient(135deg, #722ed1, #9254de)',
    icon: '★',
  },
  {
    label: '学科负责人',
    desc: '学科统筹 · 跨班级看板 · 数据汇总',
    phone: '13900000004',
    bg: 'linear-gradient(135deg, #eb2f96, #f759ab)',
    icon: '◆',
  },
  {
    label: '班主任',
    desc: '学生管理 · 规划制定 · 内诺跟踪',
    phone: '13900000002',
    bg: 'linear-gradient(135deg, #1677ff, #4096ff)',
    icon: '◈',
  },
  {
    label: '学生（测试学生）',
    desc: '查看规划 · 完成任务 · 查看通知',
    phone: '13900000003',
    bg: 'linear-gradient(135deg, #13c2c2, #36cfc9)',
    icon: '◉',
  },
  {
    label: '学生（张思远）',
    desc: '规划已确认 · 执行中',
    phone: '13812345678',
    bg: 'linear-gradient(135deg, #52c41a, #73d13d)',
    icon: '◎',
  },
];

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const handleEnter = async (phone: string, label: string) => {
    setLoading(phone);
    try {
      const res = await apiClient.post('/auth/login', {
        phone,
        password: 'chinichi2026',
      });
      const { accessToken, refreshToken, user } = res.data.data;
      login({ user, accessToken, refreshToken });

      const roles: string[] = user.roles ?? [];
      if (roles.includes('admin_total')) navigate('/admin', { replace: true });
      else if (roles.includes('subject_head')) navigate('/subject-head', { replace: true });
      else if (roles.includes('teacher')) navigate('/teacher', { replace: true });
      else navigate('/student', { replace: true });
    } catch {
      messageApi.error(`进入失败，请稍后重试`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      {contextHolder}
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 24,
      }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          {/* 标题 */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <Title level={1} style={{ color: '#fff', marginBottom: 8, fontWeight: 800, fontSize: 36 }}>
              知日塾
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16 }}>
              大学院考学进度管理系统
            </Text>
          </div>

          {/* 角色卡片 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {ROLES.map(role => (
              <button
                key={role.phone}
                onClick={() => handleEnter(role.phone, role.label)}
                disabled={loading !== null}
                style={{
                  background: role.bg,
                  border: 'none',
                  borderRadius: 16,
                  padding: '20px 24px',
                  cursor: loading !== null ? 'not-allowed' : 'pointer',
                  opacity: loading !== null && loading !== role.phone ? 0.6 : 1,
                  transition: 'transform 0.15s, opacity 0.15s',
                  textAlign: 'left',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
                onMouseEnter={e => {
                  if (loading === null) (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                }}
              >
                <span style={{ fontSize: 28, lineHeight: 1, color: 'rgba(255,255,255,0.9)', fontWeight: 300 }}>{role.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
                    {role.label}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
                    {role.desc}
                  </div>
                </div>
                {loading === role.phone
                  ? <Spin size="small" style={{ color: '#fff' }} />
                  : <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 20 }}>→</span>
                }
              </button>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
              演示系统 · 点击角色直接进入
            </Text>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
