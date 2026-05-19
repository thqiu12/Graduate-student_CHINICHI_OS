// src/pages/teacher/StudentList.tsx
// 知日塾大学院考学进度管理系统 - 学生列表页

import React, { useMemo, useState } from 'react';
import {
  Table, Card, Input, Select, Space, Tag, Button, Badge, Row, Col, Typography,
  Switch, Modal, Form, message,
} from 'antd';
import { SearchOutlined, FilterOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useStudents, useBulkAssignTeacher } from '../../api/students.api';
import { useUsers } from '../../api/users.api';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../api/client';

const { Text } = Typography;

const RISK_TAG_COLORS: Record<string, string> = {
  pace_risk: 'red', attitude_issue: 'orange',
  inno_gap: 'purple', preparation_weak: 'gold', exam_repeat: 'volcano',
};
const RISK_TAG_LABELS: Record<string, string> = {
  pace_risk: '节奏风险', attitude_issue: '态度问题',
  inno_gap: '内诺差距', preparation_weak: '备考薄弱', exam_repeat: '重考生',
};

const STAGE_LABELS: Record<string, string> = {
  summer: '夏季考', winter: '冬季考', spring: '春季考',
};

const StudentList: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<string | undefined>();
  const [seasonFilter, setSeasonFilter] = useState<string | undefined>();
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [messageApi, ctxHolder] = message.useMessage();
  const [assignForm] = Form.useForm<{ teacherId: string; changeReason?: string }>();

  const { user } = useAuthStore();
  const canBulkAssign =
    !!user?.roles?.includes('admin_total') || !!user?.roles?.includes('subject_head');

  const { data, isLoading } = useStudents({
    search: search || undefined,
    riskTagCode: riskFilter,
    targetSeason: seasonFilter,
    unassigned: unassignedOnly ? 'true' : undefined,
    page,
    pageSize: 20,
  });

  // 老师列表(用于批量分配下拉),只在打开 modal 时按需取
  const { data: teachersData } = useUsers(
    assignModalOpen ? { roleCode: 'teacher', pageSize: 200 } : undefined,
  );
  const teacherOptions = useMemo(
    () =>
      (teachersData?.data ?? []).map((t) => ({
        value: t.id,
        label: `${t.name}${t.phone ? ` (${t.phone})` : ''}`,
      })),
    [teachersData?.data],
  );

  const bulkAssign = useBulkAssignTeacher();

  const students = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleBulkAssignSubmit = async () => {
    try {
      const values = await assignForm.validateFields();
      const res = await bulkAssign.mutateAsync({
        studentIds: selectedIds,
        teacherId: values.teacherId,
        changeReason: values.changeReason,
      });
      messageApi.success(res.message ?? '分配成功');
      setSelectedIds([]);
      setAssignModalOpen(false);
      assignForm.resetFields();
    } catch (e) {
      // antd Form 校验失败也会走这里,过滤掉
      if ((e as { errorFields?: unknown })?.errorFields) return;
      messageApi.error(getErrorMessage(e, '分配失败,请重试'));
    }
  };

  const columns = [
    {
      title: '姓名',
      dataIndex: ['user', 'name'],
      render: (name: string, r: any) => (
        <a onClick={(e) => { e.stopPropagation(); navigate(`/teacher/students/${r.id}`); }}>
          <Text strong>{name}</Text>
        </a>
      ),
    },
    { title: '手机', dataIndex: ['user', 'phone'], render: (v: string) => v ?? '-' },
    {
      title: '班主任',
      dataIndex: 'teachers',
      render: (teachers: any[]) => {
        const t = teachers?.[0]?.teacher;
        if (!t) return <Tag color="orange">未分配</Tag>;
        return <Text>{t.name}</Text>;
      },
    },
    {
      title: '目标考季',
      dataIndex: 'targetSeason',
      render: (v: string) => v ? (
        <Tag color={v === 'summer' ? 'orange' : 'blue'}>{STAGE_LABELS[v] ?? v}</Tag>
      ) : '-',
    },
    { title: '目标年', dataIndex: 'targetYear', render: (v: string) => v ?? '-' },
    {
      title: '风险标签',
      dataIndex: 'riskTags',
      render: (tags: any[]) => (
        <Space size="small" wrap>
          {tags?.filter(t => !t.removedAt).map(t => (
            <Tag key={t.tag.code} color={RISK_TAG_COLORS[t.tag.code] ?? 'default'} style={{ fontSize: 11 }}>
              {RISK_TAG_LABELS[t.tag.code] ?? t.tag.code}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '规划状态',
      dataIndex: 'periodPlans',
      render: (plans: any[]) => {
        const latest = plans?.[0];
        if (!latest) return <Badge status="default" text="未制定" />;
        const map: Record<string, { status: any; text: string }> = {
          draft: { status: 'default', text: '草稿' },
          pending: { status: 'processing', text: '待确认' },
          change_pending: { status: 'warning', text: '变更待确认' },
          active: { status: 'success', text: '执行中' },
          completed: { status: 'success', text: '已完成' },
          cancelled: { status: 'error', text: '已取消' },
        };
        const info = map[latest.status] ?? { status: 'default', text: latest.status };
        return <Badge status={info.status} text={info.text} />;
      },
    },
    {
      title: '操作',
      render: (_: any, r: any) => (
        <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); navigate(`/teacher/students/${r.id}`); }}>
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <>
      {ctxHolder}
      <Card
        title={
          <Space>
            <span>学生管理</span>
            {unassignedOnly && <Tag color="orange">仅未分配班主任</Tag>}
          </Space>
        }
        extra={
          <Row gutter={8} align="middle">
            <Col>
              <Input
                placeholder="搜索姓名"
                prefix={<SearchOutlined />}
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                allowClear
                style={{ width: 160 }}
              />
            </Col>
            <Col>
              <Select
                placeholder="考试季筛选"
                value={seasonFilter}
                onChange={v => { setSeasonFilter(v); setPage(1); }}
                allowClear
                style={{ width: 130 }}
                options={[
                  { value: 'summer', label: '夏季考' },
                  { value: 'winter', label: '冬季考' },
                ]}
              />
            </Col>
            <Col>
              <Select
                placeholder={<><FilterOutlined /> 风险标签</>}
                value={riskFilter}
                onChange={v => { setRiskFilter(v); setPage(1); }}
                allowClear
                style={{ width: 140 }}
                options={Object.entries(RISK_TAG_LABELS).map(([k, v]) => ({ value: k, label: v }))}
              />
            </Col>
            {canBulkAssign && (
              <Col>
                <Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>未分配</Text>
                  <Switch
                    size="small"
                    checked={unassignedOnly}
                    onChange={(v) => { setUnassignedOnly(v); setPage(1); setSelectedIds([]); }}
                  />
                </Space>
              </Col>
            )}
          </Row>
        }
      >
        {canBulkAssign && selectedIds.length > 0 && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f0f5ff', borderRadius: 6 }}>
            <Space>
              <Text>已选中 <Text strong>{selectedIds.length}</Text> 名学生</Text>
              <Button
                type="primary"
                icon={<TeamOutlined />}
                onClick={() => setAssignModalOpen(true)}
              >
                批量分配班主任
              </Button>
              <Button onClick={() => setSelectedIds([])}>清除选择</Button>
            </Space>
          </div>
        )}
        <Table
          dataSource={students}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          rowSelection={canBulkAssign ? {
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys as string[]),
            preserveSelectedRowKeys: true,
          } : undefined}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            showTotal: (t) => `共 ${t} 名学生`,
            onChange: setPage,
          }}
          onRow={(r) => ({ onClick: () => navigate(`/teacher/students/${r.id}`), style: { cursor: 'pointer' } })}
          size="middle"
          locale={{ emptyText: '暂无学生数据' }}
        />
      </Card>

      <Modal
        title={`批量分配班主任 (${selectedIds.length} 名学生)`}
        open={assignModalOpen}
        onCancel={() => { setAssignModalOpen(false); assignForm.resetFields(); }}
        onOk={handleBulkAssignSubmit}
        okText="确认分配"
        confirmLoading={bulkAssign.isPending}
        destroyOnClose
      >
        <Form form={assignForm} layout="vertical">
          <Form.Item
            label="新班主任"
            name="teacherId"
            rules={[{ required: true, message: '请选择班主任' }]}
          >
            <Select
              placeholder="选择一位班主任"
              options={teacherOptions}
              showSearch
              filterOption={(input, opt) =>
                (opt?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item label="变更原因(可选)" name="changeReason">
            <Input.TextArea rows={2} placeholder="例:原班主任休假;为保持学科一致性…" maxLength={200} showCount />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            已有班主任的学生将关闭原关系并建立新关系,旧班主任此前留下的辅导记录会被保留并可查阅。
          </Text>
        </Form>
      </Modal>
    </>
  );
};

export default StudentList;
