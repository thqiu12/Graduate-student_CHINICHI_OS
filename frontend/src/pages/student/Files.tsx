// src/pages/student/Files.tsx
// 知日塾大学院考学进度管理系统 - 学生我的文件页
// 展示上传文件列表（按研究计划书/其他分类）+ 上传入口

import React, { useState } from 'react';
import {
  Card, Typography, Empty, Spin, Tag, Space, Button, Upload, message,
  List, Divider, Popconfirm, Select, Input, Badge,
} from 'antd';
import {
  DeleteOutlined, UploadOutlined, FileTextOutlined, FilePdfOutlined, FileOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/auth.store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { getErrorMessage, tokenStorage } from '../../api/client';
import type { UploadFile } from 'antd';
import FileVersionsWithFeedback, { type FileWithVersions } from '../../components/FileVersionsWithFeedback';

interface UploadChangeInfo {
  file: UploadFile & { response?: { message?: string } };
  fileList: UploadFile[];
}

const { Title, Text } = Typography;

const FILE_TYPE_OPTIONS = [
  { value: 'research_plan', label: '研究计划书' },
  { value: 'transcript', label: '成绩单' },
  { value: 'recommendation', label: '推荐信' },
  { value: 'language_score', label: '语言成绩证明' },
  { value: 'certificate', label: '证明文件' },
];

interface FilesResponse {
  data: Record<string, FileWithVersions[]>;
  typeNames: Record<string, string>;
}

// ─── 文件图标 ─────────────────────────────────────────────
const FileIcon: React.FC<{ name: string }> = ({ name }) => {
  if (name.endsWith('.pdf')) return <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />;
  if (name.match(/\.(doc|docx)$/)) return <FileTextOutlined style={{ color: '#1677ff', fontSize: 20 }} />;
  return <FileOutlined style={{ color: '#8c8c8c', fontSize: 20 }} />;
};

// ─── 主页面 ───────────────────────────────────────────────
const FilesPage: React.FC = () => {
  const { user } = useAuthStore();
  const studentId = user?.studentId ?? user?.id ?? '';
  const userId = user?.id ?? '';
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadFileType, setUploadFileType] = useState('research_plan');
  const [uploadDescription, setUploadDescription] = useState('');
  const [messageApi, contextHolder] = message.useMessage();

  const { data, isLoading } = useQuery<FilesResponse>({
    queryKey: ['student-files', studentId],
    queryFn: async () => {
      const res = await apiClient.get(`/students/${studentId}/files`);
      return res.data as FilesResponse;
    },
    enabled: !!studentId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['student-files', studentId] });

  const handleUpload = async (info: UploadChangeInfo) => {
    const { status, response } = info.file;
    if (status === 'uploading') { setUploading(true); return; }
    setUploading(false);
    if (status === 'done') {
      messageApi.success(`${info.file.name} 上传成功`);
      setUploadDescription('');
      refresh();
    } else if (status === 'error') {
      const errMsg = response?.message ?? '上传失败，请重试';
      messageApi.error(errMsg);
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

  const token = tokenStorage.getToken() ?? '';

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin size="large" tip="加载文件中..." />
      </div>
    );
  }

  const groups = data?.data ?? {};
  const typeNames = data?.typeNames ?? {};
  const totalCount = Object.values(groups).reduce((s, arr) => s + arr.length, 0);

  return (
    <>
      {contextHolder}
      <div style={{ padding: '16px 16px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>我的文件</Title>
          <Space wrap>
            <Select
              value={uploadFileType}
              onChange={setUploadFileType}
              options={FILE_TYPE_OPTIONS}
              style={{ width: 150 }}
            />
            <Input
              value={uploadDescription}
              onChange={(event) => setUploadDescription(event.target.value)}
              placeholder="文件名/备注"
              allowClear
              style={{ width: 180 }}
            />
            <Upload
              action={`/api/students/${studentId}/files`}
              headers={{ Authorization: `Bearer ${token}` }}
              data={{ fileType: uploadFileType, description: uploadDescription }}
              showUploadList={false}
              onChange={handleUpload}
              accept=".pdf,.doc,.docx,.txt,.zip,.png,.jpg"
            >
              <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
                上传文件
              </Button>
            </Upload>
          </Space>
        </div>

        {totalCount === 0 ? (
          <Card style={{ borderRadius: 12, textAlign: 'center', padding: 40 }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: 15 }}>还没有上传任何文件</Text>
                  <Text type="secondary" style={{ fontSize: 13 }}>点击右上角「上传文件」开始</Text>
                </Space>
              }
            />
          </Card>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {Object.entries(groups).map(([type, files]) => {
              if (files.length === 0) return null;
              const typeName = typeNames[type] ?? type;
              const isResearch = type === 'research_plan';
              return (
                <Card
                  key={type}
                  style={{
                    borderRadius: 12,
                    borderLeft: `3px solid ${isResearch ? '#eb2f96' : '#1677ff'}`,
                  }}
                  bodyStyle={{ padding: '12px 16px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Text strong style={{ color: isResearch ? '#eb2f96' : '#1677ff', fontSize: 15 }}>
                      {typeName}
                    </Text>
                    <Tag color={isResearch ? 'pink' : 'blue'}>{files.length}个文件</Tag>
                  </div>
                  <Divider style={{ margin: '0 0 8px' }} />
                  <List
                    dataSource={files}
                    renderItem={(file: FileWithVersions) => {
                      const latestVer = file.versions?.[0];
                      return (
                        <List.Item style={{ padding: '12px 0', display: 'block' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                            <FileIcon name={file.fileName} />
                            <div style={{ flex: 1 }}>
                              <Space size={8} wrap>
                                <Text strong style={{ fontSize: 14 }}>{file.fileName}</Text>
                                {isResearch && latestVer && (
                                  <Tag color="pink">第{latestVer.versionNo}稿</Tag>
                                )}
                                {(file.pendingFeedbackCount ?? 0) > 0 && (
                                  <Badge
                                    count={file.pendingFeedbackCount}
                                    style={{ backgroundColor: '#fa8c16' }}
                                    title="待处理批注"
                                  />
                                )}
                              </Space>
                              <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  共 {file.versions.length} 个版本 · 最近{new Date(file.createdAt).toLocaleDateString('zh-CN')}
                                </Text>
                              </div>
                            </div>
                            <Popconfirm
                              title="确定删除此文件？"
                              description="删除后所有版本、批注都会移除。"
                              onConfirm={() => handleDelete(file)}
                              okText="删除"
                              cancelText="取消"
                            >
                              <Button danger icon={<DeleteOutlined />} size="small" />
                            </Popconfirm>
                          </div>

                          {/* 版本+批注展开列表 */}
                          <FileVersionsWithFeedback
                            studentId={studentId}
                            file={file}
                            canCreateFeedback={false}
                            currentUserId={userId}
                            onChanged={refresh}
                          />
                        </List.Item>
                      );
                    }}
                  />
                </Card>
              );
            })}
          </Space>
        )}
      </div>
    </>
  );
};

export default FilesPage;
