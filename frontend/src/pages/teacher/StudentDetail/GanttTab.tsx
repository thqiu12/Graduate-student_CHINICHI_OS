// src/pages/teacher/StudentDetail/GanttTab.tsx
// 知日塾大学院考学进度管理系统 - 甘特图（规划总览）
// 功能：横轴时间轴（月份），纵轴各阶段(P1-P8)，纯CSS色块，悬停Tooltip

import React, { useMemo } from 'react';
import { Spin, Empty, Typography, Tag, Tooltip } from 'antd';
import { useStudentPlans } from '../../../api/plans.api';
import { PlanStatus, PERIOD_LABELS, PLAN_STATUS_COLORS } from '../../../types/plan';
import type { PeriodPlan } from '../../../types/plan';

const { Text } = Typography;

// ─── 阶段色块颜色（按状态） ───────────────────────────────

const STATUS_BG: Record<string, string> = {
  draft: '#d9d9d9',
  pending: '#faad14',
  change_pending: '#9254de',
  active: '#52c41a',
  completed: '#1677ff',
  cancelled: '#ff4d4f',
};

const STATUS_TEXT_COLOR: Record<string, string> = {
  draft: '#595959',
  pending: '#fff',
  change_pending: '#fff',
  active: '#fff',
  completed: '#fff',
  cancelled: '#fff',
};

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending: '待确认',
  change_pending: '变更待确认',
  active: '执行中',
  completed: '已完成',
  cancelled: '已取消',
};

// ─── Props ────────────────────────────────────────────────

interface GanttTabProps {
  studentId: string;
  studentName: string;
}

// ─── 工具函数 ─────────────────────────────────────────────

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  return new Date(dateStr);
}

function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return dateStr.slice(0, 10);
}

function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

// 生成月份序列
function generateMonths(startDate: Date, endDate: Date): Array<{ year: number; month: number; label: string }> {
  const months: Array<{ year: number; month: number; label: string }> = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const finish = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cur <= finish) {
    months.push({
      year: cur.getFullYear(),
      month: cur.getMonth(),
      label: `${cur.getFullYear()}/${String(cur.getMonth() + 1).padStart(2, '0')}`,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

// ─── 甘特图主组件 ─────────────────────────────────────────

const GanttTab: React.FC<GanttTabProps> = ({ studentId, studentName }) => {
  const { data: plans, isLoading } = useStudentPlans(studentId);

  // 找每个 periodCode 的最新规划
  const latestPlans = useMemo(() => {
    if (!plans) return [];
    const map: Record<string, PeriodPlan> = {};
    for (const p of plans) {
      const existing = map[p.periodCode];
      if (!existing || p.version > existing.version) {
        map[p.periodCode] = p;
      }
    }
    // 按 P1..P8 排序
    return Object.values(map).sort((a, b) => a.periodCode.localeCompare(b.periodCode));
  }, [plans]);

  // 计算时间轴范围
  const { timelineStart, timelineEnd, months, totalMonths } = useMemo(() => {
    if (latestPlans.length === 0) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 6, 1);
      return {
        timelineStart: start,
        timelineEnd: end,
        months: generateMonths(start, end),
        totalMonths: monthsBetween(start, end) + 1,
      };
    }

    let minDate = new Date(latestPlans[0].startDate);
    let maxDate = new Date(latestPlans[0].endDate);

    for (const p of latestPlans) {
      const s = parseDate(p.startDate);
      const e = parseDate(p.endDate);
      if (s && s < minDate) minDate = s;
      if (e && e > maxDate) maxDate = e;
    }

    // 留一个月的 padding
    const start = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1);
    const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1);
    const ms = generateMonths(start, end);

    return {
      timelineStart: start,
      timelineEnd: end,
      months: ms,
      totalMonths: ms.length,
    };
  }, [latestPlans]);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin tip="加载中..." />
      </div>
    );
  }

  if (latestPlans.length === 0) {
    return <Empty description="暂无规划数据" />;
  }

  // 每个月的宽度（px）
  const MONTH_WIDTH = 72;
  const ROW_HEIGHT = 44;
  const LABEL_WIDTH = 130;

  const totalWidth = LABEL_WIDTH + totalMonths * MONTH_WIDTH;

  // 计算色块的 left 和 width
  function calcBar(plan: PeriodPlan): { left: number; width: number } | null {
    const s = parseDate(plan.startDate);
    const e = parseDate(plan.endDate);
    if (!s || !e) return null;

    const startMonth = new Date(s.getFullYear(), s.getMonth(), 1);
    const endMonth = new Date(e.getFullYear(), e.getMonth(), 1);

    const startOffset = monthsBetween(timelineStart, startMonth);
    const endOffset = monthsBetween(timelineStart, endMonth);

    // 精确到天的偏移
    const daysInStartMonth = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
    const daysInEndMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();

    const leftFrac = startOffset + (s.getDate() - 1) / daysInStartMonth;
    const rightFrac = endOffset + e.getDate() / daysInEndMonth;

    const left = LABEL_WIDTH + leftFrac * MONTH_WIDTH;
    const width = Math.max((rightFrac - leftFrac) * MONTH_WIDTH, 20);

    return { left, width };
  }

  const todayFrac = (() => {
    const now = new Date();
    const nowMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const offset = monthsBetween(timelineStart, nowMonth);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return LABEL_WIDTH + (offset + (now.getDate() - 1) / daysInMonth) * MONTH_WIDTH;
  })();

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {studentName} 的考学阶段规划总览 — 悬停色块查看详情
        </Text>
      </div>

      {/* 图例 */}
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {Object.entries(STATUS_LABEL).map(([status, label]) => (
          <Tag
            key={status}
            color={STATUS_BG[status]}
            style={{ color: STATUS_TEXT_COLOR[status] || '#000', border: 'none' }}
          >
            {label}
          </Tag>
        ))}
      </div>

      {/* 甘特图主体 */}
      <div style={{ position: 'relative', width: totalWidth, minHeight: (latestPlans.length + 1) * ROW_HEIGHT + 8 }}>

        {/* 月份表头 */}
        <div style={{ display: 'flex', height: ROW_HEIGHT, alignItems: 'flex-end', paddingBottom: 4 }}>
          <div style={{ width: LABEL_WIDTH, flexShrink: 0, fontWeight: 600, fontSize: 12, color: '#888' }}>
            阶段
          </div>
          {months.map((m) => (
            <div
              key={`${m.year}-${m.month}`}
              style={{
                width: MONTH_WIDTH,
                flexShrink: 0,
                textAlign: 'center',
                fontSize: 11,
                borderLeft: '1px solid #f0f0f0',
                fontWeight: m.month === 0 ? 700 : 400,
                color: m.month === 0 ? '#1677ff' : '#666',
              } as React.CSSProperties}
            >
              {m.label}
            </div>
          ))}
        </div>

        {/* 阶段行 */}
        {latestPlans.map((plan, idx) => {
          const bar = calcBar(plan);
          const doneCount = plan.tasks?.filter((t) => t.status === 'done').length ?? 0;
          const totalTasks = plan.tasks?.length ?? 0;
          const progress = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : null;

          const tooltipContent = (
            <div style={{ maxWidth: 260 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {PERIOD_LABELS[plan.periodCode] ?? plan.stageName}
              </div>
              {plan.goal && (
                <div style={{ marginBottom: 4, color: '#ddd' }}>
                  目标：{plan.goal}
                </div>
              )}
              <div>开始：{formatDateShort(plan.startDate)}</div>
              <div>截止：{formatDateShort(plan.endDate)}</div>
              {progress !== null && (
                <div style={{ marginTop: 4 }}>
                  任务进度：{doneCount}/{totalTasks}（{progress}%）
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                状态：{STATUS_LABEL[plan.status] ?? plan.status}
              </div>
              {plan.changeReason && (
                <div style={{ marginTop: 4, color: '#faad14' }}>
                  变更原因：{plan.changeReason}
                </div>
              )}
            </div>
          );

          return (
            <div
              key={plan.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: ROW_HEIGHT,
                background: idx % 2 === 0 ? '#fafafa' : '#fff',
                position: 'relative',
              }}
            >
              {/* 阶段名称 */}
              <div
                style={{
                  width: LABEL_WIDTH,
                  flexShrink: 0,
                  paddingRight: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#333',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={PERIOD_LABELS[plan.periodCode] ?? plan.stageName}
              >
                <span style={{ color: '#1677ff', marginRight: 4 }}>{plan.periodCode}</span>
                {PERIOD_LABELS[plan.periodCode] ?? plan.stageName}
              </div>

              {/* 月份网格背景 */}
              {months.map((m) => (
                <div
                  key={`${m.year}-${m.month}`}
                  style={{
                    width: MONTH_WIDTH,
                    flexShrink: 0,
                    height: ROW_HEIGHT,
                    borderLeft: '1px solid #f0f0f0',
                  }}
                />
              ))}

              {/* 色块 */}
              {bar && (
                <Tooltip title={tooltipContent} color="#001529" placement="top">
                  <div
                    style={{
                      position: 'absolute',
                      left: bar.left,
                      width: bar.width,
                      height: 28,
                      top: (ROW_HEIGHT - 28) / 2,
                      background: STATUS_BG[plan.status] ?? '#d9d9d9',
                      borderRadius: 4,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 6,
                      paddingRight: 6,
                      overflow: 'hidden',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: STATUS_TEXT_COLOR[plan.status] ?? '#000',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {progress !== null ? `${progress}%` : plan.stageName}
                    </span>
                  </div>
                </Tooltip>
              )}
            </div>
          );
        })}

        {/* 今天的竖线 */}
        {todayFrac >= LABEL_WIDTH && todayFrac <= totalWidth && (
          <div
            style={{
              position: 'absolute',
              left: todayFrac,
              top: 0,
              bottom: 0,
              width: 2,
              background: '#ff4d4f',
              opacity: 0.8,
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -4,
                left: -18,
                background: '#ff4d4f',
                color: '#fff',
                fontSize: 10,
                padding: '1px 4px',
                borderRadius: 2,
                whiteSpace: 'nowrap',
              }}
            >
              今日
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GanttTab;
