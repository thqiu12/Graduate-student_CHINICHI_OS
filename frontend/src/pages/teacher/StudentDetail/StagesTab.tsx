// src/pages/teacher/StudentDetail/StagesTab.tsx
// 知日塾大学院考学进度管理系统 - 考学阶段 Tab（教师端学生详情）
// 功能：时间轴 + 规划横幅 + 任务列表 + 操作日志

import React, { useMemo, useState } from 'react';
import {
  Timeline,
  Card,
  Button,
  Space,
  Tag,
  Typography,
  Empty,
  Spin,
  Divider,
  List,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  message,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  SendOutlined,
  SyncOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  MinusCircleFilled,
} from '@ant-design/icons';
import {
  useStudentPlans,
  useSendPlan,
  useChangePlan,
  useCreatePlan,
  useOperationLogs,
} from '../../../api/plans.api';
import { PlanBanner } from '../../../components/PlanBanner';
import { TaskItem } from '../../../components/TaskItem';
import { OperationLogList } from '../../../components/OperationLog';
import {
  PlanStatus,
  type PeriodPlan,
  PERIOD_LABELS,
  PLAN_STATUS_LABELS,
  PLAN_STATUS_COLORS,
} from '../../../types/plan';
import type { Dayjs } from 'dayjs';

const { Text, Title } = Typography;
const { TextArea } = Input;

// ─── Props 定义 ───────────────────────────────────────────

export interface StagesTabProps {
  studentId: string;
  studentName: string;
}

// ─── 辅助函数 ─────────────────────────────────────────────

function getTimelineIcon(status: PlanStatus): React.ReactNode {
  switch (status) {
    case PlanStatus.Active:
      return <ClockCircleFilled style={{ color: '#52c41a' }} />;
    case PlanStatus.Completed:
      return <CheckCircleFilled style={{ color: '#1677ff' }} />;
    case PlanStatus.Pending:
    case PlanStatus.ChangePending:
      return <ClockCircleFilled style={{ color: '#faad14' }} />;
    case PlanStatus.Cancelled:
      return <MinusCircleFilled style={{ color: '#d9d9d9' }} />;
    default:
      return <ClockCircleFilled style={{ color: '#d9d9d9' }} />;
  }
}

// ─── 主组件 ───────────────────────────────────────────────

const StagesTab: React.FC<StagesTabProps> = ({ studentId, studentName }) => {
  const [messageApi, contextHolder] = message.useMessage();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [createForm] = Form.useForm<{
    periodCode: string;
    stageName: string;
    goal: string;
    startDate: Dayjs;
    endDate: Dayjs;
  }>();
  const [changeForm] = Form.useForm<{
    changeReason: string;
    stageName?: string;
    endDate?: Dayjs;
  }>();

  // ─── API Hooks ────────────────────────────────────────
  const { data: plans, isLoading: plansLoading } = useStudentPlans(studentId);
  const { data: logs, isLoading: logsLoading } = useOperationLogs(studentId);

  const sendPlanMutation = useSendPlan(studentId);
  const changePlanMutation = useChangePlan(studentId);
  const createPlanMutation = useCreatePlan(studentId);

  // ─── 当前活跃规划 ─────────────────────────────────────
  const currentPlan = useMemo(() => {
    if (!plans) return null;
    return (
      plans.find(
        (p) =>
          p.status === PlanStatus.Active ||
          p.status === PlanStatus.Pending ||
          p.status === PlanStatus.ChangePending,
      ) ?? null
    );
  }, [plans]);

  // ─── 规划时间轴数据（按阶段归组，取最新版本） ──────────
  const timelinePlans = useMemo(() => {
    if (!plans) return [];
    const grouped: Record<string, PeriodPlan> = {};
    for (const plan of plans) {
      const existing = grouped[plan.periodCode];
      if (!existing || plan.version > existing.version) {
        grouped[plan.periodCode] = plan;
      }
    }
    return Object.values(grouped).sort((a, b) => a.periodCode.localeCompare(b.periodCode));
  }, [plans]);

  // ─── 操作处理函数 ─────────────────────────────────────

  const handleSendPlan = async (planId: string) => {
    try {
      await sendPlanMutation.mutateAsync(planId);
      messageApi.success('规划已发送给学生确认');
    } catch (_err) {
      messageApi.error('发送失败，请重试');
    }
  };

  const handleOpenChangePlan = (planId: string) => {
    setSelectedPlanId(planId);
    setChangeModalOpen(true);
  };

  const handleChangePlan = async () => {
    if (!selectedPlanId) return;
    try {
      const values = await changeForm.validateFields();
      await changePlanMutation.mutateAsync({
        planId: selectedPlanId,
        changeReason: values.changeReason,
        stageName: values.stageName,
        endDate: values.endDate?.format('YYYY-MM-DD'),
      });
      messageApi.success('变更已发起，等待学生确认');
      setChangeModalOpen(false);
      changeForm.resetFields();
    } catch (_err) {
      messageApi.error('发起变更失败，请重试');
    }
  };

  const handleCreatePlan = async () => {
    try {
      const values = await createForm.validateFields();
      await createPlanMutation.mutateAsync({
        periodCode: values.periodCode,
        stageName: values.stageName,
        goal: values.goal,
        startDate: values.startDate.format('YYYY-MM-DD'),
        endDate: values.endDate.format('YYYY-MM-DD'),
      });
      messageApi.success('规划草稿已创建');
      setCreateModalOpen(false);
      createForm.resetFields();
    } catch (_err) {
      messageApi.error('创建失败，请重试');
    }
  };

  if (plansLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <Spin tip="加载规划数据..." />
      </div>
    );
  }

  return (
    <>
      {contextHolder}

      {/* 顶部操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>
          {studentName} 的考学规划
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalOpen(true)}
        >
          新建规划
        </Button>
      </div>

      {/* 当前阶段状态横幅 */}
      <PlanBanner
        studentId={studentId}
        plan={currentPlan}
        isStudentView={false}
        onViewDetail={() => {/* 教师端不需要跳转 */}}
      />

      {/* 阶段时间轴 */}
      <Card title="考学阶段时间轴" style={{ marginBottom: 16 }}>
        {timelinePlans.length === 0 ? (
          <Empty description="暂无规划记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Timeline
            items={timelinePlans.map((plan) => {
              const periodLabel = PERIOD_LABELS[plan.periodCode] ?? plan.stageName;
              const statusLabel = PLAN_STATUS_LABELS[plan.status];
              const statusColor = PLAN_STATUS_COLORS[plan.status];
              const isCurrentActive = plan.status === PlanStatus.Active;

              return {
                key: plan.id,
                dot: getTimelineIcon(plan.status),
                color: isCurrentActive ? 'green' : 'blue',
                children: (
                  <Card
                    size="small"
                    style={{
                      marginBottom: 8,
                      border: isCurrentActive ? '1px solid #52c41a' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <Space wrap>
                        <Text strong>{periodLabel}</Text>
                        <Tag color={statusColor}>{statusLabel}</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          v{plan.version}
                        </Text>
                      </Space>
                      <Space>
                        {/* 草稿状态：可发送 */}
                        {plan.status === PlanStatus.Draft && (
                          <Tooltip title="发送给学生确认">
                            <Button
                              size="small"
                              type="primary"
                              icon={<SendOutlined />}
                              loading={sendPlanMutation.isPending}
                              onClick={() => handleSendPlan(plan.id)}
                            >
                              发送确认
                            </Button>
                          </Tooltip>
                        )}
                        {/* 活跃状态：可发起变更 */}
                        {plan.status === PlanStatus.Active && (
                          <Tooltip title="发起规划变更">
                            <Button
                              size="small"
                              icon={<SyncOutlined />}
                              onClick={() => handleOpenChangePlan(plan.id)}
                            >
                              发起变更
                            </Button>
                          </Tooltip>
                        )}
                      </Space>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {plan.startDate} ～ {plan.endDate}
                      </Text>
                      {plan.goal && (
                        <Text
                          type="secondary"
                          style={{ display: 'block', fontSize: 12, marginTop: 4 }}
                        >
                          目标：{plan.goal}
                        </Text>
                      )}
                    </div>

                    {/* 任务列表（仅活跃规划展开显示） */}
                    {isCurrentActive && plan.tasks && plan.tasks.length > 0 && (
                      <>
                        <Divider style={{ margin: '8px 0' }} />
                        <Text
                          type="secondary"
                          style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
                        >
                          任务清单（{plan.tasks.length} 项）
                        </Text>
                        <List
                          size="small"
                          dataSource={plan.tasks.slice(0, 5)} // 最多显示5条
                          renderItem={(task) => (
                            <List.Item style={{ padding: '0', border: 'none' }}>
                              <TaskItem task={task} canCheck={false} />
                            </List.Item>
                          )}
                        />
                        {plan.tasks.length > 5 && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            还有 {plan.tasks.length - 5} 个任务...
                          </Text>
                        )}
                      </>
                    )}
                  </Card>
                ),
              };
            })}
          />
        )}
      </Card>

      {/* 操作日志 */}
      <Card title="操作日志">
        <OperationLogList logs={logs ?? []} loading={logsLoading} />
      </Card>

      {/* 创建规划弹窗 */}
      <Modal
        title={`为 ${studentName} 新建规划`}
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleCreatePlan}
        confirmLoading={createPlanMutation.isPending}
        okText="创建草稿"
        width={600}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="periodCode"
            label="阶段"
            rules={[{ required: true, message: '请选择阶段' }]}
          >
            <Select placeholder="选择考学阶段">
              {Object.entries(PERIOD_LABELS).map(([code, label]) => (
                <Select.Option key={code} value={code}>
                  {code} - {label}
                </Select.Option>
              ))}
              <Select.Option value="custom">自定义阶段</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="stageName"
            label="阶段名称"
            rules={[{ required: true, message: '请输入阶段名称' }]}
          >
            <Input placeholder="如：研究计划书期（第一轮）" />
          </Form.Item>

          <Form.Item name="goal" label="阶段目标">
            <TextArea rows={2} placeholder="如：完成研究计划书初稿并获班主任确认定稿" />
          </Form.Item>

          <Space style={{ width: '100%' }}>
            <Form.Item
              name="startDate"
              label="开始日期"
              rules={[{ required: true, message: '请选择开始日期' }]}
              style={{ flex: 1 }}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="endDate"
              label="截止日期"
              rules={[{ required: true, message: '请选择截止日期' }]}
              style={{ flex: 1 }}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* 变更规划弹窗 */}
      <Modal
        title="发起规划变更"
        open={changeModalOpen}
        onCancel={() => setChangeModalOpen(false)}
        onOk={handleChangePlan}
        confirmLoading={changePlanMutation.isPending}
        okText="发起变更"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">
            发起变更后，学生将收到通知并需要重新确认新版规划。
          </Text>
          <Form form={changeForm} layout="vertical">
            <Form.Item
              name="changeReason"
              label="变更原因"
              rules={[{ required: true, message: '请填写变更原因' }]}
            >
              <TextArea rows={3} placeholder="请说明此次变更的原因..." />
            </Form.Item>

            <Form.Item name="stageName" label="新阶段名称（如需修改）">
              <Input placeholder="留空则保持不变" />
            </Form.Item>

            <Form.Item name="endDate" label="新截止日期（如需修改）">
              <DatePicker style={{ width: '100%' }} placeholder="留空则保持不变" />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </>
  );
};

export default StagesTab;
