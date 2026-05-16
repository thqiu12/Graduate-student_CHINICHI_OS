// src/pages/teacher/Dashboard.tsx
// 知日塾大学院考学进度管理系统 - 班主任看板
// 包含：统计概览 + 阶段分布 + 内诺状态 + 风险学生 + 待处理事项

import React, { useState, useMemo } from 'react';
import {
  Row, Col, Card, Statistic, Table, Tag, Button, Modal, Form,
  Input, Select, DatePicker, message, Alert, Typography, Space,
  Progress, Badge, Skeleton, Empty, Divider,
} from 'antd';
import {
  TeamOutlined, WarningOutlined, FileTextOutlined, ClockCircleOutlined,
  PlusOutlined, ExclamationCircleOutlined, CheckCircleOutlined,
  SyncOutlined, MinusCircleOutlined, StarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useStudents, useCreateStudent } from '../../api/students.api';
import { useTeacherDashboardStats, type StageDistributionItem } from '../../api/stats.api';
import { PERIOD_LABELS } from '../../types/plan';

const { Text, Title } = Typography;

// ─── 常量 ─────────────────────────────────────────────────

const RISK_TAG_COLORS: Record<string, string> = {
  pace_risk: 'red',
  attitude_issue: 'orange',
  inno_gap: 'purple',
  preparation_weak: 'gold',
  exam_repeat: 'volcano',
};

const RISK_TAG_LABELS: Record<string, string> = {
  pace_risk: '推进节奏风险',
  attitude_issue: '态度问题',
  inno_gap: '内诺差距',
  preparation_weak: '备考薄弱',
  exam_repeat: '重考生',
};

// 阶段颜色（按考学进程）
const STAGE_COLORS: Record<string, string> = {
  P1: '#95de64',
  P2: '#5cdbd3',
  P3: '#69b1ff',
  P4: '#b37feb',
  P5: '#ff9c6e',
  P6: '#ff6b72',
  P7: '#ffc53d',
  P8: '#52c41a',
};

// 内诺状态配置
const INNO_STATUS_CONFIG = {
  confirmed:   { label: '已内诺', color: '#52c41a', icon: <CheckCircleOutlined /> },
  in_progress: { label: '跟进中', color: '#1677ff', icon: <SyncOutlined spin /> },
  not_started: { label: '未开始', color: '#d9d9d9', icon: <MinusCircleOutlined /> },
  rejected:    { label: '已拒绝', color: '#ff4d4f', icon: <MinusCircleOutlined /> },
};

// ─── 子组件：阶段分布卡片 ─────────────────────────────────

const StageDistributionCard: React.FC<{
  distribution: StageDistributionItem[];
  total: number;
  noActivePlan: number;
  loading: boolean;
}> = ({ distribution, total, noActivePlan, loading }) => {
  if (loading) return <Card title="📊 学生阶段分布"><Skeleton active paragraph={{ rows: 5 }} /></Card>;

  return (
    <Card
      title="📊 学生阶段分布"
      extra={<Text type="secondary">共 {total} 名学生</Text>}
    >
      {distribution.length === 0 && noActivePlan === total ? (
        <Empty description="暂无学生在执行规划" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div style={{ padding: '4px 0' }}>
          {distribution.map((item) => {
            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
            const label = PERIOD_LABELS[item.code] ?? item.stageName;
            const color = STAGE_COLORS[item.code] ?? '#1677ff';
            return (
              <div key={item.code} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Space size={6}>
                    <Tag color={color} style={{ margin: 0 }}>{item.code}</Tag>
                    <Text style={{ fontSize: 13 }}>{label}</Text>
                  </Space>
                  <Text strong>{item.count} 人</Text>
                </div>
                <Progress
                  percent={pct}
                  strokeColor={color}
                  showInfo={false}
                  size="small"
                />
              </div>
            );
          })}

          {noActivePlan > 0 && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={6}>
                  <Tag color="#d9d9d9" style={{ margin: 0 }}>—</Tag>
                  <Text type="secondary" style={{ fontSize: 13 }}>暂无执行中规划</Text>
                </Space>
                <Text type="secondary">{noActivePlan} 人</Text>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
};

// ─── 子组件：内诺状态卡片 ─────────────────────────────────

const InnoStatusCard: React.FC<{
  inno: {
    total: number; confirmed: number; inProgress: number;
    notStarted: number; rejected: number; rate: number;
  };
  loading: boolean;
}> = ({ inno, loading }) => {
  if (loading) return <Card title="🎯 内诺跟踪总览"><Skeleton active paragraph={{ rows: 4 }} /></Card>;

  if (inno.total === 0) {
    return (
      <Card title="🎯 内诺跟踪总览">
        <Empty description="暂无内诺跟踪记录" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '16px 0' }} />
      </Card>
    );
  }

  const items = [
    { key: 'confirmed',   count: inno.confirmed,   ...INNO_STATUS_CONFIG.confirmed },
    { key: 'in_progress', count: inno.inProgress,  ...INNO_STATUS_CONFIG.in_progress },
    { key: 'not_started', count: inno.notStarted,  ...INNO_STATUS_CONFIG.not_started },
    { key: 'rejected',    count: inno.rejected,    ...INNO_STATUS_CONFIG.rejected },
  ];

  return (
    <Card
      title="🎯 内诺跟踪总览"
      extra={
        <Space>
          <StarOutlined style={{ color: '#ffc53d' }} />
          <Text strong style={{ color: inno.rate >= 50 ? '#52c41a' : '#ff4d4f' }}>
            内诺率 {inno.rate}%
          </Text>
        </Space>
      }
    >
      {/* 总进度条 */}
      <div style={{ marginBottom: 16 }}>
        <Progress
          percent={inno.rate}
          strokeColor={{ '0%': '#69b1ff', '100%': '#52c41a' }}
          format={() => `${inno.confirmed}/${inno.total}`}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          共跟踪 {inno.total} 所志望校
        </Text>
      </div>

      {/* 各状态数量 */}
      <Row gutter={[8, 8]}>
        {items.map((item) => (
          <Col span={12} key={item.key}>
            <div style={{
              padding: '10px 12px',
              borderRadius: 6,
              background: '#fafafa',
              border: `1px solid ${item.color}30`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, color: item.color, marginBottom: 2 }}>{item.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: item.color, lineHeight: 1.2 }}>
                {item.count}
              </div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>{item.label}</div>
            </div>
          </Col>
        ))}
      </Row>
    </Card>
  );
};

// ─── 主组件 ───────────────────────────────────────────────

const TeacherDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [messageApi, ctxHolder] = message.useMessage();
  const [newStudentVisible, setNewStudentVisible] = useState(false);
  const [form] = Form.useForm();

  const { data: studentsData, isLoading: studentsLoading } = useStudents({ pageSize: 100 });
  const { data: dashStats, isLoading: statsLoading } = useTeacherDashboardStats();
  const createMutation = useCreateStudent();

  const students = studentsData?.data ?? [];
  const riskStudents = useMemo(
    () => students.filter(s => (s.riskTags?.length ?? 0) > 0),
    [students],
  );
  const pendingStudents = useMemo(
    () => students.filter(s =>
      s.periodPlans?.[0]?.status === 'pending' ||
      s.periodPlans?.[0]?.status === 'change_pending',
    ),
    [students],
  );
  const noPlanStudents = useMemo(
    () => students.filter(s => !s.periodPlans?.length),
    [students],
  );

  const handleCreateStudent = async (values: Record<string, unknown>) => {
    try {
      await createMutation.mutateAsync({
        ...values,
        entryDate: (values.entryDate as { format: (f: string) => string })?.format('YYYY-MM-DD'),
        campusId: Number(values.campusId),
        subjectId: Number(values.subjectId),
        jlptScore: values.jlptScore ? Number(values.jlptScore) : undefined,
      } as Parameters<typeof createMutation.mutateAsync>[0]);
      messageApi.success('学生创建成功');
      setNewStudentVisible(false);
      form.resetFields();
    } catch (_e) {
      messageApi.error('创建失败，请检查信息');
    }
  };

  const riskColumns = [
    {
      title: '姓名',
      dataIndex: ['user', 'name'],
      render: (name: string, r: { id: string }) => (
        <a onClick={() => navigate(`/teacher/students/${r.id}`)}>{name}</a>
      ),
    },
    { title: '手机', dataIndex: ['user', 'phone'] },
    {
      title: '风险标签',
      dataIndex: 'riskTags',
      render: (tags: Array<{ tag: { code: string } }>) => (
        <Space size="small" wrap>
          {tags?.map(t => (
            <Tag key={t.tag.code} color={RISK_TAG_COLORS[t.tag.code] ?? 'default'}>
              {RISK_TAG_LABELS[t.tag.code] ?? t.tag.code}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '操作',
      render: (_: unknown, r: { id: string }) => (
        <Button type="link" size="small" onClick={() => navigate(`/teacher/students/${r.id}`)}>
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <>
      {ctxHolder}

      {/* ─── 第一行：4个统计卡片 ─── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="在籍学生"
              value={students.length}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1677ff' }}
              loading={studentsLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="风险学生"
              value={riskStudents.length}
              prefix={<WarningOutlined />}
              valueStyle={{ color: riskStudents.length > 0 ? '#ff4d4f' : '#52c41a' }}
              loading={studentsLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="规划待确认"
              value={pendingStudents.length}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: pendingStudents.length > 0 ? '#fa8c16' : '#52c41a' }}
              loading={studentsLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="未制定规划"
              value={noPlanStudents.length}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: noPlanStudents.length > 0 ? '#ff7a45' : '#52c41a' }}
              loading={studentsLoading}
            />
          </Card>
        </Col>
      </Row>

      {/* ─── 第二行：阶段分布 + 内诺状态 ─── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <StageDistributionCard
            distribution={dashStats?.stageDistribution ?? []}
            total={dashStats?.totalStudents ?? students.length}
            noActivePlan={dashStats?.noActivePlan ?? 0}
            loading={statsLoading}
          />
        </Col>
        <Col xs={24} lg={10}>
          <InnoStatusCard
            inno={dashStats?.inno ?? { total: 0, confirmed: 0, inProgress: 0, notStarted: 0, rejected: 0, rate: 0 }}
            loading={statsLoading}
          />
        </Col>
      </Row>

      {/* ─── 第三行：风险学生 + 待处理 ─── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title={<><WarningOutlined style={{ color: '#ff4d4f' }} /> 风险学生</>}
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewStudentVisible(true)}>
                新增学生
              </Button>
            }
          >
            <Table
              dataSource={riskStudents}
              columns={riskColumns}
              rowKey="id"
              size="small"
              loading={studentsLoading}
              pagination={{ pageSize: 5, showSizeChanger: false }}
              locale={{ emptyText: <Badge status="success" text="暂无风险学生 🎉" /> }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title={<><ExclamationCircleOutlined /> 待处理事项</>}>
            {pendingStudents.length > 0 && (
              <Alert
                type="warning"
                message={`${pendingStudents.length} 名学生规划待确认`}
                description={pendingStudents.map((s: { user: { name: string } }) => s.user.name).join('、')}
                style={{ marginBottom: 12 }}
                action={
                  <Button size="small" type="link" onClick={() => navigate('/teacher/students')}>
                    查看全部
                  </Button>
                }
              />
            )}
            {noPlanStudents.length > 0 && (
              <Alert
                type="error"
                message={`${noPlanStudents.length} 名学生尚无规划`}
                description={`请尽快为以下学生制定规划：${noPlanStudents.slice(0, 3).map((s: { user: { name: string } }) => s.user.name).join('、')}`}
                style={{ marginBottom: 12 }}
              />
            )}
            {pendingStudents.length === 0 && noPlanStudents.length === 0 && (
              <Space direction="vertical" style={{ padding: '16px 0' }}>
                <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a' }} />
                <Text type="secondary">暂无待处理事项 🎉</Text>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {/* ─── 新建学生 Modal ─── */}
      <Modal
        title="新增学生"
        open={newStudentVisible}
        onCancel={() => { setNewStudentVisible(false); form.resetFields(); }}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateStudent}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
                <Input placeholder="请输入学生姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="手机号"
                rules={[{ required: true }, { pattern: /^1[3-9]\d{9}$/, message: '格式不正确' }]}
              >
                <Input placeholder="1xxxxxxxxxx" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="campusId" label="校区" rules={[{ required: true }]}>
                <Select options={[
                  { value: 1, label: '东京校' }, { value: 2, label: '关西校' },
                  { value: 3, label: '成都校' }, { value: 4, label: '广州校' },
                  { value: 5, label: '上海校' }, { value: 6, label: '杭州校' },
                  { value: 7, label: '武汉校' }, { value: 8, label: '西安校' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="subjectId" label="学科" rules={[{ required: true }]}>
                <Select options={[
                  { value: 1, label: '文科院' }, { value: 2, label: '理科院' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="entryDate" label="入学日期" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="targetSeason" label="目标考试季">
                <Select options={[
                  { value: 'summer', label: '夏季考（7-9月）' },
                  { value: 'winter', label: '冬季考（11-2月）' },
                ]} allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="jlptLevel" label="JLPT 等级">
                <Select options={['N1','N2','N3','N4','N5'].map(v => ({ value: v, label: v }))} allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="undergradMajor" label="本科专业">
                <Input placeholder="如：经济学" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setNewStudentVisible(false); form.resetFields(); }}>取消</Button>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending}>创建学生</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default TeacherDashboard;
