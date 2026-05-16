// src/components/TaskItem/index.tsx
// 知日塾大学院考学进度管理系统 - 任务勾选组件
// 支持：打勾动画、逾期红色标识、优先级标签

import React, { useState } from 'react';
import { Checkbox, Space, Tag, Typography, Tooltip } from 'antd';
import { CheckboxChangeEvent } from 'antd/es/checkbox';
import { FireOutlined, CalendarOutlined } from '@ant-design/icons';
import type { PlanTask } from '../../types/plan';
import { TaskStatus, TaskPriority } from '../../types/plan';

const { Text } = Typography;

// ─── 辅助函数 ─────────────────────────────────────────────

function isOverdue(task: PlanTask): boolean {
  if (task.status === TaskStatus.Done) return false;
  if (!task.dueDate) return false;
  return new Date(task.dueDate) < new Date(new Date().toDateString());
}

function overdueDays(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date(new Date().toDateString());
  return Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

const PRIORITY_CONFIG: Record<TaskPriority, { color: string; icon?: React.ReactNode }> = {
  [TaskPriority.High]: { color: 'red', icon: <FireOutlined /> },
  [TaskPriority.Medium]: { color: 'orange' },
  [TaskPriority.Low]: { color: 'default' },
};

// ─── Props 定义 ───────────────────────────────────────────

export interface TaskItemProps {
  task: PlanTask;
  /** 是否允许勾选（只有学生本人可以勾选） */
  canCheck?: boolean;
  /** 勾选状态变更回调 */
  onStatusChange?: (taskId: string, done: boolean) => Promise<void>;
}

// ─── 主组件 ───────────────────────────────────────────────

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  canCheck = false,
  onStatusChange,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const isDone = task.status === TaskStatus.Done;
  const overdue = isOverdue(task);
  const priorityConfig = PRIORITY_CONFIG[task.priority as TaskPriority];

  const handleCheck = async (e: CheckboxChangeEvent) => {
    if (!onStatusChange || !canCheck) return;
    setIsUpdating(true);
    try {
      await onStatusChange(task.id, e.target.checked);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '8px 0',
        borderBottom: '1px solid #f0f0f0',
        opacity: isDone ? 0.6 : 1,
        transition: 'opacity 0.3s',
      }}
    >
      {/* 勾选框 */}
      <Checkbox
        checked={isDone}
        disabled={!canCheck || isUpdating}
        onChange={handleCheck}
        style={{
          marginRight: 12,
          marginTop: 2,
          // 完成动画效果（通过 CSS transition）
          transform: isDone ? 'scale(1.1)' : 'scale(1)',
          transition: 'transform 0.2s ease',
        }}
      />

      {/* 任务内容 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Space wrap size={4} style={{ marginBottom: 4 }}>
          {/* 任务标题 */}
          <Text
            style={{
              textDecoration: isDone ? 'line-through' : 'none',
              color: overdue ? '#ff4d4f' : isDone ? '#8c8c8c' : 'inherit',
              fontWeight: 500,
            }}
          >
            {task.title}
          </Text>

          {/* 优先级标签（高优先级显示） */}
          {task.priority === TaskPriority.High && (
            <Tag color={priorityConfig.color} icon={priorityConfig.icon}>
              高优先
            </Tag>
          )}

          {/* 逾期标签 */}
          {overdue && (
            <Tag color="red">
              逾期 {overdueDays(task.dueDate!)} 天
            </Tag>
          )}
        </Space>

        {/* 任务说明 */}
        {task.description && (
          <Text
            type="secondary"
            style={{
              display: 'block',
              fontSize: 12,
              marginBottom: 4,
            }}
          >
            {task.description}
          </Text>
        )}

        {/* 截止日期 */}
        {task.dueDate && (
          <Space size={4}>
            <CalendarOutlined
              style={{
                fontSize: 12,
                color: overdue ? '#ff4d4f' : '#8c8c8c',
              }}
            />
            <Text
              style={{
                fontSize: 12,
                color: overdue ? '#ff4d4f' : '#8c8c8c',
              }}
            >
              {overdue ? (
                <Tooltip title={`截止日期：${task.dueDate}`}>
                  <span>已逾期（截止 {task.dueDate}）</span>
                </Tooltip>
              ) : (
                `截止 ${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ''}`
              )}
            </Text>
          </Space>
        )}

        {/* 完成说明 */}
        {isDone && task.doneNote && (
          <Text
            type="secondary"
            style={{ display: 'block', fontSize: 12, marginTop: 4 }}
          >
            完成备注：{task.doneNote}
          </Text>
        )}
      </div>
    </div>
  );
};

export default TaskItem;
