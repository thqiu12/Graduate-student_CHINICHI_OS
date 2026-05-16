// src/pages/student/Home.tsx
// 知日塾大学院考学进度管理系统 - 学生主页
// 显示：阶段卡片 + 今日待办 + 本周任务，规划未确认时显示锁定状态

import React, { useMemo } from 'react';
import {
  Card,
  Col,
  Row,
  Spin,
  Typography,
  Empty,
  Alert,
  Badge,
  Space,
  Divider,
  message,
} from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../stores/auth.store';
import { useStudentPlans, useConfirmPlan, useRejectPlan, useToggleTask } from '../../api/plans.api';
import { PlanBanner } from '../../components/PlanBanner';
import { TaskItem } from '../../components/TaskItem';
import { PlanStatus, TaskStatus, type PeriodPlan, type PlanTask } from '../../types/plan';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

// ─── 辅助函数 ─────────────────────────────────────────────

/**
 * 从规划列表中提取当前活跃或待确认的规划
 */
function getCurrentPlan(plans: PeriodPlan[]): PeriodPlan | null {
  // 优先返回 active 状态
  const active = plans.find((p) => p.status === PlanStatus.Active);
  if (active) return active;

  // 其次返回 change_pending 或 pending 状态
  const pending = plans.find(
    (p) => p.status === PlanStatus.Pending || p.status === PlanStatus.ChangePending,
  );
  return pending ?? null;
}

/**
 * 判断任务是否属于今天
 */
function isToday(dateStr: string): boolean {
  const today = new Date().toDateString();
  return new Date(dateStr).toDateString() === today;
}

/**
 * 判断任务是否属于本周
 */
function isThisWeek(dateStr: string): boolean {
  const now = new Date();
  const taskDate = new Date(dateStr);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1); // 周一
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // 周日
  endOfWeek.setHours(23, 59, 59, 999);
  return taskDate >= startOfWeek && taskDate <= endOfWeek;
}

// ─── 子组件：锁定状态（规划未确认时） ────────────────────

const LockedTasksView: React.FC<{
  plan: PeriodPlan;
  onConfirm: (planId: string) => void;
  onReject: (planId: string) => void;
  loading: boolean;
}> = ({ plan, onConfirm, onReject, loading }) => {
  const navigate = useNavigate();

  return (
    <Card
      style={{
        borderStyle: 'dashed',
        borderColor: '#d9d9d9',
        background: '#fafafa',
      }}
    >
      <div style={{ textAlign: 'center', padding: '32px 16px' }}>
        <LockOutlined style={{ fontSize: 48, color: '#bfbfbf', marginBottom: 16 }} />
        <Title level={4} style={{ color: '#8c8c8c', marginBottom: 8 }}>
          规划待确认，任务暂时锁定
        </Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          班主任已为你制定了阶段计划，确认后才能查看具体待办任务。
        </Text>
      </div>
    </Card>
  );
};

// ─── 主组件 ───────────────────────────────────────────────

const StudentHomePage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  // studentId 是 Student 表的 ID（登录时后端附带），而非 User 表 ID
  const studentId = user?.studentId ?? user?.id ?? '';

  const { data: plans, isLoading } = useStudentPlans(studentId);

  const confirmPlanMutation = useConfirmPlan(studentId);
  const rejectPlanMutation = useRejectPlan(studentId);
  const toggleTaskMutation = useToggleTask(studentId);

  const currentPlan = useMemo(() => {
    if (!plans) return null;
    return getCurrentPlan(plans);
  }, [plans]);

  // 判断是否处于锁定状态（有规划但未确认）
  const isLocked = useMemo(() => {
    return (
      currentPlan !== null &&
      (currentPlan.status === PlanStatus.Pending ||
        currentPlan.status === PlanStatus.ChangePending)
    );
  }, [currentPlan]);

  // 从活跃规划中提取今日和本周任务
  const activePlan = useMemo(
    () => (plans ?? []).find((p) => p.status === PlanStatus.Active),
    [plans],
  );

  const todayTasks = useMemo<PlanTask[]>(() => {
    if (!activePlan?.tasks) return [];
    return activePlan.tasks.filter(
      (t) => t.dueDate && isToday(t.dueDate) && t.status !== TaskStatus.Done,
    );
  }, [activePlan]);

  const weekTasks = useMemo<PlanTask[]>(() => {
    if (!activePlan?.tasks) return [];
    return activePlan.tasks.filter((t) => t.dueDate && isThisWeek(t.dueDate));
  }, [activePlan]);

  const handleConfirm = async (planId: string) => {
    try {
      await confirmPlanMutation.mutateAsync(planId);
      messageApi.success('规划已确认，开始执行！');
    } catch (_err) {
      messageApi.error('确认失败，请重试');
    }
  };

  const handleReject = (planId: string) => {
    navigate(`/student/plan-confirm/${planId}?action=reject`);
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return (
    <>
      {contextHolder}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        {/* 问候语 */}
        <div style={{ marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 4 }}>
            你好，{user?.name ?? '同学'}
          </Title>
          <Text type="secondary">
            {new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </Text>
        </div>

        {/* 规划状态横幅 */}
        {currentPlan && (
          <PlanBanner
            studentId={studentId}
            plan={currentPlan}
            isStudentView
            onViewDetail={(id) => navigate(`/student/plan-confirm/${id}`)}
            onConfirm={handleConfirm}
            onReject={handleReject}
            loading={confirmPlanMutation.isPending}
          />
        )}

        {/* 无规划提示 */}
        {!currentPlan && (
          <Alert
            type="error"
            message="暂无考学规划"
            description="你的班主任尚未为你制定考学规划，请联系班主任。"
            style={{ marginBottom: 16 }}
          />
        )}

        {/* 规划锁定状态：隐藏任务列表 */}
        {isLocked && currentPlan ? (
          <LockedTasksView
            plan={currentPlan}
            onConfirm={handleConfirm}
            onReject={handleReject}
            loading={confirmPlanMutation.isPending}
          />
        ) : (
          <Row gutter={[16, 16]}>
            {/* 今日待办 */}
            <Col xs={24} md={12}>
              <Card
                title={
                  <Space>
                    <span>今日待办</span>
                    <Badge count={todayTasks.length} showZero color="#ff4d4f" />
                  </Space>
                }
                size="small"
              >
                {todayTasks.length === 0 ? (
                  <Empty
                    description="今天没有待完成的任务"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                ) : (
                  todayTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      canCheck={true}
                      onStatusChange={async (taskId, done) => {
                        await toggleTaskMutation.mutateAsync({ taskId, done });
                        messageApi.success(done ? '任务已完成 🎉' : '已取消完成');
                      }}
                    />
                  ))
                )}
              </Card>
            </Col>

            {/* 本周任务 */}
            <Col xs={24} md={12}>
              <Card
                title={
                  <Space>
                    <span>本周任务</span>
                    <Badge
                      count={weekTasks.filter((t) => t.status !== TaskStatus.Done).length}
                      showZero
                      color="#1677ff"
                    />
                  </Space>
                }
                size="small"
              >
                {weekTasks.length === 0 ? (
                  <Empty
                    description="本周暂无任务"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                ) : (
                  <>
                    {weekTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        canCheck={true}
                        onStatusChange={async (taskId, done) => {
                          await toggleTaskMutation.mutateAsync({ taskId, done });
                          messageApi.success(done ? '任务已完成 🎉' : '已取消完成');
                        }}
                      />
                    ))}
                    <Divider style={{ margin: '8px 0' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      共 {weekTasks.length} 个任务，
                      已完成 {weekTasks.filter((t) => t.status === TaskStatus.Done).length} 个
                    </Text>
                  </>
                )}
              </Card>
            </Col>
          </Row>
        )}
      </div>
    </>
  );
};

export default StudentHomePage;
