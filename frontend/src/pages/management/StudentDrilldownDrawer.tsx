import React from 'react';
import { Alert, Button, Drawer, Space, Table, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { StudentListItem } from '../../api/students.api';
import { PERIOD_LABELS } from '../../types/plan';

const { Text } = Typography;

export interface StudentDrilldownState {
  title: string;
  students: StudentListItem[];
  description?: string;
}

const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending: '待确认',
  change_pending: '变更待确认',
  active: '执行中',
  completed: '已完成',
  cancelled: '已取消',
};

const PLAN_STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  pending: 'orange',
  change_pending: 'gold',
  active: 'green',
  completed: 'blue',
  cancelled: 'red',
};

const RISK_TAG_COLORS: Record<string, string> = {
  pace_risk: 'red',
  attitude_issue: 'orange',
  inno_gap: 'purple',
  preparation_weak: 'gold',
  exam_repeat: 'volcano',
};

export function getLatestPlan(student: StudentListItem, status?: string) {
  const plans = student.periodPlans ?? [];
  return status ? plans.find((plan) => plan.status === status) : plans[0] ?? null;
}

export function hasInnoStatus(student: StudentListItem, status: string) {
  return (student.targetSchools ?? []).some((school) => school.innoTracking?.status === status);
}

const StudentDrilldownDrawer: React.FC<{
  state: StudentDrilldownState | null;
  onClose: () => void;
}> = ({ state, onClose }) => {
  const navigate = useNavigate();

  const columns = [
    {
      title: '姓名',
      dataIndex: ['user', 'name'],
      render: (name: string, record: StudentListItem) => (
        <a onClick={() => navigate(`/teacher/students/${record.id}`)}>{name}</a>
      ),
    },
    { title: '手机', dataIndex: ['user', 'phone'], width: 130 },
    {
      title: '学科/班主任',
      width: 170,
      render: (_: unknown, record: StudentListItem) => (
        <Space direction="vertical" size={0}>
          <Text>{record.subject?.name ?? '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.teachers?.[0]?.teacher?.name ?? '未分配班主任'}
          </Text>
        </Space>
      ),
    },
    {
      title: '规划',
      width: 150,
      render: (_: unknown, record: StudentListItem) => {
        const plan = getLatestPlan(record);
        if (!plan) return <Text type="secondary">暂无规划</Text>;
        const periodLabel = plan.periodCode ? PERIOD_LABELS[plan.periodCode] ?? plan.stageName : plan.stageName;
        return (
          <Space direction="vertical" size={2}>
            <Tag color={PLAN_STATUS_COLORS[plan.status] ?? 'default'}>
              {PLAN_STATUS_LABELS[plan.status] ?? plan.status}
            </Tag>
            {periodLabel && <Text type="secondary" style={{ fontSize: 12 }}>{periodLabel}</Text>}
          </Space>
        );
      },
    },
    {
      title: '风险/内诺',
      render: (_: unknown, record: StudentListItem) => (
        <Space size={4} wrap>
          {record.riskTags?.map((risk) => (
            <Tag key={risk.tag.code} color={RISK_TAG_COLORS[risk.tag.code] ?? risk.tag.color ?? 'default'}>
              {risk.tag.label}
            </Tag>
          ))}
          {hasInnoStatus(record, 'confirmed') && <Tag color="green">已内诺</Tag>}
          {hasInnoStatus(record, 'in_progress') && <Tag color="blue">内诺跟进中</Tag>}
          {!record.riskTags?.length && !record.targetSchools?.some((school) => school.innoTracking) && (
            <Text type="secondary">-</Text>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      width: 96,
      render: (_: unknown, record: StudentListItem) => (
        <Button type="link" size="small" onClick={() => navigate(`/teacher/students/${record.id}`)}>
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <Drawer
      title={state?.title ?? '学生列表'}
      open={!!state}
      onClose={onClose}
      width={860}
      destroyOnClose
    >
      {state?.description && (
        <Alert type="info" showIcon message={state.description} style={{ marginBottom: 16 }} />
      )}
      <Table
        dataSource={state?.students ?? []}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 8, showSizeChanger: false }}
        locale={{ emptyText: '暂无学生' }}
      />
    </Drawer>
  );
};

export default StudentDrilldownDrawer;
