// src/pages/auth/Login.tsx
// 知日塾大学院考学进度管理系统 - 登录页

import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Divider, Space } from 'antd';
import { MobileOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import apiClient from '../../api/client';

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [messageApi, ctxHolder] = message.useMessage();
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [logging, setLogging] = useState(false);

  const isDev = (import.meta as any).env?.DEV ?? true;

  // 发送验证码
  const sendCode = async () => {
    const phone = form.getFieldValue('phone');
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      messageApi.warning('请输入正确的手机号');
      return;
    }
    setSending(true);
    try {
      await apiClient.post('/auth/phone-send-code', { phone });
      messageApi.success('验证码已发送');
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (_e) {
      // 开发环境忽略发送失败
      if (isDev) {
        messageApi.info('开发环境：使用验证码 123456');
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) { clearInterval(timer); return 0; }
            return prev - 1;
          });
        }, 1000);
      } else {
        messageApi.error('发送失败，请稍后重试');
      }
    } finally {
      setSending(false);
    }
  };

  // 正式登录
  const handleLogin = async (values: { phone: string; code: string }) => {
    setLogging(true);
    try {
      const res = await apiClient.post('/auth/phone-login', values);
      login(res.data);
      messageApi.success('登录成功');
      // 路由跳转由 App.tsx 的 RootRedirect 处理
      navigate('/');
    } catch (_e) {
      messageApi.error('验证码错误或已过期');
    } finally {
      setLogging(false);
    }
  };

  // 开发环境快速登录（用真实手机号获取真实 token）
  const devLogin = async (role: string) => {
    const phoneMap: Record<string, string> = {
      student:     '13900000003',
      teacher:     '13900000002',
      admin_total: '13900000001',
    };
    try {
      const res = await apiClient.post('/auth/phone-login', {
        phone: phoneMap[role],
        code: '123456',
      });
      login(res.data.data ?? res.data);
      navigate('/');
    } catch (_e) {
      // 后备：模拟登录（无 API 时）
      const roleMap: Record<string, { id: string; name: string }> = {
        student:     { id: '00000000-0000-0000-0000-000000000003', name: '测试学生' },
        teacher:     { id: '00000000-0000-0000-0000-000000000002', name: '测试班主任' },
        admin_total: { id: '00000000-0000-0000-0000-000000000001', name: '教务总负责人' },
      };
      const u = roleMap[role]!;
      login({ accessToken: 'dev-token', refreshToken: 'dev-refresh', user: { id: u.id, name: u.name, roles: [role] } });
      navigate('/');
    }
  };

  return (
    <>
      {ctxHolder}
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}>
        <Card style={{ width: 420, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Title level={3} style={{ marginBottom: 4 }}>知日塾</Title>
            <Text type="secondary">大学院考学进度管理系统</Text>
          </div>

          <Form form={form} onFinish={handleLogin} layout="vertical">
            <Form.Item name="phone" label="手机号码" rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' },
            ]}>
              <Input prefix={<MobileOutlined />} placeholder="请输入手机号" size="large" />
            </Form.Item>

            <Form.Item name="code" label="验证码" rules={[{ required: true, message: '请输入验证码' }]}>
              <Input.Group compact>
                <Form.Item name="code" noStyle rules={[{ required: true, message: '请输入验证码' }]}>
                  <Input prefix={<SafetyOutlined />} placeholder="请输入验证码" size="large"
                    style={{ width: 'calc(100% - 120px)' }} />
                </Form.Item>
                <Button size="large" style={{ width: 120 }}
                  disabled={countdown > 0 || sending}
                  onClick={sendCode}
                  loading={sending}>
                  {countdown > 0 ? `${countdown}秒后重发` : '获取验证码'}
                </Button>
              </Input.Group>
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" size="large" block loading={logging}>
                登 录
              </Button>
            </Form.Item>
          </Form>

          {isDev && (
            <>
              <Divider>开发环境快速登录</Divider>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button block onClick={() => devLogin('student')} style={{ background: '#1677ff', color: '#fff', border: 'none' }}>
                  以学生身份登录
                </Button>
                <Button block onClick={() => devLogin('teacher')} style={{ background: '#52c41a', color: '#fff', border: 'none' }}>
                  以班主任身份登录
                </Button>
                <Button block onClick={() => devLogin('admin_total')} style={{ background: '#722ed1', color: '#fff', border: 'none' }}>
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

export default Login;
