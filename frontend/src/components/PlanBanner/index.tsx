// src/components/PlanBanner/index.tsx
// 知日塾大学院考学进度管理系统 - 规划状态横幅组件
// 4种状态：已生效（绿）/ 待确认（黄）/ 变更待确认（紫）/ 无规划（红）

import React from 'react';
import { Alert, Button, Progress, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { PlanStatus, PeriodPlan, PERIOD_LABELS } from '../../types/plan';

const { Text } = Typography;

// ─── 辅助函数 ─────────────────────────────────────────────

/**
 * 计算距截止日还有多少天
 */
function daysUntil(dateStr: string): number {
  const now = new Date();
  const end = new Date(dateStr);
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 计算阶段进度百分比
 */
function calcProgress(startDate: string, endDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();

  if (now <= start) return 0;
  if (now >= end) return 100;

  return Math.round(((now - start) / (end - start)) * 100);
}

// ─── Props 定义 ───────────────────────────────────────────

export interface PlanBannerProps {
  /** 当前学生 ID */
  studentId: string;
  /** 当前最新规划（null 表示无规划） */
  plan: PeriodPlan | null;
  /** 点击「查看规划详情」回调 */
  onViewDetail?: (planId: string) => void;
  /** 点击「确认接受」回调（学生端） */
  onConfirm?: (planId: string) => void;
  /** 点击「提出异议」回调（学生端） */
  onReject?: (planId: string) => void;
  /** 点击「查看变更对比」回调 */
  onViewChange?: (planId: string) => void;
  /** 是否为学生视角（控制按钮显示） */
  isStudentView?: boolean;
  /** 加载状态 */
  loading?: boolean;
}

// ─── 子组件：已生效横幅（绿色） ─────────────────────────

const ActiveBanner: React.FC<{
  plan: PeriodPlan;
  onViewDetail?: (id: string) => void;
}> = ({ plan, onViewDetail }) => {
  const daysLeft = daysUntil(plan.endDate);
  const progress = calcProgress(plan.startDate, plan.endDate);
  const periodLabel = PERIOD_LABELS[plan.periodCode] ?? plan.stageName;

  return (
    <Alert
      type="success"
      icon={<CheckCircleOutlined />}
      style={{ marginBottom: 16 }}
      message={
        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          <Space>
            <Text strong>
              当前阶段：{periodLabel}
            </Text>
            <Tag color="success">已确认规划</Tag>
          </Space>
          <Text type="secondary">
            阶段截止：{plan.endDate?.slice(0, 10)}
            {daysLeft > 0
              ? `（还有 ${daysLeft} 天）`
              : daysLeft === 0
                ? '（今天截止）'
                : `（已逾期 ${Math.abs(daysLeft)} 天）`}
          </Text>
          {plan.goal && <Text type="secondary">阶段目标：{plan.goal}</Text>}
          <Progress
            percent={progress}
            size="small"
            status={daysLeft < 0 ? 'exception' : 'active'}
            style={{ marginBottom: 0 }}
          />
        </Space>
      }
      action={
        onViewDetail && (
          <Button size="small" onClick={() => onViewDetail(plan.id)}>
            查看详情
          </Button>
        )
      }
    />
  );
};

// ─── 子组件：待确认横幅（黄色） ─────────────────────────

const PendingBanner: React.FC<{
  plan: PeriodPlan;
  onViewDetail?: (id: string) => void;
  onConfirm?: (id: string) => void;
  onReject?: (id: string) => void;
  isStudentView?: boolean;
  loading?: boolean;
}> = ({ plan, onViewDetail, onConfirm, onReject, isStudentView, loading }) => {
  const periodLabel = PERIOD_LABELS[plan.periodCode] ?? plan.stageName;

  return (
    <Alert
      type="warning"
      icon={<ClockCircleOutlined />}
      style={{ marginBottom: 16 }}
      message={
        <Space direction="vertical" size={4}>
          <Text strong>规划待确认</Text>
          <Text type="secondary">
            班主任已为你制定了「{periodLabel}」的阶段计划，请查看并确认。
          </Text>
          <Text type="secondary">确认后才能开始接收任务和提醒。</Text>
        </Space>
      }
      action={
        isStudentView ? (
          <Space>
            {onViewDetail && (
              <Button size="small" onClick={() => onViewDetail(plan.id)}>
                查看规划详情
              </Button>
            )}
            {onConfirm && (
              <Button
                size="small"
                type="primary"
                loading={loading}
                onClick={() => onConfirm(plan.id)}
              >
                确认接受
              </Button>
            )}
            {onReject && (
              <Button size="small" danger onClick={() => onReject(plan.id)}>
                提出异议
              </Button>
            )}
          </Space>
        ) : (
          onViewDetail && (
            <Button size="small" onClick={() => onViewDetail(plan.id)}>
              查看规划
            </Button>
          )
        )
      }
    />
  );
};

// ─── 子组件：变更待确认横幅（紫色） ──────────────────────

const ChangePendingBanner: React.FC<{
  plan: PeriodPlan;
  onViewChange?: (id: string) => void;
  onConfirm?: (id: string) => void;
  onReject?: (id: string) => void;
  isStudentView?: boolean;
  loading?: boolean;
}> = ({ plan, onViewChange, onConfirm, onReject, isStudentView, loading }) => {
  return (
    <Alert
      type="info"
      icon={<SyncOutlined />}
      style={{ marginBottom: 16, borderColor: '#722ed1', backgroundColor: '#f9f0ff' }}
      message={
        <Space direction="vertical" size={4}>
          <Text strong style={{ color: '#722ed1' }}>
            规划已更新，需要你重新确认
          </Text>
          <Text type="secondary">
            班主任对现有计划做了调整，请查看变更内容并确认。
          </Text>
          {plan.changeReason && (
            <Text type="secondary">变更原因：{plan.changeReason}</Text>
          )}
        </Space>
      }
      action={
        isStudentView ? (
          <Space>
            {onViewChange && (
              <Button size="small" onClick={() => onViewChange(plan.id)}>
                查看变更对比
              </Button>
            )}
            {onConfirm && (
              <Button
                size="small"
                type="primary"
                loading={loading}
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1' }}
                onClick={() => onConfirm(plan.id)}
              >
                确认接受变更
              </Button>
            )}
            {onReject && (
              <Button size="small" danger onClick={() => onReject(plan.id)}>
                提出异议
              </Button>
            )}
          </Space>
        ) : (
          onViewChange && (
            <Button size="small" onClick={() => onViewChange(plan.id)}>
              查看变更
            </Button>
          )
        )
      }
    />
  );
};

// ─── 子组件：无规划横幅（红色） ──────────────────────────

const NoPlanBanner: React.FC = () => {
  return (
    <Alert
      type="error"
      icon={<WarningOutlined />}
      style={{ marginBottom: 16 }}
      message={
        <Space direction="vertical" size={4}>
          <Text strong>暂无考学规划</Text>
          <Text type="secondary">
            你的班主任尚未为你制定考学规划，请联系班主任尽快设定。
          </Text>
        </Space>
      }
    />
  );
};

// ─── 主组件 ───────────────────────────────────────────────

export const PlanBanner: React.FC<PlanBannerProps> = ({
  plan,
  onViewDetail,
  onConfirm,
  onReject,
  onViewChange,
  isStudentView = false,
  loading = false,
}) => {
  // 无规划
  if (!plan) {
    return <NoPlanBanner />;
  }

  switch (plan.status) {
    case PlanStatus.Active:
    case PlanStatus.Completed:
      return <ActiveBanner plan={plan} onViewDetail={onViewDetail} />;

    case PlanStatus.Pending:
      return (
        <PendingBanner
          plan={plan}
          onViewDetail={onViewDetail}
          onConfirm={onConfirm}
          onReject={onReject}
          isStudentView={isStudentView}
          loading={loading}
        />
      );

    case PlanStatus.ChangePending:
      return (
        <ChangePendingBanner
          plan={plan}
          onViewChange={onViewChange}
          onConfirm={onConfirm}
          onReject={onReject}
          isStudentView={isStudentView}
          loading={loading}
        />
      );

    case PlanStatus.Draft:
    case PlanStatus.Cancelled:
    default:
      return <NoPlanBanner />;
  }
};

export default PlanBanner;
