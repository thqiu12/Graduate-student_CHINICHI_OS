// src/pages/auth/Login.tsx
// 知日塾大学院考学进度管理系统 - 登录页（账号密码，纯受控 state）

import React, { useState } from 'react';
import { Button, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import apiClient from '../../api/client';

const { Title, Text } = Typography;

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const handleLogin = async () => {
    if (!phone) { messageApi.error('请输入手机号'); return; }
    if (!password) { messageApi.error('请输入密码'); return; }

    setLoading(true);
    try {
      const res = await apiClient.post('/auth/login', { phone, password });
      const { accessToken, refreshToken, user } = res.data.data;
      login({ user, accessToken, refreshToken });
      const roles: string[] = user.roles ?? [];
      if (roles.includes('admin_total')) navigate('/admin', { replace: true });
      else if (roles.includes('subject_head')) navigate('/subject-head', { replace: true });
      else if (roles.includes('teacher')) navigate('/teacher', { replace: true });
      else navigate('/student', { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        '登录失败，请检查账号和密码';
      messageApi.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (p: string, pw: string) => {
    setPhone(p);
    setPassword(pw);
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/login', { phone: p, password: pw });
      const { accessToken, refreshToken, user } = res.data.data;
      login({ user, accessToken, refreshToken });
      const roles2: string[] = user.roles ?? [];
      if (roles2.includes('admin_total')) navigate('/admin', { replace: true });
      else if (roles2.includes('subject_head')) navigate('/subject-head', { replace: true });
      else if (roles2.includes('teacher')) navigate('/teacher', { replace: true });
      else navigate('/student', { replace: true });
    } catch {
      messageApi.error('快速登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {contextHolder}
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 16,
      }}>
        <div style={{
          width: '100%', maxWidth: 400, background: '#fff',
          borderRadius: 12, padding: '36px 32px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Title level={2} style={{ marginBottom: 4, fontWeight: 700 }}>知日塾</Title>
            <Text type="secondary">大学院考学进度管理系统</Text>
          </div>

          {/* 手机号 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
              手机号
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="请输入手机号"
              style={{
                width: '100%', height: 44, padding: '0 12px',
                border: '1px solid #d9d9d9', borderRadius: 8,
                fontSize: 15, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 密码 */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="请输入密码"
              autoComplete="current-password"
              style={{
                width: '100%', height: 44, padding: '0 12px',
                border: '1px solid #d9d9d9', borderRadius: 8,
                fontSize: 15, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <Button
            type="primary" block loading={loading}
            onClick={handleLogin}
            style={{ height: 44, fontSize: 16, borderRadius: 8 }}
          >
            登 录
          </Button>

          {/* 开发环境快速登录 */}
          {import.meta.env.DEV && (
            <div style={{ marginTop: 24 }}>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>开发环境快速登录</Text>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: '学生：测试学生（已有规划）', phone: '13900000003', color: '#1677ff' },
                  { label: '学生：张思远（规划已确认）', phone: '13812345678', color: '#13c2c2' },
                  { label: '以班主任身份登录', phone: '13900000002', color: '#52c41a' },
                  { label: '以教务总负责人登录', phone: '13900000001', color: '#722ed1' },
                ].map(item => (
                  <button key={item.phone}
                    onClick={() => quickLogin(item.phone, 'chinichi2026')}
                    style={{
                      background: item.color, color: '#fff', border: 'none',
                      borderRadius: 6, height: 36, cursor: 'pointer', fontSize: 13,
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default LoginPage;
