// src/pages/student/Tasks.tsx
// 知日塾大学院考学进度管理系统 - 学生待办任务页
// 按逾期/今日/本周/下周/更晚分组显示全部任务

import React from 'react';
import {
  Card, Typography, Empty, Spin, Tag, Checkbox, Divider, Space, Badge,
} from 'antd';
import {
  WarningOutlined, CalendarOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/auth.store';
import { useStudentPlans, useToggleTask } from '../../api/plans.api';
import { PlanStatus, TaskStatus, type PeriodPlan, type PlanTask } from '../../types/plan';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// ─── 任务分组 ─────────────────────────────────────────────
type GroupKey = 'overdue' | 'today' | 'week' | 'nextweek' | 'later' | 'done';

interface TaskGroup {
  key: GroupKey;
  label: string;
  icon: React.ReactNode;
  color: string;
  tasks: (PlanTask & { planId: string })[];
}

function groupTasks(tasks: (PlanTask & { planId: string })[]): TaskGroup[] {
  const now = dayjs();
  const todayStr = now.format('YYYY-MM-DD');
  const weekEnd = now.endOf('week').format('YYYY-MM-DD');
  const nextWeekEnd = now.add(1, 'week').endOf('week').format('YYYY-MM-DD');

  const groups: TaskGroup[] = [
    { key: 'overdue', label: '已逾期', icon: <WarningOutlined />, color: '#ff4d4f', tasks: [] },
    { key: 'today',   label: '今日',   icon: <CalendarOutlined />, color: '#1677ff', tasks: [] },
    { key: 'week',    label: '本周',   icon: <CalendarOutlined />, color: '#722ed1', tasks: [] },
    { key: 'nextweek',label: '下周',   icon: <CalendarOutlined />, color: '#13c2c2', tasks: [] },
    { key: 'later',   label: '更晚',   icon: <CalendarOutlined />, color: '#8c8c8c', tasks: [] },
    { key: 'done',    label: '已完成', icon: <CheckCircleOutlined />, color: '#52c41a', tasks: [] },
  ];

  for (const task of tasks) {
    if (task.status === TaskStatus.Done) {
      groups[5].tasks.push(task);
      continue;
    }
    const due = task.dueDate ? task.dueDate.slice(0, 10) : null;
    if (!due) { groups[4].tasks.push(task); continue; }
    if (due < todayStr) groups[0].tasks.push(task);
    else if (due === todayStr) groups[1].tasks.push(task);
    else if (due <= weekEnd) groups[2].tasks.push(task);
    else if (due <= nextWeekEnd) groups[3].tasks.push(task);
    else groups[4].tasks.push(task);
  }

  return groups.filter(g => g.tasks.length > 0);
}

// ─── 任务条目 ─────────────────────────────────────────────
const TaskRow: React.FC<{
  task: PlanTask & { planId: string };
  onToggle: (taskId: string, done: boolean) => void;
  loading: boolean;
}> = ({ task, onToggle, loading }) => {
  const isDone = task.status === TaskStatus.Done;
  const due = task.dueDate ? task.dueDate.slice(0, 10) : null;
  const isOverdue = due && due < dayjs().format('YYYY-MM-DD') && !isDone;
  const overdueDays = isOverdue ? dayjs().diff(dayjs(due), 'day') : 0;

  const priorityColor = task.priority === '高' ? '#ff4d4f' : task.priority === '中' ? '#fa8c16' : '#8c8c8c';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0',
      borderBottom: '1px solid #f5f5f5',
      opacity: isDone ? 0.55 : 1,
    }}>
      <Checkbox
        checked={isDone}
        disabled={loading}
        onChange={e => onToggle(task.id, e.target.checked)}
        style={{ marginTop: 2 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text
            style={{
              fontSize: 15, fontWeight: 500,
              textDecoration: isDone ? 'line-through' : 'none',
              color: isDone ? '#bfbfbf' : '#262626',
            }}
          >
            {task.title}
          </Text>
          <Tag color={priorityColor} style={{ fontSize: 11, padding: '0 6px' }}>{task.priority}</Tag>
          {isOverdue && (
            <Tag color="red" style={{ fontSize: 11 }}>已逾期{overdueDays}天</Tag>
          )}
        </div>
        {task.description && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
            {task.description}
          </Text>
        )}
        {due && (
          <Text style={{ fontSize: 12, color: isOverdue ? '#ff4d4f' : '#8c8c8c', marginTop: 2, display: 'block' }}>
            截止：{due}
          </Text>
        )}
      </div>
    </div>
  );
};

// ─── 主页面 ───────────────────────────────────────────────
const TasksPage: React.FC = () => {
  const { user } = useAuthStore();
  const studentId = user?.studentId ?? user?.id ?? '';
  const { data: plans, isLoading } = useStudentPlans(studentId);
  const toggleMutation = useToggleTask(studentId);

  const allTasks = React.useMemo(() => {
    if (!plans) return [];
    return plans
      .filter(p => p.status === PlanStatus.Active)
      .flatMap(p => (p.tasks ?? []).map(t => ({ ...t, planId: p.id })));
  }, [plans]);

  const groups = React.useMemo(() => groupTasks(allTasks), [allTasks]);

  const handleToggle = (taskId: string, done: boolean) => {
    toggleMutation.mutate({ taskId, done });
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin size="large" tip="加载任务中..." />
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <Title level={4} style={{ marginBottom: 16 }}>待办任务</Title>

      {groups.length === 0 ? (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: 40 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical" size={4}>
                <Text style={{ fontSize: 16, color: '#52c41a' }}>🎉 暂无待办任务，继续保持！</Text>
                <Text type="secondary" style={{ fontSize: 13 }}>所有任务已完成或尚未分配</Text>
              </Space>
            }
          />
        </Card>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {groups.map(group => (
            <Card
              key={group.key}
              style={{ borderRadius: 12, borderLeft: `3px solid ${group.color}` }}
              bodyStyle={{ padding: '12px 16px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ color: group.color, fontSize: 16 }}>{group.icon}</span>
                <Text strong style={{ color: group.color, fontSize: 15 }}>{group.label}</Text>
                <Badge count={group.tasks.length} color={group.color} style={{ fontSize: 11 }} />
              </div>
              <Divider style={{ margin: '0 0 4px' }} />
              {group.tasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  loading={toggleMutation.isPending}
                />
              ))}
            </Card>
          ))}
        </Space>
      )}
    </div>
  );
};

export default TasksPage;
