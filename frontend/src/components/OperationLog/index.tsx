// src/components/OperationLog/index.tsx
// 知日塾大学院考学进度管理系统 - 操作日志列表组件
// 时间线样式，标注不可删除，支持展开详情

import React, { useState } from 'react';
import { Timeline, Typography, Tag, Space, Collapse, Empty, Spin, Tooltip } from 'antd';
import {
  EditOutlined,
  SendOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  AlertOutlined,
  UserSwitchOutlined,
  TagOutlined,
  LockOutlined,
} from '@ant-design/icons';
import type { OperationLog } from '../../types/student';
import { ACTION_TYPE_LABELS } from '../../types/student';

const { Text, Paragraph } = Typography;

// ─── 操作类型图标映射 ─────────────────────────────────────

const ACTION_ICONS: Record<string, React.ReactNode> = {
  plan_create: <EditOutlined style={{ color: '#1677ff' }} />,
  plan_send: <SendOutlined style={{ color: '#faad14' }} />,
  plan_confirm: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  plan_reject: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
  plan_change: <SyncOutlined style={{ color: '#722ed1' }} />,
  alert_no_plan: <AlertOutlined style={{ color: '#ff4d4f' }} />,
  alert_unconfirmed: <AlertOutlined style={{ color: '#faad14' }} />,
  teacher_change: <UserSwitchOutlined style={{ color: '#1677ff' }} />,
  tag_add: <TagOutlined style={{ color: '#fa8c16' }} />,
  tag_remove: <TagOutlined style={{ color: '#8c8c8c' }} />,
};

const ACTION_COLORS: Record<string, string> = {
  plan_confirm: 'green',
  plan_reject: 'red',
  plan_change: 'purple',
  alert_no_plan: 'red',
  alert_unconfirmed: 'orange',
  tag_add: 'orange',
};

// ─── 辅助函数 ─────────────────────────────────────────────

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Props 定义 ───────────────────────────────────────────

export interface OperationLogListProps {
  logs: OperationLog[];
  loading?: boolean;
  /** 最多显示条数（超过则折叠） */
  maxVisible?: number;
}

// ─── 单条日志组件 ─────────────────────────────────────────

const LogItem: React.FC<{ log: OperationLog }> = ({ log }) => {
  const [expanded, setExpanded] = useState(false);
  const actionLabel = ACTION_TYPE_LABELS[log.actionType] ?? log.actionType;
  const tagColor = ACTION_COLORS[log.actionType] ?? 'default';
  const hasDetail = log.detail && Object.keys(log.detail).length > 0;

  return (
    <div style={{ paddingBottom: 8 }}>
      <Space wrap size={4} style={{ marginBottom: 4 }}>
        {/* 操作类型标签 */}
        <Tag color={tagColor}>{actionLabel}</Tag>

        {/* 操作人 */}
        <Text type="secondary" style={{ fontSize: 12 }}>
          {log.actorName ?? '系统自动'}
        </Text>

        {/* 不可删除图标提示 */}
        <Tooltip title="操作日志永久保留，不可删除">
          <LockOutlined style={{ fontSize: 11, color: '#bfbfbf' }} />
        </Tooltip>
      </Space>

      <div>
        <Text style={{ fontSize: 12, color: '#595959' }}>
          {formatDateTime(log.createdAt)}
        </Text>
      </div>

      {/* 详情展开 */}
      {hasDetail && (
        <Collapse
          ghost
          size="small"
          style={{ marginTop: 4 }}
          onChange={(keys) => setExpanded(keys.length > 0)}
        >
          <Collapse.Panel
            key="detail"
            header={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {expanded ? '收起详情' : '查看详情'}
              </Text>
            }
          >
            <Paragraph
              style={{
                fontSize: 12,
                background: '#f5f5f5',
                padding: '8px',
                borderRadius: 4,
                margin: 0,
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {JSON.stringify(log.detail, null, 2)}
            </Paragraph>
          </Collapse.Panel>
        </Collapse>
      )}
    </div>
  );
};

// ─── 主组件 ───────────────────────────────────────────────

export const OperationLogList: React.FC<OperationLogListProps> = ({
  logs,
  loading = false,
  maxVisible = 20,
}) => {
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '24px' }}>
        <Spin tip="加载中..." />
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return <Empty description="暂无操作日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  const visibleLogs = showAll ? logs : logs.slice(0, maxVisible);
  const hiddenCount = logs.length - maxVisible;

  const timelineItems = visibleLogs.map((log) => ({
    key: String(log.id),
    dot: ACTION_ICONS[log.actionType] ?? <EditOutlined />,
    children: <LogItem log={log} />,
  }));

  return (
    <div>
      {/* 不可删除提示 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: 12,
          padding: '6px 12px',
          background: '#fafafa',
          borderRadius: 4,
          border: '1px solid #f0f0f0',
        }}
      >
        <LockOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          操作日志由系统自动记录，永久保留，不可删除或修改
        </Text>
      </div>

      <Timeline items={timelineItems} />

      {/* 加载更多 */}
      {!showAll && hiddenCount > 0 && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Text
            type="secondary"
            style={{ cursor: 'pointer', fontSize: 13 }}
            onClick={() => setShowAll(true)}
          >
            还有 {hiddenCount} 条日志，点击查看全部
          </Text>
        </div>
      )}
    </div>
  );
};

export default OperationLogList;
