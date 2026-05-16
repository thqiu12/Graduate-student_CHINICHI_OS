// src/pages/student/PlanConfirm.tsx
// 知日塾大学院考学进度管理系统 - 规划确认页（学生端）
// 功能：查看规划详情 + 变更对比 + 确认/异议按钮

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
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ArrowLeftOutlined,
  DiffOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStudentPlans, useConfirmPlan, useRejectPlan } from '../../api/plans.api';
import { useAuthStore } from '../../stores/auth.store';
import { TaskItem } from '../../components/TaskItem';
import { PlanStatus, type PeriodPlan, PERIOD_LABELS, PLAN_STATUS_LABELS } from '../../types/plan';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ─── 变更对比组件 ─────────────────────────────────────────

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
    } catch (_err) {
      messageApi.error('确认失败，请重试');
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
    } catch (_err) {
      messageApi.error('提交失败，请重试');
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

        {/* 变更对比（仅 change_pending 时显示） */}
        {isChangePending && <ChangeCompare currentPlan={currentPlan} previousPlan={previousPlan} />}

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
                  <TaskItem task={task} canCheck={false} />
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
