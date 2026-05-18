// src/pages/management/SubjectHeadDashboard.tsx
// 知日塾大学院考学进度管理系统 - 学科负责人看板

import React, { useMemo, useState } from 'react';
import {
  Row, Col, Card, Statistic, Alert, Table, Tag, Button, Typography,
  Progress, Badge, Space, Spin,
} from 'antd';
import {
  WarningOutlined, ClockCircleOutlined, TeamOutlined, TrophyOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useStatsOverview, useExamSeasonStats, useAlerts } from '../../api/stats.api';
import { useStudents } from '../../api/students.api';
import StudentDrilldownDrawer, {
  getLatestPlan,
  hasInnoStatus,
  type StudentDrilldownState,
} from './StudentDrilldownDrawer';

const { Title, Text } = Typography;

const SubjectHeadDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [studentDrawer, setStudentDrawer] = useState<StudentDrilldownState | null>(null);
  const { data: overview, isLoading: ovLoading } = useStatsOverview();
  const { data: examStats } = useExamSeasonStats();
  const { data: alerts } = useAlerts();
  const { data: studentsData, isLoading: studentsLoading } = useStudents({ pageSize: 1000 });

  const noPlan = alerts?.noPlan ?? [];
  const pendingTooLong = alerts?.pendingTooLong ?? [];
  const summer = examStats?.data?.summer;
  const winter = examStats?.data?.winter;
  const students = studentsData?.data ?? [];
  const riskStudents = useMemo(
    () => students.filter((student) => (student.riskTags?.length ?? 0) > 0),
    [students],
  );
  const noPlanStudents = useMemo(
    () => students.filter((student) => !student.periodPlans?.length),
    [students],
  );
  const pendingStudents = useMemo(
    () => students.filter((student) => ['pending', 'change_pending'].includes(getLatestPlan(student)?.status ?? '')),
    [students],
  );
  const openStudentDrawer = (title: string, list: typeof students, description?: string) => {
    setStudentDrawer({ title, students: list, description });
  };

  if (ovLoading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;

  const alertColumns = [
    { title: '学生姓名', dataIndex: 'name', render: (v: string, r: any) => (
      <a onClick={() => navigate(`/teacher/students/${r.id}`)}>{v}</a>
    )},
    { title: '规划状态', dataIndex: 'planStatus', render: (v: string) => (
      <Tag color={!v || v === 'none' ? 'red' : 'orange'}>
        {!v || v === 'none' ? '未制定' : v === 'draft' ? '草稿' : '超期待确认'}
      </Tag>
    )},
    {
      title: '操作', render: (_: any, r: any) => (
        <Button type="link" size="small" onClick={() => navigate(`/teacher/students/${r.id}`)}>
          立即跟进
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>学科负责人看板</Title>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => openStudentDrawer('本学科学生', students, '当前学科权限范围内的全部学生')}>
            <Statistic title="本学科学生" value={overview?.totalStudents ?? students.length} prefix={<TeamOutlined />} valueStyle={{ color: '#1677ff' }} loading={studentsLoading} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => openStudentDrawer('风险学生', riskStudents, '当前存在未解除风险标签的学生')}>
            <Statistic title="风险学生" value={overview?.riskStudents ?? riskStudents.length} prefix={<WarningOutlined />} valueStyle={{ color: '#ff4d4f' }} loading={studentsLoading} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => openStudentDrawer('无规划学生', noPlanStudents, '暂无待确认或执行中规划的学生')}>
            <Statistic title="无规划学生" value={overview?.noRecentPlanStudents ?? noPlanStudents.length} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#fa8c16' }} loading={studentsLoading} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => openStudentDrawer('待确认规划', pendingStudents, '存在待确认或变更待确认规划的学生')}>
            <Statistic title="待确认规划" value={overview?.pendingConfirmation ?? pendingStudents.length} prefix={<TrophyOutlined />} valueStyle={{ color: '#52c41a' }} loading={studentsLoading} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* 告警面板 */}
        <Col xs={24} lg={12}>
          <Card title={<><WarningOutlined style={{ color: '#ff4d4f' }} /> 预警面板</>}>
            {noPlan.length > 0 && (
              <>
                <Alert
                  type="error"
                  message={`${noPlan.length} 名学生超7天无规划`}
                  style={{ marginBottom: 12 }}
                  action={<Button size="small" type="link" onClick={() => openStudentDrawer('超7天无规划', students.filter((student) => noPlan.some((item) => item.id === student.id)), '预警面板中的无规划学生')}>查看</Button>}
                />
                <Table
                  dataSource={noPlan}
                  columns={alertColumns}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  style={{ marginBottom: 16 }}
                />
              </>
            )}
            {pendingTooLong.length > 0 && (
              <>
                <Alert
                  type="warning"
                  message={`${pendingTooLong.length} 名学生规划超3天待确认`}
                  style={{ marginBottom: 12 }}
                  action={<Button size="small" type="link" onClick={() => openStudentDrawer('超3天待确认', students.filter((student) => pendingTooLong.some((item) => item.id === student.id)), '预警面板中的待确认超时学生')}>查看</Button>}
                />
                <Table
                  dataSource={pendingTooLong}
                  columns={[
                    ...alertColumns,
                    { title: '发送时间', dataIndex: 'sentAt', render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-' },
                  ]}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              </>
            )}
            {noPlan.length === 0 && pendingTooLong.length === 0 && (
              <Text type="secondary">🎉 暂无告警</Text>
            )}
          </Card>
        </Col>

        {/* 考试季统计 */}
        <Col xs={24} lg={12}>
          <Card title="考试季统计">
            <Row gutter={[16, 24]}>
              <Col span={24}>
                <Text strong>夏季考</Text>
                <div
                  onClick={() => openStudentDrawer('夏季考已内诺学生', students.filter((student) => student.targetSeason === 'summer' && hasInnoStatus(student, 'confirmed')), '目标考季为夏季考且已有内诺记录的学生')}
                  style={{ marginTop: 8, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text type="secondary">内诺率</Text>
                    <Text>{summer?.innoRate ?? '0%'}</Text>
                  </div>
                  <Progress
                    percent={parseInt(summer?.innoRate ?? '0')}
                    strokeColor="#fa8c16"
                    format={p => `${p}%`}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {summer?.innoCount ?? 0} / {summer?.total ?? 0} 名学生获内诺
                  </Text>
                </div>
              </Col>
              <Col span={24}>
                <Text strong>冬季考</Text>
                <div
                  onClick={() => openStudentDrawer('冬季考已内诺学生', students.filter((student) => student.targetSeason === 'winter' && hasInnoStatus(student, 'confirmed')), '目标考季为冬季考且已有内诺记录的学生')}
                  style={{ marginTop: 8, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text type="secondary">内诺率</Text>
                    <Text>{winter?.innoRate ?? '0%'}</Text>
                  </div>
                  <Progress
                    percent={parseInt(winter?.innoRate ?? '0')}
                    strokeColor="#1677ff"
                    format={p => `${p}%`}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {winter?.innoCount ?? 0} / {winter?.total ?? 0} 名学生获内诺
                  </Text>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
      <StudentDrilldownDrawer state={studentDrawer} onClose={() => setStudentDrawer(null)} />
    </div>
  );
};

export default SubjectHeadDashboard;
