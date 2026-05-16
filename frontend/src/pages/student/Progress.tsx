// src/pages/student/Progress.tsx
// 知日塾大学院考学进度管理系统 - 学生考学进度页
// 横向阶段时间轴 + 当前阶段规划详情

import React from 'react';
import {
  Card, Typography, Empty, Spin, Tag, Space, Divider, List,
} from 'antd';
import { CheckCircleFilled, ClockCircleFilled, MinusCircleOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../stores/auth.store';
import { useStudentPlans } from '../../api/plans.api';
import { PlanStatus, PERIOD_LABELS, type PeriodPlan, type PlanTask } from '../../types/plan';

const { Title, Text } = Typography;

// ─── 阶段定义 ─────────────────────────────────────────────
const STAGES = [
  { code: 'P1', label: '语言准备期', color: '#8c8c8c' },
  { code: 'P2', label: '方向确立期', color: '#1677ff' },
  { code: 'P3', label: '内诺攻坚期', color: '#722ed1' },
  { code: 'P4', label: '研究计划书期', color: '#eb2f96' },
  { code: 'P5', label: '出愿准备期', color: '#fa8c16' },
  { code: 'P6', label: '考试冲刺期', color: '#f5222d' },
  { code: 'P7', label: '等待结果期', color: '#52c41a' },
];

// ─── 时间轴节点 ───────────────────────────────────────────
const StageNode: React.FC<{
  stage: typeof STAGES[0];
  status: 'done' | 'current' | 'future';
  plan?: PeriodPlan;
}> = ({ stage, status, plan }) => {
  const iconStyle = { fontSize: 28 };
  const icon =
    status === 'done' ? <CheckCircleFilled style={{ ...iconStyle, color: '#52c41a' }} /> :
    status === 'current' ? <ClockCircleFilled style={{ ...iconStyle, color: stage.color }} /> :
    <MinusCircleOutlined style={{ ...iconStyle, color: '#d9d9d9' }} />;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minWidth: 80, flex: 1,
    }}>
      {icon}
      <Text
        strong={status === 'current'}
        style={{
          fontSize: 12, marginTop: 6, textAlign: 'center',
          color: status === 'future' ? '#bfbfbf' : status === 'done' ? '#52c41a' : stage.color,
          lineHeight: 1.3,
        }}
      >
        {stage.code}
        <br />
        <span style={{ fontWeight: status === 'current' ? 700 : 400 }}>{stage.label}</span>
      </Text>
      <Text style={{ fontSize: 11, color: '#bfbfbf', marginTop: 4 }}>
        {plan?.endDate ? plan.endDate.slice(0, 10) : '—'}
      </Text>
    </div>
  );
};

// ─── 主页面 ───────────────────────────────────────────────
const ProgressPage: React.FC = () => {
  const { user } = useAuthStore();
  const studentId = user?.studentId ?? user?.id ?? '';
  const { data: plans, isLoading } = useStudentPlans(studentId);

  const activePlan = plans?.find(p => p.status === PlanStatus.Active);
  const currentStageCode = activePlan?.periodCode ?? null;

  // 哪些阶段已完成（在当前阶段之前）
  const currentIdx = currentStageCode ? STAGES.findIndex(s => s.code === currentStageCode) : -1;

  // 找每个 stage 对应的 plan
  const planByStage = React.useMemo(() => {
    const map: Record<string, PeriodPlan> = {};
    if (plans) plans.forEach(p => { map[p.periodCode] = p; });
    return map;
  }, [plans]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin size="large" tip="加载进度中..." />
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <Title level={4} style={{ marginBottom: 16 }}>考学进度</Title>

      {/* 时间轴滚动区域 */}
      <Card style={{ borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 560, position: 'relative' }}>
            {/* 连接线 */}
            <div style={{
              position: 'absolute', top: 14, left: '5%', right: '5%',
              height: 2, background: '#f0f0f0', zIndex: 0,
            }} />
            {STAGES.map((stage, idx) => {
              const status: 'done' | 'current' | 'future' =
                idx < currentIdx ? 'done' :
                idx === currentIdx ? 'current' : 'future';
              return (
                <StageNode
                  key={stage.code}
                  stage={stage}
                  status={status}
                  plan={planByStage[stage.code]}
                />
              );
            })}
          </div>
        </div>
      </Card>

      {/* 当前阶段规划详情 */}
      {activePlan ? (
        <Card
          title={
            <Space>
              <Tag color={STAGES.find(s => s.code === activePlan.periodCode)?.color ?? '#1677ff'}>
                {activePlan.periodCode}
              </Tag>
              <Text strong>{PERIOD_LABELS[activePlan.periodCode] ?? activePlan.periodCode}</Text>
              <Tag color="green">执行中</Tag>
            </Space>
          }
          style={{ borderRadius: 12 }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            <Text type="secondary">
              {activePlan.startDate?.slice(0, 10) ?? '—'} ～ {activePlan.endDate?.slice(0, 10) ?? '—'}
            </Text>
            {activePlan.goal && (
              <div style={{ background: '#f9f9f9', borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
                <Text style={{ fontSize: 14 }}>{activePlan.goal}</Text>
              </div>
            )}
          </Space>

          {activePlan.tasks && activePlan.tasks.length > 0 && (
            <>
              <Divider style={{ margin: '16px 0 8px' }}>任务清单</Divider>
              <List
                size="small"
                dataSource={activePlan.tasks}
                renderItem={(task: PlanTask) => (
                  <List.Item style={{ padding: '8px 0' }}>
                    <Space>
                      {task.status === 'done'
                        ? <CheckCircleFilled style={{ color: '#52c41a' }} />
                        : <MinusCircleOutlined style={{ color: '#d9d9d9' }} />}
                      <Text
                        style={{
                          textDecoration: task.status === 'done' ? 'line-through' : 'none',
                          color: task.status === 'done' ? '#bfbfbf' : '#262626',
                        }}
                      >
                        {task.title}
                      </Text>
                      {task.dueDate && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {task.dueDate.slice(0, 10)}
                        </Text>
                      )}
                    </Space>
                  </List.Item>
                )}
              />
            </>
          )}
        </Card>
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary">暂无执行中的规划，请联系班主任</Text>}
          />
        </Card>
      )}

      {/* 已完成阶段 */}
      {plans && plans.filter(p => p.status === 'completed').length > 0 && (
        <Card title="已完成阶段" style={{ borderRadius: 12, marginTop: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {plans.filter(p => p.status === 'completed').map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', background: '#f6ffed', borderRadius: 8,
              }}>
                <CheckCircleFilled style={{ color: '#52c41a' }} />
                <Tag color="green">{p.periodCode}</Tag>
                <Text>{PERIOD_LABELS[p.periodCode] ?? p.periodCode}</Text>
                <Text type="secondary" style={{ marginLeft: 'auto', fontSize: 12 }}>
                  {p.endDate?.slice(0, 10)}
                </Text>
              </div>
            ))}
          </Space>
        </Card>
      )}
    </div>
  );
};

export default ProgressPage;
