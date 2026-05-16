// src/pages/teacher/StudentList.tsx
// 知日塾大学院考学进度管理系统 - 学生列表页

import React, { useState } from 'react';
import {
  Table, Card, Input, Select, Space, Tag, Button, Badge, Row, Col, Typography,
} from 'antd';
import { SearchOutlined, FilterOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useStudents } from '../../api/students.api';

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
  const [page, setPage] = useState(1);

  const { data, isLoading } = useStudents({
    search: search || undefined,
    riskTagCode: riskFilter,
    targetSeason: seasonFilter,
    page,
    pageSize: 20,
  });

  const students = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns = [
    {
      title: '姓名',
      dataIndex: ['user', 'name'],
      render: (name: string, r: any) => (
        <a onClick={() => navigate(`/teacher/students/${r.id}`)}>
          <Text strong>{name}</Text>
        </a>
      ),
    },
    { title: '手机', dataIndex: ['user', 'phone'], render: (v: string) => v ?? '-' },
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
      title: 'JLPT',
      dataIndex: 'jlptLevel',
      render: (v: string, r: any) => v ? `${v}${r.jlptScore ? `(${r.jlptScore})` : ''}` : '-',
    },
    {
      title: '操作',
      render: (_: any, r: any) => (
        <Button type="link" size="small" onClick={() => navigate(`/teacher/students/${r.id}`)}>
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <Card
      title="学生管理"
      extra={
        <Row gutter={8}>
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
        </Row>
      }
    >
      <Table
        dataSource={students}
        columns={columns}
        rowKey="id"
        loading={isLoading}
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
  );
};

export default StudentList;
