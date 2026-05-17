// src/pages/shared/CalendarView.tsx
// 知日塾大学院考学进度管理系统 - 日历视图（班主任/教务总负责人）
// 功能：使用 antd Calendar 展示彩色事件点，点击某天弹出 Drawer 显示详情

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Badge,
  Drawer,
  List,
  Tag,
  Typography,
  Spin,
  Alert,
  DatePicker,
  Space,
  Card,
} from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';

const { Title, Text } = Typography;

// ─── 事件类型定义 ─────────────────────────────────────────

type EventType = 'task_due' | 'school_apply' | 'exam' | 'plan_end';

interface CalendarEvent {
  date: string;
  type: EventType;
  studentName: string;
  title: string;
  detail: string;
}

// 事件颜色映射
const EVENT_COLOR: Record<EventType, string> = {
  task_due: 'red',
  school_apply: 'gold',
  exam: 'green',
  plan_end: 'blue',
};

// 事件类型标签
const EVENT_LABEL: Record<EventType, string> = {
  task_due: '任务截止',
  school_apply: '出愿截止',
  exam: '考试日期',
  plan_end: '阶段结束',
};

// ─── API Hook ─────────────────────────────────────────────

function useCalendarEvents(start: string, end: string) {
  return useQuery<{ data: CalendarEvent[] }>({
    queryKey: ['calendar-events', start, end],
    queryFn: async () => {
      const res = await apiClient.get('/stats/calendar', { params: { start, end } });
      return res.data;
    },
    staleTime: 60 * 1000,
  });
}

// ─── 日历视图主组件 ───────────────────────────────────────

const CalendarView: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 计算查询范围（当月前后各1个月）
  const start = useMemo(
    () => currentMonth.subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
    [currentMonth],
  );
  const end = useMemo(
    () => currentMonth.add(1, 'month').endOf('month').format('YYYY-MM-DD'),
    [currentMonth],
  );

  const { data, isLoading, error } = useCalendarEvents(start, end);

  // 按日期分组事件
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of data?.data ?? []) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [data]);

  // 当天事件列表（Drawer 用）
  const selectedEvents = useMemo(
    () => (selectedDate ? (eventsByDate[selectedDate] ?? []) : []),
    [selectedDate, eventsByDate],
  );

  // 日期单元格渲染：显示事件小圆点
  const dateCellRender = (value: Dayjs) => {
    const dateStr = value.format('YYYY-MM-DD');
    const events = eventsByDate[dateStr];
    if (!events || events.length === 0) return null;

    // 对同一类型只显示一个点，避免堆满
    const typesShown = new Set<EventType>();
    const dots: React.ReactNode[] = [];
    for (const ev of events) {
      if (!typesShown.has(ev.type)) {
        typesShown.add(ev.type);
        dots.push(
          <Badge
            key={ev.type}
            color={EVENT_COLOR[ev.type]}
            style={{ marginRight: 2 }}
          />,
        );
      }
    }

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1, marginTop: 2 }}>
        {dots}
      </div>
    );
  };

  const handleSelect = (date: Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    setSelectedDate(dateStr);
    setDrawerOpen(true);
  };

  const handlePanelChange = (date: Dayjs) => {
    setCurrentMonth(date);
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 64 }}>
        <Spin size="large" tip="加载日历数据..." />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message="日历数据加载失败，请刷新重试" style={{ margin: 24 }} />;
  }

  return (
    <div style={{ padding: '0 8px' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <CalendarOutlined style={{ fontSize: 20, color: '#1677ff' }} />
        <Title level={4} style={{ margin: 0 }}>
          日历视图
        </Title>
      </div>

      {/* 图例 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size="large">
          {(Object.keys(EVENT_LABEL) as EventType[]).map((type) => (
            <Space key={type} size={4}>
              <Badge color={EVENT_COLOR[type]} />
              <Text style={{ fontSize: 13 }}>{EVENT_LABEL[type]}</Text>
            </Space>
          ))}
        </Space>
      </Card>

      {/* 日历 */}
      <Card>
        <Calendar
          cellRender={(date, info) => {
            if (info.type === 'date') return dateCellRender(date);
            return null;
          }}
          onSelect={handleSelect}
          onPanelChange={handlePanelChange}
          headerRender={({ value, onChange }) => (
            <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'flex-end' }}>
              <DatePicker
                picker="month"
                value={value}
                onChange={(val) => val && onChange(val)}
                allowClear={false}
              />
            </div>
          )}
        />
      </Card>

      {/* 详情 Drawer */}
      <Drawer
        title={
          <Space>
            <CalendarOutlined />
            <span>{selectedDate} 的事件</span>
          </Space>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
        placement="right"
      >
        {selectedEvents.length === 0 ? (
          <Text type="secondary">当天没有事件</Text>
        ) : (
          <List
            dataSource={selectedEvents}
            renderItem={(ev) => (
              <List.Item>
                <List.Item.Meta
                  avatar={
                    <Badge color={EVENT_COLOR[ev.type]} />
                  }
                  title={
                    <Space>
                      <Tag color={EVENT_COLOR[ev.type]}>{EVENT_LABEL[ev.type]}</Tag>
                      <Text strong>{ev.studentName}</Text>
                    </Space>
                  }
                  description={ev.detail}
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </div>
  );
};

export default CalendarView;
