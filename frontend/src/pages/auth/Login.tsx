// src/pages/auth/Login.tsx
// 知日塾大学院考学进度管理系统 - 登录页（账号密码）

import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message, Divider, Space } from 'antd';
import { UserOutlined, LockOutlined, MobileOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import apiClient from '../../api/client';

const { Title, Text } = Typography;

interface LoginForm {
  phone: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<LoginForm>();

  const handleLogin = async (values: LoginForm) => {
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/login', {
        phone: values.phone,
        password: values.password,
      });
      const { accessToken, refreshToken, user } = res.data.data;
      login(user, accessToken, refreshToken);

      messageApi.success(`欢迎回来，${user.name}！`);

      // 按角色跳转
      setTimeout(() => {
        const roles: string[] = user.roles ?? [];
        if (roles.includes('admin_total')) navigate('/admin');
        else if (roles.includes('subject_head')) navigate('/subject-head');
        else if (roles.includes('teacher')) navigate('/teacher');
        else navigate('/student');
      }, 300);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        '登录失败，请检查账号和密码';
      messageApi.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // 开发快速登录
  const devLogin = async (role: string) => {
    const credMap: Record<string, { phone: string; password: string }> = {
      student:       { phone: '13900000003', password: 'chinichi2026' },
      student_zhang: { phone: '13812345678', password: 'chinichi2026' },
      teacher:       { phone: '13900000002', password: 'chinichi2026' },
      admin_total:   { phone: '13900000001', password: 'chinichi2026' },
    };
    const cred = credMap[role];
    if (!cred) return;
    form.setFieldsValue(cred);
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/login', cred);
      const { accessToken, refreshToken, user } = res.data.data;
      login(user, accessToken, refreshToken);
      const roles: string[] = user.roles ?? [];
      if (roles.includes('admin_total')) navigate('/admin');
      else if (roles.includes('subject_head')) navigate('/subject-head');
      else if (roles.includes('teacher')) navigate('/teacher');
      else navigate('/student');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        '快速登录失败';
      messageApi.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {contextHolder}
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: 16,
        }}
      >
        <Card
          style={{
            width: '100%',
            maxWidth: 400,
            borderRadius: 12,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}
          bodyStyle={{ padding: '36px 32px' }}
        >
          {/* Logo + 标题 */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Title level={2} style={{ marginBottom: 4, fontWeight: 700 }}>
              知日塾
            </Title>
            <Text type="secondary">大学院考学进度管理系统</Text>
          </div>

          {/* 登录表单 */}
          <Form form={form} layout="vertical" onFinish={handleLogin} size="large">
            <Form.Item
              name="phone"
              rules={[
                { required: true, message: '请输入手机号' },
                { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' },
              ]}
            >
              <Input
                prefix={<MobileOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="手机号"
                maxLength={11}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="密码"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                style={{ height: 44, fontSize: 16, borderRadius: 8 }}
              >
                登 录
              </Button>
            </Form.Item>
          </Form>

          {/* 开发快速登录 */}
          {import.meta.env.DEV && (
            <>
              <Divider>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  开发环境快速登录
                </Text>
              </Divider>
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <Button
                  block
                  onClick={() => devLogin('student')}
                  style={{ background: '#1677ff', color: '#fff', border: 'none' }}
                >
                  学生：测试学生（已有规划）
                </Button>
                <Button
                  block
                  onClick={() => devLogin('student_zhang')}
                  style={{ background: '#13c2c2', color: '#fff', border: 'none' }}
                >
                  学生：张思远（规划已确认）
                </Button>
                <Button
                  block
                  onClick={() => devLogin('teacher')}
                  style={{ background: '#52c41a', color: '#fff', border: 'none' }}
                >
                  以班主任身份登录
                </Button>
                <Button
                  block
                  onClick={() => devLogin('admin_total')}
                  style={{ background: '#722ed1', color: '#fff', border: 'none' }}
                >
                  以教务总负责人登录
                </Button>
              </Space>
            </>
          )}
        </Card>
      </div>
    </>
  );
};

export default LoginPage;
