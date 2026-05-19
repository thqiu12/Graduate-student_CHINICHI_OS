// src/components/FileVersionsWithFeedback/index.tsx
// 文书版本列表 + 老师批注反馈。供学生 Files 页与老师 StudentDetail 共用。

import React, { useState } from 'react';
import {
  Collapse, List, Tag, Space, Typography, Button, Input, Tooltip,
  Popconfirm, message,
} from 'antd';
import {
  DownloadOutlined, MessageOutlined, CheckOutlined, DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient, { getErrorMessage } from '../../api/client';

const { Text, Paragraph } = Typography;

export interface FileFeedbackItem {
  id: string;
  content: string;
  status: 'pending' | 'resolved';
  createdAt: string;
  resolvedAt?: string | null;
  author: { id: string; name: string };
  resolvedByUser?: { id: string; name: string } | null;
}

export interface FileVersionItem {
  id: string;
  versionNo: number;
  size: number;
  mimeType?: string | null;
  createdAt: string;
  notes?: string | null;
  uploader: { id: string; name: string };
  feedbacks: FileFeedbackItem[];
}

export interface FileWithVersions {
  id: string;
  fileName: string;
  fileType: string;
  createdAt: string;
  description?: string;
  uploader?: { name: string };
  versions: FileVersionItem[];
  pendingFeedbackCount?: number;
}

interface Props {
  studentId: string;
  file: FileWithVersions;
  /** 当前用户能否新增批注（老师/学科负责人/教务） */
  canCreateFeedback: boolean;
  /** 当前用户 id —— 判断"自己写的批注可以删" */
  currentUserId: string;
  /** 数据变更后通知父组件刷新 */
  onChanged: () => void;
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

const FileVersionsWithFeedback: React.FC<Props> = ({
  studentId, file, canCreateFeedback, currentUserId, onChanged,
}) => {
  const [messageApi, ctxHolder] = message.useMessage();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [submittingVer, setSubmittingVer] = useState<string | null>(null);
  const [busyFeedback, setBusyFeedback] = useState<string | null>(null);

  const handleDownload = async (version: FileVersionItem) => {
    try {
      const res = await apiClient.get(
        `/students/${studentId}/files/${file.id}/versions/${version.id}/download`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      messageApi.error(getErrorMessage(e, '下载失败'));
    }
  };

  const handleSubmitFeedback = async (versionId: string) => {
    const content = (drafts[versionId] ?? '').trim();
    if (!content) {
      messageApi.warning('请输入批注内容');
      return;
    }
    setSubmittingVer(versionId);
    try {
      await apiClient.post(
        `/students/${studentId}/files/${file.id}/versions/${versionId}/feedback`,
        { content },
      );
      messageApi.success('批注已发送');
      setDrafts((prev) => ({ ...prev, [versionId]: '' }));
      onChanged();
    } catch (e) {
      messageApi.error(getErrorMessage(e, '提交失败'));
    } finally {
      setSubmittingVer(null);
    }
  };

  const handleResolve = async (feedbackId: string) => {
    setBusyFeedback(feedbackId);
    try {
      await apiClient.patch(
        `/students/${studentId}/files/${file.id}/feedback/${feedbackId}/resolve`,
      );
      messageApi.success('已标记为已处理');
      onChanged();
    } catch (e) {
      messageApi.error(getErrorMessage(e, '操作失败'));
    } finally {
      setBusyFeedback(null);
    }
  };

  const handleDeleteFeedback = async (feedbackId: string) => {
    setBusyFeedback(feedbackId);
    try {
      await apiClient.delete(
        `/students/${studentId}/files/${file.id}/feedback/${feedbackId}`,
      );
      messageApi.success('批注已删除');
      onChanged();
    } catch (e) {
      messageApi.error(getErrorMessage(e, '删除失败'));
    } finally {
      setBusyFeedback(null);
    }
  };

  const versionItems = file.versions.map((version) => {
    const pendingCount = version.feedbacks.filter((f) => f.status === 'pending').length;
    return {
      key: version.id,
      label: (
        <Space size={8} wrap>
          <Tag color="blue">第 {version.versionNo} 版</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {version.uploader?.name ?? '—'} · {dayjs(version.createdAt).format('YYYY-MM-DD HH:mm')}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{formatSize(version.size)}</Text>
          {pendingCount > 0 && (
            <Tag color="orange">待处理批注 {pendingCount}</Tag>
          )}
          {version.feedbacks.length > 0 && pendingCount === 0 && (
            <Tag color="green">全部已处理</Tag>
          )}
        </Space>
      ),
      children: (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {version.notes && (
            <div style={{ background: '#fafafa', padding: '8px 12px', borderRadius: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>本次修改说明:</Text>
              <Paragraph style={{ margin: 0, marginTop: 4 }}>{version.notes}</Paragraph>
            </div>
          )}

          <Button
            icon={<DownloadOutlined />}
            size="small"
            onClick={() => handleDownload(version)}
          >
            下载该版本
          </Button>

          {/* 批注列表 */}
          {version.feedbacks.length > 0 && (
            <List
              size="small"
              header={<Text strong style={{ fontSize: 13 }}>批注与反馈</Text>}
              dataSource={version.feedbacks}
              renderItem={(fb) => (
                <List.Item
                  actions={[
                    fb.status === 'pending' ? (
                      <Button
                        key="resolve"
                        type="link"
                        size="small"
                        icon={<CheckOutlined />}
                        loading={busyFeedback === fb.id}
                        onClick={() => handleResolve(fb.id)}
                      >
                        标记已处理
                      </Button>
                    ) : null,
                    fb.status === 'pending' && fb.author.id === currentUserId ? (
                      <Popconfirm
                        key="del"
                        title="删除此批注?"
                        onConfirm={() => handleDeleteFeedback(fb.id)}
                        okText="删除"
                        cancelText="取消"
                      >
                        <Button
                          type="link"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          loading={busyFeedback === fb.id}
                        >
                          删除
                        </Button>
                      </Popconfirm>
                    ) : null,
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    avatar={<MessageOutlined style={{ color: fb.status === 'pending' ? '#fa8c16' : '#52c41a', fontSize: 16 }} />}
                    title={
                      <Space size={8}>
                        <Text strong style={{ fontSize: 13 }}>{fb.author.name}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(fb.createdAt).format('MM-DD HH:mm')}
                        </Text>
                        {fb.status === 'resolved' ? (
                          <Tooltip
                            title={fb.resolvedByUser ? `${fb.resolvedByUser.name} 于 ${dayjs(fb.resolvedAt).format('MM-DD HH:mm')} 处理` : ''}
                          >
                            <Tag color="green">已处理</Tag>
                          </Tooltip>
                        ) : (
                          <Tag color="orange">待处理</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{fb.content}</Paragraph>
                    }
                  />
                </List.Item>
              )}
            />
          )}

          {/* 新增批注(仅老师/学科负责人/教务) */}
          {canCreateFeedback && (
            <div style={{ borderTop: '1px dashed #eee', paddingTop: 12 }}>
              <Input.TextArea
                rows={2}
                placeholder="对该版本写批注/反馈,学生会收到通知..."
                value={drafts[version.id] ?? ''}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [version.id]: e.target.value }))}
                maxLength={2000}
                showCount
              />
              <div style={{ textAlign: 'right', marginTop: 8 }}>
                <Button
                  type="primary"
                  size="small"
                  loading={submittingVer === version.id}
                  onClick={() => handleSubmitFeedback(version.id)}
                >
                  提交批注
                </Button>
              </div>
            </div>
          )}
        </Space>
      ),
    };
  });

  return (
    <>
      {ctxHolder}
      <Collapse
        size="small"
        items={versionItems}
        defaultActiveKey={file.versions[0] ? [file.versions[0].id] : []}
      />
    </>
  );
};

export default FileVersionsWithFeedback;
