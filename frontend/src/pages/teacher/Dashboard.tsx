// src/pages/teacher/Dashboard.tsx
// 知日塾大学院考学进度管理系统 - 班主任看板

import React, { useState } from 'react';
import {
  Row, Col, Card, Statistic, Table, Tag, Button, Modal, Form,
  Input, Select, DatePicker, message, Badge, Alert, Typography, Space,
} from 'antd';
import {
  TeamOutlined, WarningOutlined, FileTextOutlined, ClockCircleOutlined,
  PlusOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useStudents, useCreateStudent } from '../../api/students.api';
import dayjs from 'dayjs';

const { Text } = Typography;

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

const TeacherDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [messageApi, ctxHolder] = message.useMessage();
  const [newStudentVisible, setNewStudentVisible] = useState(false);
  const [form] = Form.useForm();

  const { data: studentsData, isLoading } = useStudents({ pageSize: 100 });
  const createMutation = useCreateStudent();

  const students = studentsData?.data ?? [];
  const riskStudents = students.filter(s => (s.riskTags?.length ?? 0) > 0);
  const pendingStudents = students.filter(s =>
    s.periodPlans?.[0]?.status === 'pending' || s.periodPlans?.[0]?.status === 'change_pending'
  );
  const noPlanStudents = students.filter(s => !s.periodPlans?.length);

  const handleCreateStudent = async (values: any) => {
    try {
      await createMutation.mutateAsync({
        ...values,
        entryDate: values.entryDate?.format('YYYY-MM-DD'),
        campusId: Number(values.campusId),
        subjectId: Number(values.subjectId),
        jlptScore: values.jlptScore ? Number(values.jlptScore) : undefined,
      });
      messageApi.success('学生创建成功');
      setNewStudentVisible(false);
      form.resetFields();
    } catch (_e) {
      messageApi.error('创建失败，请检查信息');
    }
  };

  const riskColumns = [
    { title: '姓名', dataIndex: ['user', 'name'], render: (name: string, r: any) => (
      <a onClick={() => navigate(`/teacher/students/${r.id}`)}>{name}</a>
    )},
    { title: '手机', dataIndex: ['user', 'phone'] },
    { title: '风险标签', dataIndex: 'riskTags', render: (tags: any[]) => (
      <Space size="small" wrap>
        {tags?.map(t => (
          <Tag key={t.tag.code} color={RISK_TAG_COLORS[t.tag.code] ?? 'default'}>
            {RISK_TAG_LABELS[t.tag.code] ?? t.tag.code}
          </Tag>
        ))}
      </Space>
    )},
    { title: '操作', render: (_: any, r: any) => (
      <Button type="link" size="small" onClick={() => navigate(`/teacher/students/${r.id}`)}>查看详情</Button>
    )},
  ];

  return (
    <>
      {ctxHolder}
      <div>
        {/* 统计卡片 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="在籍学生" value={students.length} prefix={<TeamOutlined />} valueStyle={{ color: '#1677ff' }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="风险学生" value={riskStudents.length} prefix={<WarningOutlined />} valueStyle={{ color: '#ff4d4f' }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="待确认规划" value={pendingStudents.length} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#fa8c16' }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="未制定规划" value={noPlanStudents.length} prefix={<FileTextOutlined />} valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          {/* 风险学生列表 */}
          <Col xs={24} lg={16}>
            <Card
              title={<><WarningOutlined style={{ color: '#ff4d4f' }} /> 风险学生</>}
              extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setNewStudentVisible(true)}>新增学生</Button>}
            >
              <Table
                dataSource={riskStudents}
                columns={riskColumns}
                rowKey="id"
                size="small"
                loading={isLoading}
                pagination={{ pageSize: 5, showSizeChanger: false }}
                locale={{ emptyText: '暂无风险学生' }}
              />
            </Card>
          </Col>

          {/* 待处理事项 */}
          <Col xs={24} lg={8}>
            <Card title={<><ExclamationCircleOutlined /> 待处理事项</>}>
              {pendingStudents.length > 0 && (
                <Alert
                  type="warning"
                  message={`${pendingStudents.length} 名学生规划待确认`}
                  description={pendingStudents.map(s => s.user.name).join('、')}
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
                  description={`请尽快为以下学生制定规划：${noPlanStudents.slice(0, 3).map(s => s.user.name).join('、')}`}
                  style={{ marginBottom: 12 }}
                />
              )}
              {pendingStudents.length === 0 && noPlanStudents.length === 0 && (
                <Text type="secondary">暂无待处理事项 🎉</Text>
              )}
            </Card>
          </Col>
        </Row>
      </div>

      {/* 新建学生 Modal */}
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
              <Form.Item name="phone" label="手机号" rules={[{ required: true }, { pattern: /^1[3-9]\d{9}$/, message: '格式不正确' }]}>
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
          <Form.Item name="teacherId" label="班主任 ID" rules={[{ required: true }]} hidden>
            <Input />
          </Form.Item>
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
