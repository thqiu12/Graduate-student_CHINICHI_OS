// src/components/Layout/AppLayout.tsx
// 知日塾大学院考学进度管理系统 - 主布局组件

import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Typography } from 'antd';
import { useNotifications } from '../../api/notifications.api';
import {
  DashboardOutlined, TeamOutlined, BellOutlined, BarChartOutlined,
  LogoutOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  FileTextOutlined, HomeOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const AppLayout: React.FC = () => {
  const { user, isStudent, isTeacher, isSubjectHead, isAdminTotal, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // 未读通知数（仅学生端底部导航显示）
  const { data: notifData } = useNotifications(isStudent ? false : undefined);
  const unreadCount = isStudent ? (notifData?.unreadCount ?? 0) : 0;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // 按角色生成菜单
  const getMenuItems = () => {
    if (isStudent) {
      return [
        { key: '/student', icon: <HomeOutlined />, label: '我的主页' },
        { key: '/student/notifications', icon: <BellOutlined />, label: '通知消息' },
      ];
    }

    const items = [];
    if (isTeacher && !isSubjectHead && !isAdminTotal) {
      items.push(
        { key: '/teacher', icon: <DashboardOutlined />, label: '班主任看板' },
        { key: '/teacher/students', icon: <TeamOutlined />, label: '学生管理' },
      );
    }
    if (isSubjectHead && !isAdminTotal) {
      items.push(
        { key: '/subject-head', icon: <BarChartOutlined />, label: '学科看板' },
        { key: '/teacher/students', icon: <TeamOutlined />, label: '全科学生' },
      );
    }
    if (isAdminTotal) {
      items.push(
        { key: '/admin', icon: <BarChartOutlined />, label: '全局看板' },
        { key: '/teacher/students', icon: <TeamOutlined />, label: '全部学生' },
        { key: '/admin/notifications', icon: <BellOutlined />, label: '通知管理' },
      );
    }
    return items;
  };

  const roleLabel = () => {
    if (isAdminTotal) return '教务总负责人';
    if (isSubjectHead) return '学科负责人';
    if (isTeacher) return '班主任';
    if (isStudent) return '学生';
    return '';
  };

  const userMenu = {
    items: [
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') handleLogout();
    },
  };

  if (isStudent) {
    // 学生使用简洁布局，无侧边栏
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <Text strong style={{ fontSize: 16 }}>知日塾考学进度管理</Text>
          <Dropdown menu={userMenu} trigger={['click']}>
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar icon={<UserOutlined />} size="small" />
              <Text>{user?.name}</Text>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ padding: '16px', background: '#f5f5f5', flex: 1 }}>
          <Outlet />
        </Content>
        {/* 底部导航栏 */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fff', borderTop: '1px solid #f0f0f0',
          display: 'flex', justifyContent: 'space-around', padding: '8px 0',
          zIndex: 100,
        }}>
          {[
            { path: '/student', icon: <HomeOutlined />, label: '主页', badge: 0 },
            { path: '/student/notifications', icon: <BellOutlined />, label: '通知', badge: unreadCount },
          ].map(item => (
            <div key={item.path} onClick={() => navigate(item.path)}
              style={{ textAlign: 'center', cursor: 'pointer', padding: '4px 16px',
                color: location.pathname === item.path ? '#1677ff' : '#666' }}>
              <div style={{ fontSize: 20 }}>
                <Badge count={item.badge} size="small" offset={[4, -4]}>
                  {item.icon}
                </Badge>
              </div>
              <div style={{ fontSize: 11 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        style={{ background: '#001529' }}
        width={220}
      >
        <div style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {!collapsed && <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>知日塾</Text>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={getMenuItems()}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Badge count={3} size="small">
              <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} onClick={() => navigate('/admin/notifications')} />
            </Badge>
            <Dropdown menu={userMenu} trigger={['click']}>
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar icon={<UserOutlined />} size="small" />
                <div>
                  <div style={{ fontSize: 13, lineHeight: 1.2 }}>{user?.name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{roleLabel()}</div>
                </div>
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ padding: '24px', background: '#f5f5f5', overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
