// src/pages/auth/Login.tsx
// 知日塾大学院考学进度管理系统 - 手机号 + 密码登录

import React, { useState } from 'react';
import { Button, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import apiClient, { getErrorMessage } from '../../api/client';

const { Title, Text } = Typography;

interface LoginFormValues {
  phone: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const handleSubmit = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/login', {
        phone: values.phone.trim(),
        password: values.password,
      });
      const { accessToken, refreshToken, user } = res.data.data;
      login({ user, accessToken, refreshToken });

      const roles: string[] = user.roles ?? [];
      if (roles.includes('admin_total')) navigate('/admin', { replace: true });
      else if (roles.includes('subject_head')) navigate('/subject-head', { replace: true });
      else if (roles.includes('teacher')) navigate('/teacher', { replace: true });
      else navigate('/student', { replace: true });
    } catch (e) {
      messageApi.error(getErrorMessage(e, '手机号或密码错误'));
    } finally {
      setLoading(false);
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
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <Title level={1} style={{ color: '#fff', marginBottom: 8, fontWeight: 800, fontSize: 36 }}>
              知日塾
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16 }}>
              大学院考学进度管理系统
            </Text>
          </div>

          <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: '32px 28px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
          }}>
            <Form<LoginFormValues>
              layout="vertical"
              onFinish={handleSubmit}
              autoComplete="off"
              requiredMark={false}
            >
              <Form.Item
                label="手机号"
                name="phone"
                rules={[
                  { required: true, message: '请输入手机号' },
                  { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' },
                ]}
              >
                <Input size="large" placeholder="11 位手机号" maxLength={11} />
              </Form.Item>

              <Form.Item
                label="密码"
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password size="large" placeholder="账号密码" />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  loading={loading}
                  block
                >
                  登录
                </Button>
              </Form.Item>
            </Form>
          </div>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
              账号问题请联系教务管理员
            </Text>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
