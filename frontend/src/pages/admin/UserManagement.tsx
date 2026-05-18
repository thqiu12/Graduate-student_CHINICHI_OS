// src/pages/admin/UserManagement.tsx
// 知日塾大学院考学进度管理系统 - 账号管理页面

import React, { useState } from 'react';
import {
  Table, Button, Space, Tag, Input, Select, Modal, Form,
  Popconfirm, message, Typography, Card, Row, Col, Upload, Alert,
} from 'antd';
import {
  PlusOutlined, EditOutlined, StopOutlined, CheckOutlined,
  SearchOutlined, UserAddOutlined, UploadOutlined,
} from '@ant-design/icons';
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useSetUserActive,
  useImportStudents,
  useCampuses,
  useSubjects,
  type UserItem,
  type CreateUserBody,
  type UpdateUserBody,
} from '../../api/users.api';
import { getErrorMessage } from '../../api/client';

const { Title } = Typography;

// ─── 角色选项 ─────────────────────────────────────────────

const ROLE_OPTIONS = [
  { label: '教务总负责人', value: 'admin_total' },
  { label: '学科负责人', value: 'subject_head' },
  { label: '班主任', value: 'teacher' },
  { label: '学生', value: 'student' },
];

const ROLE_COLOR_MAP: Record<string, string> = {
  admin_total: 'red',
  subject_head: 'purple',
  teacher: 'blue',
  student: 'green',
};

const ROLE_LABEL_MAP: Record<string, string> = {
  admin_total: '教务总负责人',
  subject_head: '学科负责人',
  teacher: '班主任',
  student: '学生',
};

// ─── 主组件 ───────────────────────────────────────────────

const UserManagementPage: React.FC = () => {
  const [messageApi, ctxHolder] = message.useMessage();

  // 筛选状态
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterRole, setFilterRole] = useState<string | undefined>(undefined);
  const [filterKeyword, setFilterKeyword] = useState<string>('');
  const [keyword, setKeyword] = useState<string>('');

  // Modal 状态
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<Array<{ rowNumber: number; message: string }>>([]);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [createForm] = Form.useForm<CreateUserBody>();
  const [editForm] = Form.useForm<UpdateUserBody>();

  // API Hooks
  const { data, isLoading, isFetching } = useUsers({
    page,
    pageSize,
    role: filterRole,
    keyword: filterKeyword || undefined,
  });
  const { data: campuses } = useCampuses();
  const { data: subjects } = useSubjects();

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const setActiveMutation = useSetUserActive();
  const importStudentsMutation = useImportStudents();

  // ─── 操作处理 ─────────────────────────────────────────

  const handleSearch = () => {
    setFilterKeyword(keyword);
    setPage(1);
  };

  const handleRoleFilter = (value: string | undefined) => {
    setFilterRole(value);
    setPage(1);
  };

  const handleCreate = async (values: CreateUserBody) => {
    try {
      await createMutation.mutateAsync(values);
      messageApi.success('用户创建成功');
      setCreateModalOpen(false);
      createForm.resetFields();
    } catch (e) {
      messageApi.error(getErrorMessage(e, '创建失败，请重试'));
    }
  };

  const handleEdit = async (values: UpdateUserBody) => {
    if (!editingUser) return;
    try {
      const body: { id: string } & UpdateUserBody = { id: editingUser.id, ...values };
      // 密码为空则不传
      if (!body.password) delete body.password;
      await updateMutation.mutateAsync(body);
      messageApi.success('用户信息已更新');
      setEditModalOpen(false);
      setEditingUser(null);
      editForm.resetFields();
    } catch (e) {
      messageApi.error(getErrorMessage(e, '更新失败，请重试'));
    }
  };

  const handleToggleDisable = async (user: UserItem) => {
    try {
      await setActiveMutation.mutateAsync({
        id: user.id,
        isActive: user.status !== 'active',
      });
      messageApi.success(user.status === 'active' ? '用户已禁用' : '用户已启用');
    } catch (e) {
      messageApi.error(getErrorMessage(e, '操作失败，请重试'));
    }
  };

  const handleImport = async (file: File) => {
    setImportErrors([]);
    try {
      const result = await importStudentsMutation.mutateAsync(file);
      messageApi.success(result.message ?? '导入成功');
      setImportModalOpen(false);
    } catch (e: unknown) {
      const response = (e as { response?: { data?: { errors?: Array<{ rowNumber: number; message: string }> } } }).response;
      setImportErrors(response?.data?.errors ?? []);
      messageApi.error(getErrorMessage(e, '导入失败，请检查文件'));
    }
    return false;
  };

  const openEditModal = (user: UserItem) => {
    setEditingUser(user);
    editForm.setFieldsValue({
      name: user.name,
      phone: user.phone ?? '',
      roleCode: user.roles?.[0],
      campusId: user.campusId ?? undefined,
      subjectId: user.subjectId ?? undefined,
    });
    setEditModalOpen(true);
  };

  // ─── 表格列定义 ───────────────────────────────────────

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      render: (v: string | null) => v ?? '-',
    },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      render: (roles: string[]) =>
        roles?.map((r) => (
          <Tag key={r} color={ROLE_COLOR_MAP[r] ?? 'default'}>
            {ROLE_LABEL_MAP[r] ?? r}
          </Tag>
        )),
    },
    {
      title: '校区',
      dataIndex: 'campusId',
      key: 'campusId',
      render: (id: number | null) => {
        if (!id) return '-';
        const campus = campuses?.find((c) => c.id === id);
        return campus?.name ?? `校区${id}`;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) =>
        v === 'active' ? (
          <Tag color="success">正常</Tag>
        ) : (
          <Tag color="error">已禁用</Tag>
        ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: UserItem) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title={record.status === 'active' ? '确定要禁用此用户？' : '确定要启用此用户？'}
            onConfirm={() => handleToggleDisable(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger={record.status === 'active'}
              icon={record.status === 'active' ? <StopOutlined /> : <CheckOutlined />}
            >
              {record.status === 'active' ? '禁用' : '启用'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ─── 公共 Modal 表单字段（新建/编辑复用） ───────────────

  const renderFormFields = (isEdit = false) => (
    <>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="phone"
            label="手机号"
            rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1\d{10}$/, message: '手机号格式不正确' },
            ]}
          >
            <Input placeholder="请输入手机号" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="password"
            label={isEdit ? '新密码（留空则不修改）' : '密码'}
            rules={isEdit ? [] : [{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder={isEdit ? '留空则不修改' : '请输入密码'} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="roleCode"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="选择角色" options={ROLE_OPTIONS} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="campusId" label="校区（可选）">
            <Select
              allowClear
              placeholder="选择校区"
              options={campuses?.map((c) => ({ value: c.id, label: c.name })) ?? []}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="subjectId" label="学科（可选）">
            <Select
              allowClear
              placeholder="选择学科"
              options={subjects?.map((s) => ({ value: s.id, label: s.name })) ?? []}
            />
          </Form.Item>
        </Col>
      </Row>
    </>
  );

  // ─── 渲染 ─────────────────────────────────────────────

  return (
    <>
      {ctxHolder}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            <UserAddOutlined style={{ marginRight: 8 }} />
            账号管理
          </Title>
          <Space>
            <Button icon={<UploadOutlined />} onClick={() => setImportModalOpen(true)}>
              导入学生CSV
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalOpen(true)}
            >
              新建用户
            </Button>
          </Space>
        </div>

        {/* 筛选栏 */}
        <Card style={{ marginBottom: 16 }}>
          <Space wrap>
            <Select
              allowClear
              placeholder="筛选角色"
              style={{ width: 160 }}
              options={ROLE_OPTIONS}
              value={filterRole}
              onChange={handleRoleFilter}
            />
            <Input
              placeholder="搜索姓名或手机号"
              style={{ width: 220 }}
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              搜索
            </Button>
            <Button
              onClick={() => {
                setKeyword('');
                setFilterKeyword('');
                setFilterRole(undefined);
                setPage(1);
              }}
            >
              重置
            </Button>
          </Space>
        </Card>

        {/* 用户列表表格 */}
        <Table
          dataSource={data?.data ?? []}
          columns={columns}
          rowKey="id"
          loading={isLoading || isFetching}
          pagination={{
            current: page,
            pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          locale={{ emptyText: '暂无用户数据' }}
        />

        {/* 新建用户 Modal */}
        <Modal
          title="新建用户"
          open={createModalOpen}
          onCancel={() => {
            setCreateModalOpen(false);
            createForm.resetFields();
          }}
          onOk={() => createForm.submit()}
          confirmLoading={createMutation.isPending}
          okText="创建"
          cancelText="取消"
          width={600}
          destroyOnClose
        >
          <Form
            form={createForm}
            layout="vertical"
            onFinish={handleCreate}
            style={{ marginTop: 16 }}
          >
            {renderFormFields(false)}
          </Form>
        </Modal>

        {/* 编辑用户 Modal */}
        <Modal
          title="编辑用户"
          open={editModalOpen}
          onCancel={() => {
            setEditModalOpen(false);
            setEditingUser(null);
            editForm.resetFields();
          }}
          onOk={() => editForm.submit()}
          confirmLoading={updateMutation.isPending}
          okText="保存"
          cancelText="取消"
          width={600}
          destroyOnClose
        >
          <Form
            form={editForm}
            layout="vertical"
            onFinish={handleEdit}
            style={{ marginTop: 16 }}
          >
            {renderFormFields(true)}
          </Form>
        </Modal>

        <Modal
          title="导入学生CSV"
          open={importModalOpen}
          onCancel={() => {
            setImportModalOpen(false);
            setImportErrors([]);
          }}
          footer={null}
          destroyOnClose
        >
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Alert
              type="info"
              showIcon
              message="CSV 表头需包含 name/姓名、phone/手机号、campusId/校区ID、subjectId/学科ID、teacherId/班主任ID、entryDate/入学日期"
            />
            <Upload.Dragger
              accept=".csv,text/csv"
              maxCount={1}
              beforeUpload={(file) => handleImport(file)}
              showUploadList={false}
              disabled={importStudentsMutation.isPending}
            >
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">点击或拖拽 CSV 文件到此处上传</p>
            </Upload.Dragger>
            {importErrors.length > 0 && (
              <Alert
                type="error"
                showIcon
                message="导入数据存在错误"
                description={
                  <div>
                    {importErrors.slice(0, 8).map((err) => (
                      <div key={`${err.rowNumber}-${err.message}`}>第 {err.rowNumber} 行：{err.message}</div>
                    ))}
                    {importErrors.length > 8 && <div>还有 {importErrors.length - 8} 条错误未显示</div>}
                  </div>
                }
              />
            )}
          </Space>
        </Modal>
      </div>
    </>
  );
};

export default UserManagementPage;
