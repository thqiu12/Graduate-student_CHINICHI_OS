// src/pages/student/Files.tsx
// 知日塾大学院考学进度管理系统 - 学生我的文件页
// 展示上传文件列表（按研究计划书/其他分类）+ 上传入口

import React, { useState } from 'react';
import {
  Card, Typography, Empty, Spin, Tag, Space, Button, Upload, message,
  List, Divider,
} from 'antd';
import {
  UploadOutlined, FileTextOutlined, FilePdfOutlined, FileOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/auth.store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import type { UploadChangeInfo } from 'antd/es/upload';

const { Title, Text } = Typography;

// ─── 类型 ─────────────────────────────────────────────────
interface FileVersion {
  id: string;
  versionNo: number;
  ossKey: string;
  size: number;
  createdAt: string;
}
interface StudentFile {
  id: string;
  fileName: string;
  fileType: string;
  description?: string;
  createdAt: string;
  uploader?: { name: string };
  versions: FileVersion[];
}
interface FilesResponse {
  data: Record<string, StudentFile[]>;
  typeNames: Record<string, string>;
}

// ─── 文件图标 ─────────────────────────────────────────────
const FileIcon: React.FC<{ name: string }> = ({ name }) => {
  if (name.endsWith('.pdf')) return <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />;
  if (name.match(/\.(doc|docx)$/)) return <FileTextOutlined style={{ color: '#1677ff', fontSize: 20 }} />;
  return <FileOutlined style={{ color: '#8c8c8c', fontSize: 20 }} />;
};

// ─── 文件大小格式化 ────────────────────────────────────────
function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// ─── 主页面 ───────────────────────────────────────────────
const FilesPage: React.FC = () => {
  const { user } = useAuthStore();
  const studentId = user?.studentId ?? user?.id ?? '';
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const { data, isLoading } = useQuery<FilesResponse>({
    queryKey: ['student-files', studentId],
    queryFn: async () => {
      const res = await apiClient.get(`/students/${studentId}/files`);
      return res.data as FilesResponse;
    },
    enabled: !!studentId,
  });

  const handleUpload = async (info: UploadChangeInfo) => {
    const { status, response } = info.file;
    if (status === 'uploading') { setUploading(true); return; }
    setUploading(false);
    if (status === 'done') {
      messageApi.success(`${info.file.name} 上传成功`);
      queryClient.invalidateQueries({ queryKey: ['student-files', studentId] });
    } else if (status === 'error') {
      const errMsg = response?.message ?? '上传失败，请重试';
      messageApi.error(errMsg);
    }
  };

  const token = localStorage.getItem('chinichi_access_token') ?? '';

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
          <Upload
            action={`/api/students/${studentId}/files`}
            headers={{ Authorization: `Bearer ${token}` }}
            data={{ fileType: 'research_plan', description: '' }}
            showUploadList={false}
            onChange={handleUpload}
            accept=".pdf,.doc,.docx,.txt,.zip,.png,.jpg"
          >
            <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
              上传文件
            </Button>
          </Upload>
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
                    renderItem={(file: StudentFile) => {
                      const latestVer = file.versions?.[0];
                      return (
                        <List.Item style={{ padding: '10px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                            <FileIcon name={file.fileName} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <Text strong style={{ fontSize: 14 }}>{file.fileName}</Text>
                                {isResearch && latestVer && (
                                  <Tag color="pink">第{latestVer.versionNo}稿</Tag>
                                )}
                              </div>
                              <Space size={12}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {new Date(file.createdAt).toLocaleDateString('zh-CN')}
                                </Text>
                                {latestVer && (
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    {formatSize(latestVer.size)}
                                  </Text>
                                )}
                                {file.uploader && (
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    上传者：{file.uploader.name}
                                  </Text>
                                )}
                              </Space>
                            </div>
                          </div>
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
