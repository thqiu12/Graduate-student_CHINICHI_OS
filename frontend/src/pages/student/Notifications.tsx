// src/pages/student/Notifications.tsx
// 知日塾大学院考学进度管理系统 - 学生通知中心
// 功能：通知列表 + 分类筛选 + 标记已读 + 一键全读

import React, { useState } from 'react';
import {
  List,
  Badge,
  Button,
  Tabs,
  Typography,
  Tag,
  Empty,
  Skeleton,
  Space,
  message,
  Alert,
} from 'antd';
import {
  BellOutlined,
  CheckOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useNotifications, useMarkRead, useMarkAllRead, NOTIFICATION_TYPE_LABELS, type Notification } from '../../api/notifications.api';
import { useAuthStore } from '../../stores/auth.store';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Text, Title } = Typography;

// ─── 单条通知组件 ─────────────────────────────────────────

const NotificationItem: React.FC<{
  notification: Notification;
  onOpen: (notification: Notification) => void;
  loading: boolean;
}> = ({ notification, onOpen, loading }) => {
  const typeLabel = NOTIFICATION_TYPE_LABELS[notification.type] ?? '🔔 通知';
  const timeAgo = dayjs(notification.createdAt).fromNow();

  return (
    <List.Item
      style={{
        background: notification.isRead ? '#fff' : '#e6f4ff',
        padding: '12px 16px',
        borderRadius: 8,
        marginBottom: 8,
        border: notification.isRead ? '1px solid #f0f0f0' : '1px solid #91caff',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onClick={() => onOpen(notification)}
      extra={
        !notification.isRead && (
          <Button
            size="small"
            type="text"
            icon={<CheckOutlined />}
            loading={loading}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(notification);
            }}
          >
            标为已读
          </Button>
        )
      }
    >
      <List.Item.Meta
        avatar={
          <Badge dot={!notification.isRead} offset={[-2, 2]}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: notification.isRead ? '#f5f5f5' : '#e6f4ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}
            >
              {typeLabel.split(' ')[0]}
            </div>
          </Badge>
        }
        title={
          <Space>
            <Text strong={!notification.isRead}>{notification.title}</Text>
            <Tag style={{ fontSize: 11, padding: '0 4px' }}>
              {typeLabel.split(' ').slice(1).join(' ')}
            </Tag>
          </Space>
        }
        description={
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            {notification.content && (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {notification.content}
              </Text>
            )}
            <Text type="secondary" style={{ fontSize: 11 }}>
              {timeAgo}
            </Text>
          </Space>
        }
      />
    </List.Item>
  );
};

// ─── 骨架屏 ───────────────────────────────────────────────

const NotificationSkeleton: React.FC = () => (
  <div>
    {[1, 2, 3].map((i) => (
      <div key={i} style={{ padding: '12px 16px', marginBottom: 8, background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        <Skeleton active avatar paragraph={{ rows: 2 }} />
      </div>
    ))}
  </div>
);

// ─── 主组件 ───────────────────────────────────────────────

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isStudent } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [messageApi, contextHolder] = message.useMessage();

  const { data, isLoading, isError } = useNotifications(
    activeTab === 'unread' ? false : undefined,
  );
  const markReadMutation = useMarkRead();
  const markAllReadMutation = useMarkAllRead();

  const notifications = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const handleMarkRead = async (id: string) => {
    try {
      await markReadMutation.mutateAsync(id);
    } catch (e) {
      messageApi.error(getErrorMessage(e, '操作失败，请重试'));
    }
  };

  const handleOpenNotification = async (notification: Notification) => {
    if (!notification.isRead) {
      await handleMarkRead(notification.id);
    }
    if (!notification.relatedId) return;

    if (isStudent && (notification.type === 'plan_pending' || notification.type === 'plan_change_pending')) {
      navigate(`/student/plan-confirm/${notification.relatedId}`);
      return;
    }
    if (!isStudent && notification.type === 'teacher_push') {
      navigate(`/teacher/students/${notification.relatedId}`);
      return;
    }
    if (!isStudent && notification.type === 'plan_rejected') {
      navigate(`/teacher/students/${notification.relatedId}`);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const result = await markAllReadMutation.mutateAsync();
      messageApi.success(`已将 ${result.count} 条通知标为已读`);
    } catch (e) {
      messageApi.error(getErrorMessage(e, '操作失败，请重试'));
    }
  };

  return (
    <>
      {contextHolder}
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '16px' }}>
        {/* 页头 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <Space>
            <BellOutlined style={{ fontSize: 20 }} />
            <Title level={4} style={{ margin: 0 }}>
              通知消息
            </Title>
            {unreadCount > 0 && (
              <Badge count={unreadCount} style={{ backgroundColor: '#ff4d4f' }} />
            )}
          </Space>
          {unreadCount > 0 && (
            <Button
              icon={<CheckCircleOutlined />}
              size="small"
              loading={markAllReadMutation.isPending}
              onClick={handleMarkAllRead}
            >
              全部已读
            </Button>
          )}
        </div>

        {/* 标签页 */}
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as 'all' | 'unread')}
          items={[
            {
              key: 'all',
              label: '全部',
            },
            {
              key: 'unread',
              label: (
                <Badge count={unreadCount} size="small" offset={[6, -2]}>
                  未读
                </Badge>
              ),
            },
          ]}
          style={{ marginBottom: 16 }}
        />

        {/* 错误提示 */}
        {isError && (
          <Alert
            type="error"
            message="加载通知失败，请刷新重试"
            style={{ marginBottom: 16 }}
          />
        )}

        {/* 通知列表 */}
        {isLoading ? (
          <NotificationSkeleton />
        ) : notifications.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={activeTab === 'unread' ? '没有未读通知 🎉' : '暂无通知'}
            style={{ padding: '48px 0' }}
          />
        ) : (
          <List
            dataSource={notifications}
            renderItem={(item) => (
              <NotificationItem
                notification={item}
                onOpen={handleOpenNotification}
                loading={markReadMutation.isPending && markReadMutation.variables === item.id}
              />
            )}
          />
        )}
      </div>
    </>
  );
};

export default NotificationsPage;
