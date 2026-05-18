// src/pages/student/PlanConfirm.tsx
// 知日塾大学院考学进度管理系统 - 规划确认页（学生端）
// 功能：查看规划详情 + 变更对比（左右分栏 diff 高亮）+ 确认/异议按钮

import React, { useState, useMemo } from 'react';
import {
  Card,
  Button,
  Modal,
  Form,
  Input,
  Typography,
  Space,
  Tag,
  Descriptions,
  List,
  Divider,
  Alert,
  Spin,
  Row,
  Col,
  message,
  Badge,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ArrowLeftOutlined,
  DiffOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useStudentPlans, useConfirmPlan, useRejectPlan, useToggleTask } from '../../api/plans.api';
import { useAuthStore } from '../../stores/auth.store';
import { TaskItem } from '../../components/TaskItem';
import { PlanStatus, type PeriodPlan, PERIOD_LABELS, PLAN_STATUS_LABELS } from '../../types/plan';
import apiClient, { getErrorMessage } from '../../api/client';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ─── Diff API 类型 ────────────────────────────────────────

interface DiffField {
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string | null;
}

interface TaskDiff {
  type: 'added' | 'removed' | 'updated';
  title: string;
  changes?: DiffField[];
}

interface PlanDiffResponse {
  data: {
    current: PeriodPlan;
    previous: PeriodPlan | null;
    diffs: DiffField[];
    taskDiffs?: TaskDiff[];
    changeReason: string | null;
  };
}

function usePlanDiff(planId: string | undefined, enabled: boolean) {
  return useQuery<PlanDiffResponse>({
    queryKey: ['plan-diff', planId],
    queryFn: async () => {
      const res = await apiClient.get(`/plans/${planId}/diff`);
      return res.data;
    },
    enabled: enabled && !!planId,
    staleTime: 30 * 1000,
  });
}

// ─── 左右分栏变更对比组件 ─────────────────────────────────

interface FieldRowProps {
  label: string;
  oldValue: string | null;
  newValue: string | null;
  changed: boolean;
}

const FieldRow: React.FC<FieldRowProps> = ({ label, oldValue, newValue, changed }) => (
  <Row gutter={0} style={{ marginBottom: 1, borderBottom: '1px solid #f0f0f0' }}>
    {/* 字段名 */}
    <Col
      span={4}
      style={{
        padding: '8px 12px',
        fontWeight: 600,
        fontSize: 13,
        background: '#fafafa',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {label}
      {changed && <Badge color="red" style={{ marginLeft: 4 }} />}
    </Col>
    {/* 旧值（左） */}
    <Col
      span={10}
      style={{
        padding: '8px 12px',
        background: changed ? '#fff1f0' : '#fff',
        borderLeft: '1px solid #f0f0f0',
        borderRight: '1px solid #f0f0f0',
      }}
    >
      {changed ? (
        <Text delete type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
          {oldValue ?? '（空）'}
        </Text>
      ) : (
        <Text style={{ color: '#333', whiteSpace: 'pre-wrap' }}>{oldValue ?? '（空）'}</Text>
      )}
    </Col>
    {/* 新值（右） */}
    <Col
      span={10}
      style={{
        padding: '8px 12px',
        background: changed ? '#f6ffed' : '#fff',
      }}
    >
      {changed ? (
        <Text style={{ color: '#389e0d', fontWeight: 600, whiteSpace: 'pre-wrap' }}>
          {newValue ?? '（空）'}
        </Text>
      ) : (
        <Text style={{ color: '#333', whiteSpace: 'pre-wrap' }}>{newValue ?? '（空）'}</Text>
      )}
    </Col>
  </Row>
);

const DiffPanel: React.FC<{ planId: string | undefined }> = ({ planId }) => {
  const { data: diffData, isLoading } = usePlanDiff(planId, true);

  if (isLoading) {
    return <Spin size="small" tip="加载变更对比..." />;
  }

  if (!diffData?.data) return null;

  const { current, previous, diffs, taskDiffs = [], changeReason } = diffData.data;

  if (!previous) {
    return (
      <Alert
        type="info"
        message="无法获取上一版本规划，可能是首次变更。"
        style={{ marginBottom: 16 }}
      />
    );
  }

  // 构造所有需要对比的字段（包含无变化字段）
  const allFields: Array<{ field: string; label: string; oldValue: string | null; newValue: string | null }> = [
    {
      field: 'stageName',
      label: '阶段名称',
      oldValue: previous.stageName,
      newValue: current.stageName,
    },
    {
      field: 'startDate',
      label: '开始日期',
      oldValue: previous.startDate?.slice(0, 10) ?? null,
      newValue: current.startDate?.slice(0, 10) ?? null,
    },
    {
      field: 'endDate',
      label: '截止日期',
      oldValue: previous.endDate?.slice(0, 10) ?? null,
      newValue: current.endDate?.slice(0, 10) ?? null,
    },
    {
      field: 'goal',
      label: '阶段目标',
      oldValue: previous.goal ?? null,
      newValue: current.goal ?? null,
    },
  ];

  const changedFields = new Set(diffs.map((d) => d.field));

  return (
    <Card
      title={
        <Space>
          <DiffOutlined />
          <span>新旧版本对比</span>
          {diffs.length > 0 && <Tag color="red">{diffs.length} 处变更</Tag>}
          {taskDiffs.length > 0 && <Tag color="orange">{taskDiffs.length} 项任务变更</Tag>}
        </Space>
      }
      size="small"
      style={{ marginBottom: 16, border: '1px solid #d9d9d9' }}
      bodyStyle={{ padding: 0 }}
    >
      {/* 表头 */}
      <Row style={{ borderBottom: '2px solid #f0f0f0' }}>
        <Col span={4} style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#888', background: '#fafafa' }}>字段</Col>
        <Col span={10} style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#ff4d4f', background: '#fff1f0', borderLeft: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }}>
          旧版本（v{previous.version}）
        </Col>
        <Col span={10} style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#52c41a', background: '#f6ffed' }}>
          新版本（v{current.version}）
        </Col>
      </Row>

      {allFields.map((f) => (
        <FieldRow
          key={f.field}
          label={f.label}
          oldValue={f.oldValue}
          newValue={f.newValue}
          changed={changedFields.has(f.field)}
        />
      ))}

      {changeReason && (
        <div style={{ padding: '10px 12px', background: '#fffbe6', borderTop: '1px solid #ffe58f' }}>
          <Text strong style={{ color: '#faad14' }}>变更原因：</Text>
          <Text style={{ color: '#614700' }}>{changeReason}</Text>
        </div>
      )}

      {taskDiffs.length > 0 && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid #f0f0f0' }}>
          <Text strong>任务变更：</Text>
          <List
            size="small"
            dataSource={taskDiffs}
            renderItem={(item) => (
              <List.Item style={{ paddingLeft: 0, paddingRight: 0 }}>
                <Space direction="vertical" size={2}>
                  <Space>
                    <Tag color={item.type === 'added' ? 'green' : item.type === 'removed' ? 'red' : 'orange'}>
                      {item.type === 'added' ? '新增' : item.type === 'removed' ? '删除' : '修改'}
                    </Tag>
                    <Text>{item.title}</Text>
                  </Space>
                  {item.changes?.map((change) => (
                    <Text key={change.field} type="secondary" style={{ fontSize: 12 }}>
                      {change.label}：{change.oldValue ?? '（空）'} → {change.newValue ?? '（空）'}
                    </Text>
                  ))}
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}

      {diffs.length === 0 && taskDiffs.length === 0 && (
        <div style={{ padding: '12px', color: '#888', textAlign: 'center', borderTop: '1px solid #f0f0f0' }}>
          阶段基本信息无变化，可能仅调整了任务列表
        </div>
      )}
    </Card>
  );
};

// ─── 旧版变更对比组件（无 diff API 时的降级） ─────────────

const ChangeCompare: React.FC<{
  currentPlan: PeriodPlan;
  previousPlan: PeriodPlan | null;
}> = ({ currentPlan, previousPlan }) => {
  if (!previousPlan) return null;

  const diffs: Array<{ field: string; old: string; new: string }> = [];

  if (previousPlan.stageName !== currentPlan.stageName) {
    diffs.push({
      field: '阶段名称',
      old: previousPlan.stageName,
      new: currentPlan.stageName,
    });
  }
  if (previousPlan.startDate !== currentPlan.startDate) {
    diffs.push({
      field: '开始日期',
      old: previousPlan.startDate,
      new: currentPlan.startDate,
    });
  }
  if (previousPlan.endDate !== currentPlan.endDate) {
    diffs.push({
      field: '截止日期',
      old: previousPlan.endDate,
      new: currentPlan.endDate,
    });
  }
  if ((previousPlan.goal ?? '') !== (currentPlan.goal ?? '')) {
    diffs.push({
      field: '阶段目标',
      old: previousPlan.goal ?? '（无）',
      new: currentPlan.goal ?? '（无）',
    });
  }

  if (diffs.length === 0) {
    return (
      <Alert
        type="info"
        message="本次变更仅涉及任务列表调整，阶段基本信息不变。"
        style={{ marginBottom: 16 }}
      />
    );
  }

  return (
    <Card
      title={
        <Space>
          <DiffOutlined />
          <span>变更对比</span>
        </Space>
      }
      size="small"
      style={{ marginBottom: 16 }}
    >
      {diffs.map((diff) => (
        <Row key={diff.field} gutter={16} style={{ marginBottom: 8 }}>
          <Col span={4}>
            <Text strong>{diff.field}</Text>
          </Col>
          <Col span={10}>
            <div
              style={{
                background: '#fff1f0',
                border: '1px solid #ffa39e',
                padding: '4px 8px',
                borderRadius: 4,
              }}
            >
              <Text delete type="secondary">
                {diff.old}
              </Text>
            </div>
          </Col>
          <Col span={10}>
            <div
              style={{
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                padding: '4px 8px',
                borderRadius: 4,
              }}
            >
              <Text style={{ color: '#389e0d' }}>{diff.new}</Text>
            </div>
          </Col>
        </Row>
      ))}
    </Card>
  );
};

// ─── 主组件 ───────────────────────────────────────────────

const PlanConfirmPage: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [messageApi, contextHolder] = message.useMessage();
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectForm] = Form.useForm<{ content: string }>();

  // 如果 URL 带有 ?action=reject，自动打开异议弹窗
  const autoReject = searchParams.get('action') === 'reject';

  const studentId = user?.studentId ?? user?.id ?? '';
  const { data: plans, isLoading } = useStudentPlans(studentId);

  const confirmMutation = useConfirmPlan(studentId);
  const rejectMutation = useRejectPlan(studentId);
  const toggleTaskMutation = useToggleTask(studentId);

  // 找到当前规划
  const currentPlan = useMemo(
    () => plans?.find((p) => p.id === planId) ?? null,
    [plans, planId],
  );

  // 找到上一版本规划（用于变更对比）
  const previousPlan = useMemo(() => {
    if (!currentPlan?.previousPlanId || !plans) return null;
    return plans.find((p) => p.id === currentPlan.previousPlanId) ?? null;
  }, [currentPlan, plans]);

  const isChangePending = currentPlan?.status === PlanStatus.ChangePending;
  const canConfirm =
    currentPlan?.status === PlanStatus.Pending ||
    currentPlan?.status === PlanStatus.ChangePending;

  // 自动打开异议弹窗
  React.useEffect(() => {
    if (autoReject && canConfirm) {
      setRejectModalOpen(true);
    }
  }, [autoReject, canConfirm]);

  const handleConfirm = async () => {
    if (!planId) return;
    try {
      await confirmMutation.mutateAsync(planId);
      messageApi.success('规划已确认！开始执行');
      navigate('/student');
    } catch (e) {
      messageApi.error(getErrorMessage(e, '确认失败，请重试'));
    }
  };

  const handleRejectSubmit = async () => {
    if (!planId) return;
    try {
      const values = await rejectForm.validateFields();
      await rejectMutation.mutateAsync({ planId, content: values.content });
      messageApi.success('异议已提交，班主任将与你重新协商');
      setRejectModalOpen(false);
      navigate('/student');
    } catch (e) {
      messageApi.error(getErrorMessage(e, '提交失败，请重试'));
    }
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!currentPlan) {
    return (
      <div style={{ padding: '24px' }}>
        <Alert type="error" message="未找到规划信息" />
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/student')} style={{ marginTop: 16 }}>
          返回首页
        </Button>
      </div>
    );
  }

  const periodLabel = PERIOD_LABELS[currentPlan.periodCode] ?? currentPlan.stageName;
  const statusLabel = PLAN_STATUS_LABELS[currentPlan.status];

  return (
    <>
      {contextHolder}

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        {/* 页头 */}
        <Space style={{ marginBottom: 24 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            type="text"
            onClick={() => navigate('/student')}
          >
            返回
          </Button>
          <Title level={4} style={{ margin: 0 }}>
            规划详情
          </Title>
        </Space>

        {/* 状态横幅 */}
        {isChangePending && (
          <Alert
            type="info"
            icon={<DiffOutlined />}
            message="规划已更新，需要重新确认"
            description="班主任对现有计划做了调整，请查看变更内容后确认或提出异议。"
            style={{ marginBottom: 16, borderColor: '#722ed1', backgroundColor: '#f9f0ff' }}
          />
        )}

        {/* 变更对比（仅 change_pending 时显示）—— 使用 diff API 左右分栏对比 */}
        {isChangePending && <DiffPanel planId={planId} />}

        {/* 规划基本信息 */}
        <Card title="规划基本信息" style={{ marginBottom: 16 }}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="阶段">{periodLabel}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={canConfirm ? 'warning' : 'success'}>{statusLabel}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="开始日期">{currentPlan.startDate?.slice(0,10)}</Descriptions.Item>
            <Descriptions.Item label="截止日期">{currentPlan.endDate?.slice(0,10)}</Descriptions.Item>
            <Descriptions.Item label="版本">第 {currentPlan.version} 版</Descriptions.Item>
            {currentPlan.confirmedAt && (
              <Descriptions.Item label="确认时间">
                {new Date(currentPlan.confirmedAt).toLocaleString('zh-CN')}
              </Descriptions.Item>
            )}
          </Descriptions>

          {currentPlan.goal && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <div>
                <Text strong>阶段目标：</Text>
                <Paragraph style={{ margin: '4px 0 0' }}>{currentPlan.goal}</Paragraph>
              </div>
            </>
          )}

          {currentPlan.changeReason && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <div>
                <Text strong>变更原因：</Text>
                <Paragraph style={{ margin: '4px 0 0', color: '#722ed1' }}>
                  {currentPlan.changeReason}
                </Paragraph>
              </div>
            </>
          )}
        </Card>

        {/* 任务列表 */}
        <Card
          title={`任务清单（共 ${currentPlan.tasks?.length ?? 0} 项）`}
          style={{ marginBottom: 16 }}
        >
          {!currentPlan.tasks || currentPlan.tasks.length === 0 ? (
            <Text type="secondary">暂无具体任务</Text>
          ) : (
            <List
              dataSource={currentPlan.tasks}
              renderItem={(task) => (
                <List.Item style={{ padding: '0', border: 'none' }}>
                  <TaskItem
                    task={task}
                    canCheck={currentPlan.status === 'active'}
                    onStatusChange={async (taskId, done) => {
                      await toggleTaskMutation.mutateAsync({ taskId, done });
                      messageApi.success(done ? '任务已完成 🎉' : '已取消完成');
                    }}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

        {/* 操作按钮（只有待确认状态显示） */}
        {canConfirm && (
          <Card>
            <Space size="middle" style={{ width: '100%', justifyContent: 'center' }}>
              <Button
                type="primary"
                size="large"
                icon={<CheckCircleOutlined />}
                loading={confirmMutation.isPending}
                onClick={handleConfirm}
              >
                {isChangePending ? '确认接受变更' : '确认接受规划'}
              </Button>
              <Button
                size="large"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => setRejectModalOpen(true)}
              >
                提出异议
              </Button>
            </Space>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                确认后规划正式生效，你将开始收到任务提醒
              </Text>
            </div>
          </Card>
        )}
      </div>

      {/* 异议弹窗 */}
      <Modal
        title="提出异议"
        open={rejectModalOpen}
        onCancel={() => setRejectModalOpen(false)}
        onOk={handleRejectSubmit}
        confirmLoading={rejectMutation.isPending}
        okText="提交异议"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Alert
          type="warning"
          message="提出异议后，班主任将收到通知并与你重新协商"
          style={{ marginBottom: 16 }}
        />
        <Form form={rejectForm} layout="vertical">
          <Form.Item
            name="content"
            label="异议内容"
            rules={[
              { required: true, message: '请填写异议内容' },
              { min: 10, message: '异议内容至少10个字' },
            ]}
          >
            <TextArea
              rows={4}
              placeholder="请详细说明你的异议，例如：截止日期太短，无法完成计划中的任务..."
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default PlanConfirmPage;
