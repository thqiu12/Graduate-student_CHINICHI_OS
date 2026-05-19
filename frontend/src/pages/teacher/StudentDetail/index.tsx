// src/pages/teacher/StudentDetail/index.tsx
// 知日塾大学院考学进度管理系统 - 学生详情页

import React, { useState } from 'react';
import {
  Tabs, Card, Descriptions, Tag, Button, Typography, Timeline,
  Form, Input, Select, DatePicker, Modal, Upload, message, Table,
  Space, Popconfirm, Badge, Row, Col, Statistic, Divider, Empty, Spin, Checkbox, List,
} from 'antd';
import {
  PlusOutlined, UploadOutlined, DeleteOutlined, EyeOutlined,
  FileTextOutlined, ExperimentOutlined, NotificationOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStudent } from '../../../api/students.api';
import { useCoachingRecords, useAddCoachingRecord } from '../../../api/coaching.api';
import { useTargetSchools, useAddSchool, useDeleteSchool, useUpdateSchoolNode } from '../../../api/schools.api';
import { usePushNotification } from '../../../api/notifications.api';
import StagesTab from './StagesTab';
import TasksTab from './TasksTab';
import apiClient, { getErrorMessage } from '../../../api/client';
import { useAuthStore } from '../../../stores/auth.store';
import FileVersionsWithFeedback, { type FileWithVersions } from '../../../components/FileVersionsWithFeedback';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const RISK_TAG_LABELS: Record<string, string> = {
  pace_risk: '推进节奏风险', attitude_issue: '态度问题',
  inno_gap: '内诺差距', preparation_weak: '备考薄弱', exam_repeat: '重考生',
};

interface FilesResponse {
  data: Record<string, FileWithVersions[]>;
  typeNames: Record<string, string>;
}

// ─── 辅导记录 Tab ─────────────────────────────────────────
const CoachingTab: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [visible, setVisible] = useState(false);
  const [form] = Form.useForm();
  const [messageApi, ctxHolder] = message.useMessage();
  const { data, isLoading } = useCoachingRecords(studentId);
  const addMutation = useAddCoachingRecord(studentId);

  const FORM_LABELS: Record<string, string> = { face: '面谈', online: '线上', phone: '电话', message: '消息' };

  const handleAdd = async (values: any) => {
    try {
      await addMutation.mutateAsync({
        ...values,
        date: values.date?.format('YYYY-MM-DD'),
      });
      messageApi.success('辅导记录已添加');
      setVisible(false);
      form.resetFields();
    } catch (e) {
      messageApi.error(getErrorMessage(e, '添加失败'));
    }
  };

  if (isLoading) return <Spin />;
  const records = data?.data ?? [];

  return (
    <>
      {ctxHolder}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setVisible(true)}>
          新增辅导记录
        </Button>
      </div>

      {records.length === 0 ? (
        <Empty description="暂无辅导记录" />
      ) : (
        <Timeline
          items={records.map(r => ({
            color: 'blue',
            children: (
              <Card size="small" style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text strong>{dayjs(r.coachedAt).format('YYYY年MM月DD日')}</Text>
                  <Tag>{FORM_LABELS[r.form] ?? r.form}</Tag>
                </div>
                <Text>{r.content}</Text>
                {r.todos?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>📋 TODO：</Text>
                    {r.todos.map(t => <div key={t.id} style={{ fontSize: 12, color: '#666' }}>• {t.title}</div>)}
                  </div>
                )}
              </Card>
            ),
          }))}
        />
      )}

      <Modal title="新增辅导记录" open={visible} onCancel={() => { setVisible(false); form.resetFields(); }} footer={null} width={560}>
        <Form form={form} layout="vertical" onFinish={handleAdd}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="date" label="辅导日期" rules={[{ required: true }]} initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="form" label="辅导形式">
                <Select defaultValue="face" options={[
                  { value: 'face', label: '面谈' }, { value: 'online', label: '线上' },
                  { value: 'phone', label: '电话' }, { value: 'message', label: '消息' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="summary" label="辅导内容" rules={[{ required: true, message: '请输入辅导内容' }]}>
            <Input.TextArea rows={4} placeholder="记录本次辅导的主要内容和讨论结果..." />
          </Form.Item>
          <Form.Item name="nextAction" label="下次行动">
            <Input placeholder="约定的下次行动项..." />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => { setVisible(false); form.resetFields(); }}>取消</Button>
              <Button type="primary" htmlType="submit" loading={addMutation.isPending}>保存</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// ─── 志望校 Tab ───────────────────────────────────────────
const SchoolsTab: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [visible, setVisible] = useState(false);
  const [form] = Form.useForm();
  const [messageApi, ctxHolder] = message.useMessage();
  const { data, isLoading } = useTargetSchools(studentId);
  const addMutation = useAddSchool(studentId);
  const deleteMutation = useDeleteSchool(studentId);
  const updateNodeMutation = useUpdateSchoolNode(studentId);

  const handleAdd = async (values: any) => {
    try {
      await addMutation.mutateAsync({ ...values, examTypes: values.examTypes ?? [] });
      messageApi.success('志望校已添加');
      setVisible(false);
      form.resetFields();
    } catch (e) {
      messageApi.error(getErrorMessage(e, '添加失败'));
    }
  };

  const schools = data?.data ?? [];

  const columns = [
    { title: '志望順位', dataIndex: 'rank', render: (v: number) => v ? `第${v}志望` : '-', width: 90 },
    { title: '学校名', dataIndex: 'universityName', render: (v: string) => <Text strong>{v}</Text> },
    { title: '研究科/専攻', dataIndex: 'department', render: (v: string) => v ?? '-' },
    { title: '指导教员', dataIndex: 'professorName', render: (v: string) => v ?? '-' },
    {
      title: '考试类型', dataIndex: 'examTypes',
      render: (v: string[]) => v?.map(t => <Tag key={t}>{t}</Tag>),
    },
    {
      title: '进度节点',
      dataIndex: 'progressNodes',
      render: (nodes: any[], record: any) => (
        <Space size={[4, 4]} wrap>
          {(nodes ?? []).map((node) => (
            <Checkbox
              key={node.id}
              checked={node.isDone}
              onChange={(event) => updateNodeMutation.mutate({
                schoolId: record.id,
                nodeId: node.id,
                isDone: event.target.checked,
              })}
            >
              {node.nodeName}
            </Checkbox>
          ))}
        </Space>
      ),
    },
    {
      title: '内诺状态', dataIndex: 'innoTracking',
      render: (t: any) => {
        if (!t) return <Tag>未跟进</Tag>;
        const map: Record<string, any> = {
          not_started: { color: 'default', text: '未开始' },
          in_progress: { color: 'processing', text: '跟进中' },
          confirmed: { color: 'success', text: '已内诺' },
          rejected: { color: 'error', text: '已拒绝' },
        };
        const s = map[t.status] ?? { color: 'default', text: t.status };
        return <Badge status={s.color} text={s.text} />;
      },
    },
    {
      title: '操作',
      render: (_: any, r: any) => (
        <Popconfirm title="确定删除此志望校？" onConfirm={() => deleteMutation.mutate(r.id)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      {ctxHolder}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setVisible(true)}>
          添加志望校
        </Button>
      </div>
      <Table dataSource={schools} columns={columns} rowKey="id" loading={isLoading} size="small"
        locale={{ emptyText: '暂无志望校' }} pagination={false} />

      <Modal title="添加志望校" open={visible} onCancel={() => { setVisible(false); form.resetFields(); }} footer={null} width={500}>
        <Form form={form} layout="vertical" onFinish={handleAdd}>
          <Form.Item name="universityName" label="学校名称" rules={[{ required: true }]}>
            <Input placeholder="如：東京大学" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="department" label="研究科/专攻">
                <Input placeholder="如：情報理工学系研究科" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="rank" label="志望顺位">
                <Select options={[1,2,3,4,5].map(v => ({ value: v, label: `第${v}志望` }))} allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="professorName" label="指导教员">
                <Input placeholder="如：田中教授" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="examTypes" label="考试类型">
                <Select mode="multiple" options={[
                  { value: 'summer', label: '夏季' }, { value: 'winter', label: '冬季' },
                  { value: 'special', label: '特别选考' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => { setVisible(false); form.resetFields(); }}>取消</Button>
              <Button type="primary" htmlType="submit" loading={addMutation.isPending}>添加</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// ─── 文件管理 Tab ─────────────────────────────────────────
const FilesTab: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [messageApi, ctxHolder] = message.useMessage();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const { user } = useAuthStore();
  const currentUserId = user?.id ?? '';
  const { data, isLoading } = useQuery<FilesResponse>({
    queryKey: ['teacher-student-files', studentId],
    queryFn: async () => {
      const res = await apiClient.get(`/students/${studentId}/files`);
      return res.data as FilesResponse;
    },
    enabled: !!studentId,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['teacher-student-files', studentId] });

  const handleUpload = async (options: any, fileType: string) => {
    const { file, onSuccess, onError } = options;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('fileType', fileType);
      fd.append('description', file.name);
      await apiClient.post(`/students/${studentId}/files`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      messageApi.success('文件上传成功');
      refresh();
      onSuccess('ok');
    } catch (_e) {
      messageApi.error(getErrorMessage(_e, '上传失败'));
      onError(_e);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (file: FileWithVersions) => {
    try {
      await apiClient.delete(`/students/${studentId}/files/${file.id}`);
      messageApi.success('文件已删除');
      refresh();
    } catch (e) {
      messageApi.error(getErrorMessage(e, '删除失败，请稍后重试'));
    }
  };

  const fileTypes = [
    { key: 'research_plan', label: '研究计划书', icon: <FileTextOutlined />, color: '#1677ff' },
    { key: 'transcript', label: '成绩单', icon: <FileTextOutlined />, color: '#52c41a' },
    { key: 'certificate', label: '证明文件', icon: <FileTextOutlined />, color: '#fa8c16' },
    { key: 'other', label: '其他文件', icon: <FileTextOutlined />, color: '#9254de' },
  ];
  const groups = data?.data ?? {};
  const typeNames = data?.typeNames ?? {};
  const fileGroups = Object.entries(groups).filter(([, files]) => files.length > 0);

  return (
    <>
      {ctxHolder}
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row gutter={[16, 16]}>
          {fileTypes.map(ft => (
            <Col xs={24} sm={12} key={ft.key}>
              <Card
                size="small"
                title={<><span style={{ color: ft.color }}>{ft.icon}</span> {ft.label}</>}
                extra={
                  <Upload
                    customRequest={(opts) => handleUpload(opts, ft.key)}
                    showUploadList={false}
                    accept=".pdf,.doc,.docx,.jpg,.png"
                  >
                    <Button size="small" icon={<UploadOutlined />} loading={uploading}>上传</Button>
                  </Upload>
                }
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {ft.key === 'research_plan' ? '📌 每次上传自动递增版本号' : '支持 PDF / Word / 图片'}
                </Text>
              </Card>
            </Col>
          ))}
        </Row>

        <Card size="small" title="已上传文件" loading={isLoading}>
          {fileGroups.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文件" />
          ) : (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {fileGroups.map(([type, files]) => (
                <div key={type}>
                  <Tag color={type === 'research_plan' ? 'blue' : 'default'}>{typeNames[type] ?? type}</Tag>
                  <List
                    size="small"
                    dataSource={files}
                    renderItem={(file: FileWithVersions) => {
                      const latestVersion = file.versions?.[0];
                      return (
                        <List.Item style={{ display: 'block' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <Space size={8} wrap>
                                <Text strong>{file.fileName}</Text>
                                <Tag color="blue">v{latestVersion?.versionNo ?? '-'}</Tag>
                                {(file.pendingFeedbackCount ?? 0) > 0 && (
                                  <Badge count={file.pendingFeedbackCount} title="待处理批注" />
                                )}
                              </Space>
                              <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  共 {file.versions.length} 个版本 · {dayjs(file.createdAt).format('YYYY-MM-DD')}
                                </Text>
                              </div>
                            </div>
                            <Popconfirm
                              key="delete"
                              title="确定删除此文件？"
                              description="删除后文件和版本记录都将移除。"
                              onConfirm={() => handleDelete(file)}
                              okText="删除"
                              cancelText="取消"
                            >
                              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                            </Popconfirm>
                          </div>
                          <FileVersionsWithFeedback
                            studentId={studentId}
                            file={file}
                            canCreateFeedback={true}
                            currentUserId={currentUserId}
                            onChanged={refresh}
                          />
                        </List.Item>
                      );
                    }}
                  />
                </div>
              ))}
            </Space>
          )}
        </Card>
      </Space>
    </>
  );
};

// ─── 基本档案 Tab ─────────────────────────────────────────
const BasicInfoTab: React.FC<{ student: any }> = ({ student }) => {
  if (!student) return <Spin />;

  const SEASON_LABELS: Record<string, string> = { summer: '夏季考', winter: '冬季考', spring: '春季考' };

  return (
    <Card>
      <Descriptions
        title="基本信息"
        bordered
        column={2}
        labelStyle={{ fontWeight: 'bold', width: 100, whiteSpace: 'nowrap' }}
        contentStyle={{ minWidth: 120 }}
      >
        <Descriptions.Item label="姓名">{student.user?.name}</Descriptions.Item>
        <Descriptions.Item label="手机">{student.user?.phone ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="入学日期">
          {student.entryDate ? dayjs(student.entryDate).format('YYYY年MM月DD日') : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="目标考季">
          {student.targetSeason ? (
            <Tag color={student.targetSeason === 'summer' ? 'orange' : 'blue'}>
              {SEASON_LABELS[student.targetSeason] ?? student.targetSeason}
            </Tag>
          ) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="目标年">
          {student.targetYear ?? '-'}
        </Descriptions.Item>
        <Descriptions.Item label="JLPT">
          {student.jlptLevel ? `${student.jlptLevel}${student.jlptScore ? ` (${student.jlptScore}分)` : ''}` : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="本科专业">
          {student.undergradMajor ?? '-'}
        </Descriptions.Item>
        <Descriptions.Item label="本科 GPA">
          {student.undergradGpa != null ? `${student.undergradGpa} / 4.0` : '-'}
        </Descriptions.Item>
      </Descriptions>

      <Divider />

      <Descriptions title="风险标签" bordered column={1}>
        <Descriptions.Item label="当前标签">
          <Space wrap>
            {student.riskTags?.filter((t: any) => !t.removedAt).map((t: any) => (
              <Tag key={t.tag.code} color="red">{RISK_TAG_LABELS[t.tag.code] ?? t.tag.code}</Tag>
            ))}
            {(!student.riskTags || student.riskTags.filter((t: any) => !t.removedAt).length === 0) && (
              <Tag color="success">无风险标签</Tag>
            )}
          </Space>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

// ─── 主组件 ───────────────────────────────────────────────
const StudentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messageApi, ctxHolder] = message.useMessage();
  const { data: student, isLoading } = useStudent(id ?? '');

  // 推送消息状态
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [pushForm] = Form.useForm<{ title: string; content?: string }>();
  const pushMutation = usePushNotification();

  const handlePushNotification = async (values: { title: string; content?: string }) => {
    if (!id) return;
    try {
      await pushMutation.mutateAsync({ studentId: id, title: values.title, content: values.content });
      messageApi.success('消息已推送');
      setPushModalOpen(false);
      pushForm.resetFields();
    } catch (e) {
      messageApi.error(getErrorMessage(e, '推送失败，请重试'));
    }
  };

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!student) return <div style={{ padding: 40 }}>学生不存在</div>;

  return (
    <div>
      {ctxHolder}
      {/* 页面头部 */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Button onClick={() => navigate(-1)}>← 返回</Button>
        <Title level={4} style={{ margin: 0 }}>
          {student.user?.name} 的考学档案
        </Title>
        <Button
          icon={<NotificationOutlined />}
          onClick={() => setPushModalOpen(true)}
          style={{ marginLeft: 'auto' }}
        >
          推送消息
        </Button>
      </div>

      <Tabs
        defaultActiveKey="basic"
        type="card"
        items={[
          { key: 'basic', label: '📋 基本档案', children: <BasicInfoTab student={student} /> },
          { key: 'stages', label: '📅 考学阶段', children: <StagesTab studentId={id ?? ''} studentName={student.user?.name ?? ''} /> },
          { key: 'schools', label: '🏫 志望校', children: <SchoolsTab studentId={id ?? ''} /> },
          { key: 'coaching', label: '💬 辅导记录', children: <CoachingTab studentId={id ?? ''} /> },
          { key: 'tasks', label: '✅ 任务管理', children: <TasksTab studentId={id ?? ''} /> },
          { key: 'files', label: '📁 文件管理', children: <FilesTab studentId={id ?? ''} /> },
        ]}
      />

      {/* 推送消息 Modal */}
      <Modal
        title="推送消息给学生"
        open={pushModalOpen}
        onCancel={() => {
          setPushModalOpen(false);
          pushForm.resetFields();
        }}
        onOk={() => pushForm.submit()}
        confirmLoading={pushMutation.isPending}
        okText="推送"
        cancelText="取消"
        destroyOnClose
      >
        <Form
          form={pushForm}
          layout="vertical"
          onFinish={handlePushNotification}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入消息标题' }]}
          >
            <Input placeholder="请输入消息标题" />
          </Form.Item>
          <Form.Item name="content" label="内容（可选）">
            <Input.TextArea rows={4} placeholder="请输入消息内容（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default StudentDetail;
