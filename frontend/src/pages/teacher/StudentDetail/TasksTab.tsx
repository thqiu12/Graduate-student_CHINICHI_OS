// src/pages/teacher/StudentDetail/TasksTab.tsx
// 知日塾大学院考学进度管理系统 - 任务管理 Tab（班主任端）
// 功能：查看/新增/编辑/删除当前规划的任务

import React, { useState, useMemo } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Space,
  Tag,
  Typography,
  Popconfirm,
  Empty,
  Alert,
  message,
  Badge,
  Tooltip,
  Skeleton,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FireOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useStudentPlans } from '../../../api/plans.api';
import apiClient, { getErrorMessage } from '../../../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { planQueryKeys } from '../../../api/plans.api';
import { PlanStatus, TaskStatus, TaskPriority, type PlanTask, type PeriodPlan } from '../../../types/plan';

const { Text } = Typography;
const { TextArea } = Input;

// ─── 优先级颜色映射 ────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  [TaskPriority.High]:   'red',
  [TaskPriority.Medium]: 'orange',
  [TaskPriority.Low]:    'default',
};

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  pending:     { color: 'default',  label: '未开始',  icon: <ClockCircleOutlined /> },
  in_progress: { color: 'processing', label: '进行中', icon: <ClockCircleOutlined /> },
  done:        { color: 'success',  label: '已完成',  icon: <CheckCircleOutlined /> },
  overdue:     { color: 'error',    label: '已逾期',  icon: <ClockCircleOutlined /> },
};

// ─── 任务表单值 ───────────────────────────────────────────

interface TaskFormValues {
  title: string;
  description?: string;
  dueDate?: dayjs.Dayjs;
  priority: TaskPriority;
  repeatType: string;
  sortOrder?: number;
}

// ─── 后端 API 封装 ────────────────────────────────────────

async function createTask(studentId: string, planId: string, data: Omit<TaskFormValues, 'dueDate'> & { dueDate?: string }): Promise<PlanTask> {
  const res = await apiClient.post<{ data: PlanTask }>(
    `/students/${studentId}/plans/${planId}/tasks`,
    data,
  );
  return res.data.data;
}

async function updateTask(studentId: string, taskId: string, data: Partial<Omit<TaskFormValues, 'dueDate'> & { dueDate?: string }>): Promise<PlanTask> {
  const res = await apiClient.patch<{ data: PlanTask }>(
    `/students/${studentId}/tasks/${taskId}`,
    data,
  );
  return res.data.data;
}

async function deleteTask(studentId: string, taskId: string): Promise<void> {
  await apiClient.delete(`/students/${studentId}/tasks/${taskId}`);
}

// ─── 主组件 ───────────────────────────────────────────────

const TasksTab: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [messageApi, contextHolder] = message.useMessage();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlanTask | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form] = Form.useForm<TaskFormValues>();
  const queryClient = useQueryClient();

  const { data: plans, isLoading } = useStudentPlans(studentId);

  // 找到当前活跃/待确认规划
  const activePlan = useMemo<PeriodPlan | null>(() => {
    if (!plans) return null;
    return plans.find(p =>
      p.status === PlanStatus.Active ||
      p.status === PlanStatus.Pending ||
      p.status === PlanStatus.ChangePending
    ) ?? null;
  }, [plans]);

  const tasks = activePlan?.tasks ?? [];

  // 打开新建弹窗
  const handleAdd = () => {
    setEditingTask(null);
    form.resetFields();
    form.setFieldsValue({ priority: TaskPriority.Medium, repeatType: 'once', sortOrder: tasks.length });
    setModalOpen(true);
  };

  // 打开编辑弹窗
  const handleEdit = (task: PlanTask) => {
    setEditingTask(task);
    form.setFieldsValue({
      title: task.title,
      description: task.description ?? undefined,
      dueDate: task.dueDate ? dayjs(task.dueDate) : undefined,
      priority: task.priority as TaskPriority,
      repeatType: task.repeatType,
      sortOrder: task.sortOrder,
    });
    setModalOpen(true);
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!activePlan) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        ...values,
        dueDate: values.dueDate?.format('YYYY-MM-DD'),
      };
      delete (payload as Record<string, unknown>).dueDate;
      const finalPayload = {
        ...values,
        dueDate: values.dueDate?.format('YYYY-MM-DD') ?? undefined,
      };

      if (editingTask) {
        await updateTask(studentId, editingTask.id, finalPayload);
        messageApi.success('任务已更新');
      } else {
        await createTask(studentId, activePlan.id, finalPayload);
        messageApi.success('任务已创建');
      }

      // 刷新规划数据
      queryClient.invalidateQueries({ queryKey: planQueryKeys.all(studentId) });
      setModalOpen(false);
    } catch (err) {
      const errMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      messageApi.error(errMsg ?? (editingTask ? '更新失败' : '创建失败'));
    } finally {
      setSubmitting(false);
    }
  };

  // 删除任务
  const handleDelete = async (taskId: string) => {
    setDeletingId(taskId);
    try {
      await deleteTask(studentId, taskId);
      queryClient.invalidateQueries({ queryKey: planQueryKeys.all(studentId) });
      messageApi.success('任务已删除');
    } catch (err) {
      messageApi.error(getErrorMessage(err, '删除失败，请重试'));
    } finally {
      setDeletingId(null);
    }
  };

  // 表格列定义
  const columns: ColumnsType<PlanTask> = [
    {
      title: '排序',
      dataIndex: 'sortOrder',
      width: 60,
      sorter: (a, b) => a.sortOrder - b.sortOrder,
      defaultSortOrder: 'ascend',
    },
    {
      title: '任务名称',
      dataIndex: 'title',
      render: (title: string, record) => (
        <Space>
          <Text
            style={{
              textDecoration: record.status === TaskStatus.Done ? 'line-through' : undefined,
              color: record.status === TaskStatus.Done ? '#8c8c8c' : undefined,
            }}
          >
            {title}
          </Text>
          {record.description && (
            <Tooltip title={record.description}>
              <Text type="secondary" style={{ fontSize: 11 }}>（有说明）</Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 90,
      render: (p: string) => (
        <Tag color={PRIORITY_COLORS[p] ?? 'default'} icon={p === TaskPriority.High ? <FireOutlined /> : undefined}>
          {p}
        </Tag>
      ),
    },
    {
      title: '截止日期',
      dataIndex: 'dueDate',
      width: 110,
      render: (d: string | null) => d ? d.slice(0, 10) : <Text type="secondary">—</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: string) => {
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG['pending'];
        return <Badge status={cfg.color as 'default' | 'processing' | 'success' | 'error'} text={cfg.label} />;
      },
    },
    {
      title: '操作',
      width: 110,
      render: (_: unknown, record: PlanTask) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="确认删除此任务？"
            description="删除后不可恢复"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deletingId === record.id}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (isLoading) {
    return <Skeleton active paragraph={{ rows: 6 }} />;
  }

  if (!activePlan) {
    return (
      <Empty
        description={
          <Space direction="vertical">
            <Text>该学生暂无活跃或待确认的规划</Text>
            <Text type="secondary">请先在「考学阶段」Tab 中创建并发送规划</Text>
          </Space>
        }
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        style={{ padding: '48px 0' }}
      />
    );
  }

  const doneCount = tasks.filter(t => t.status === TaskStatus.Done).length;
  const overdueCount = tasks.filter(t => {
    if (t.status === TaskStatus.Done || !t.dueDate) return false;
    return new Date(t.dueDate) < new Date(new Date().toDateString());
  }).length;

  return (
    <>
      {contextHolder}

      {/* 规划状态提示 */}
      <Alert
        type={activePlan.status === PlanStatus.Active ? 'success' : 'warning'}
        message={
          <Space>
            <Text strong>当前规划：{activePlan.stageName}</Text>
            <Tag color={activePlan.status === PlanStatus.Active ? 'success' : 'warning'}>
              {activePlan.status === PlanStatus.Active ? '执行中' : '待确认'}
            </Tag>
            <Text type="secondary">{activePlan.startDate?.slice(0,10)} ～ {activePlan.endDate?.slice(0,10)}</Text>
          </Space>
        }
        description={
          <Space>
            <Text>共 {tasks.length} 个任务</Text>
            <Text type="success">已完成 {doneCount} 个</Text>
            {overdueCount > 0 && <Text type="danger">逾期 {overdueCount} 个</Text>}
          </Space>
        }
        style={{ marginBottom: 16 }}
      />

      {/* 操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增任务
        </Button>
      </div>

      {/* 任务表格 */}
      <Table
        dataSource={tasks}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        locale={{ emptyText: <Empty description="暂无任务，点击「新增任务」添加" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingTask ? '编辑任务' : '新增任务'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText={editingTask ? '保存修改' : '创建任务'}
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }, { max: 100, message: '最多100字' }]}
          >
            <Input placeholder="如：完成研究计划书大纲" />
          </Form.Item>

          <Form.Item name="description" label="任务说明（选填）">
            <TextArea rows={2} placeholder="对任务的具体要求或说明..." maxLength={500} showCount />
          </Form.Item>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item name="priority" label="优先级" style={{ flex: 1, minWidth: 120 }}>
              <Select>
                <Select.Option value="高"><Tag color="red">高</Tag></Select.Option>
                <Select.Option value="中"><Tag color="orange">中</Tag></Select.Option>
                <Select.Option value="低"><Tag>低</Tag></Select.Option>
              </Select>
            </Form.Item>

            <Form.Item name="dueDate" label="截止日期" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item name="repeatType" label="重复类型" style={{ flex: 1 }}>
              <Select>
                <Select.Option value="once">不重复</Select.Option>
                <Select.Option value="daily">每日</Select.Option>
                <Select.Option value="weekly">每周</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item name="sortOrder" label="排序权重" style={{ flex: 1 }}>
              <Input type="number" min={0} max={999} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
};

export default TasksTab;
