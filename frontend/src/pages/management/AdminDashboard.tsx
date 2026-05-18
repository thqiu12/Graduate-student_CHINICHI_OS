// src/pages/management/AdminDashboard.tsx
// 知日塾大学院考学进度管理系统 - 教务总负责人看板

import React, { useMemo, useState } from 'react';
import {
  Row, Col, Card, Statistic, Table, Tag, Button, Typography, Alert,
  Progress, Divider, message, Space, Spin,
} from 'antd';
import {
  TeamOutlined, WarningOutlined, ClockCircleOutlined,
  DownloadOutlined, TrophyOutlined, UserAddOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useStatsOverview, useExamSeasonStats, useAlerts } from '../../api/stats.api';
import apiClient, { getErrorMessage } from '../../api/client';
import { useStudents } from '../../api/students.api';
import StudentDrilldownDrawer, {
  getLatestPlan,
  hasInnoStatus,
  type StudentDrilldownState,
} from './StudentDrilldownDrawer';

const { Title, Text } = Typography;

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [messageApi, ctxHolder] = message.useMessage();
  const [studentDrawer, setStudentDrawer] = useState<StudentDrilldownState | null>(null);
  const { data: overview, isLoading } = useStatsOverview();
  const { data: examStats } = useExamSeasonStats();
  const { data: alerts } = useAlerts();
  const { data: studentsData, isLoading: studentsLoading } = useStudents({ pageSize: 1000 });

  const summer = examStats?.data?.summer;
  const winter = examStats?.data?.winter;
  const noPlan = alerts?.noPlan ?? [];
  const pendingTooLong = alerts?.pendingTooLong ?? [];
  const students = studentsData?.data ?? [];
  const riskStudents = useMemo(
    () => students.filter((student) => (student.riskTags?.length ?? 0) > 0),
    [students],
  );
  const noPlanStudents = useMemo(
    () => students.filter((student) => !student.periodPlans?.length),
    [students],
  );
  const activePlanStudents = useMemo(
    () => students.filter((student) => getLatestPlan(student, 'active')),
    [students],
  );
  const openStudentDrawer = (title: string, list: typeof students, description?: string) => {
    setStudentDrawer({ title, students: list, description });
  };

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;

  const handleExport = async () => {
    try {
      const res = await apiClient.get('/students/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      messageApi.error(getErrorMessage(e, '导出失败，请稍后重试'));
    }
  };

  const planStatData = Object.entries(overview?.planStats ?? {}).map(([status, count]) => {
    const labels: Record<string, string> = {
      draft: '草稿', pending: '待确认', change_pending: '变更待确认',
      active: '执行中', completed: '已完成', cancelled: '已取消',
    };
    return { status, label: labels[status] ?? status, count };
  });

  return (
    <>
      {ctxHolder}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Title level={4} style={{ margin: 0 }}>教务总负责人看板</Title>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出全量数据</Button>
        </div>

        {/* 全校统计卡片 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => openStudentDrawer('全校学生', students, '当前全校学生列表')}>
              <Statistic title="全校学生" value={overview?.totalStudents ?? students.length} prefix={<TeamOutlined />} valueStyle={{ color: '#1677ff' }} loading={studentsLoading} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => openStudentDrawer('风险学生', riskStudents, '当前存在未解除风险标签的学生')}>
              <Statistic title="风险学生" value={overview?.riskStudents ?? riskStudents.length} prefix={<WarningOutlined />} valueStyle={{ color: '#ff4d4f' }} loading={studentsLoading} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => openStudentDrawer('无规划学生', noPlanStudents, '暂无规划记录的学生')}>
              <Statistic title="无规划学生" value={overview?.noRecentPlanStudents ?? noPlanStudents.length} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#fa8c16' }} loading={studentsLoading} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => openStudentDrawer('规划执行中', activePlanStudents, '存在 active 状态规划的学生')}>
              <Statistic title="规划执行中" value={overview?.planStats?.['active'] ?? activePlanStudents.length} prefix={<TrophyOutlined />} valueStyle={{ color: '#52c41a' }} loading={studentsLoading} />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          {/* 规划状态分布 */}
          <Col xs={24} lg={8}>
            <Card title="规划状态分布">
              {planStatData.map(item => (
                <div
                  key={item.status}
                  onClick={() => openStudentDrawer(
                    `${item.label}规划`,
                    students.filter((student) => getLatestPlan(student, item.status)),
                    `存在${item.label}状态规划的学生`,
                  )}
                  style={{ marginBottom: 12, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text>{item.label}</Text>
                    <Text strong>{item.count} 份</Text>
                  </div>
                  <Progress
                    percent={overview?.totalStudents ? Math.round((item.count / overview.totalStudents) * 100) : 0}
                    size="small"
                    showInfo={false}
                  />
                </div>
              ))}
            </Card>
          </Col>

          {/* 考试季统计 */}
          <Col xs={24} lg={8}>
            <Card title="考试季内诺统计">
              <div
                onClick={() => openStudentDrawer('夏季考已内诺学生', students.filter((student) => student.targetSeason === 'summer' && hasInnoStatus(student, 'confirmed')), '目标考季为夏季考且已有内诺记录的学生')}
                style={{ marginBottom: 20, cursor: 'pointer' }}
              >
                <Text strong>🌸 夏季考</Text>
                <Progress
                  percent={parseInt(summer?.innoRate ?? '0')}
                  strokeColor="#fa8c16"
                  format={() => summer?.innoRate ?? '0%'}
                  style={{ marginTop: 8 }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {summer?.innoCount ?? 0}/{summer?.total ?? 0} 名学生获内诺
                </Text>
              </div>
              <Divider style={{ margin: '8px 0' }} />
              <div
                onClick={() => openStudentDrawer('冬季考已内诺学生', students.filter((student) => student.targetSeason === 'winter' && hasInnoStatus(student, 'confirmed')), '目标考季为冬季考且已有内诺记录的学生')}
                style={{ cursor: 'pointer' }}
              >
                <Text strong>❄️ 冬季考</Text>
                <Progress
                  percent={parseInt(winter?.innoRate ?? '0')}
                  strokeColor="#1677ff"
                  format={() => winter?.innoRate ?? '0%'}
                  style={{ marginTop: 8 }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {winter?.innoCount ?? 0}/{winter?.total ?? 0} 名学生获内诺
                </Text>
              </div>
            </Card>
          </Col>

          {/* 全局预警 */}
          <Col xs={24} lg={8}>
            <Card title={<><WarningOutlined style={{ color: '#ff4d4f' }} /> 全局预警</>}>
              {noPlan.length > 0 && (
                <Alert
                  type="error"
                  message={`⚡ ${noPlan.length} 名学生超7天无规划`}
                  style={{ marginBottom: 8 }}
                  action={<Button size="small" type="link" onClick={() => openStudentDrawer('超7天无规划', students.filter((student) => noPlan.some((item) => item.id === student.id)), '全局预警中的无规划学生')}>查看</Button>}
                />
              )}
              {pendingTooLong.length > 0 && (
                <Alert
                  type="warning"
                  message={`⏳ ${pendingTooLong.length} 名学生规划超3天待确认`}
                  style={{ marginBottom: 8 }}
                  action={<Button size="small" type="link" onClick={() => openStudentDrawer('超3天待确认', students.filter((student) => pendingTooLong.some((item) => item.id === student.id)), '全局预警中的待确认超时学生')}>查看</Button>}
                />
              )}
              {noPlan.length === 0 && pendingTooLong.length === 0 && (
                <Text type="secondary">🎉 暂无预警</Text>
              )}

              <Divider style={{ margin: '12px 0' }} />
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button block onClick={() => navigate('/teacher/students')}>查看全部学生</Button>
                <Button block type="dashed" onClick={handleExport} icon={<DownloadOutlined />}>
                  导出数据（权限专享）
                </Button>
                <Button
                  block
                  type="primary"
                  icon={<UserAddOutlined />}
                  onClick={() => navigate('/admin/users')}
                >
                  账号管理
                </Button>
              </Space>
            </Card>
          </Col>
        </Row>
      </div>
      <StudentDrilldownDrawer state={studentDrawer} onClose={() => setStudentDrawer(null)} />
    </>
  );
};

export default AdminDashboard;
