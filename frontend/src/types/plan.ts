// src/types/plan.ts
// 知日塾大学院考学进度管理系统 - 规划相关 TypeScript 类型定义
// 包含：PlanStatus 枚举、PeriodPlan、PlanTask、PlanConfirmation 等

// ─── 枚举类型 ─────────────────────────────────────────────

/**
 * 规划状态枚举
 * 对应后端 PlanStatus Prisma 枚举
 */
export enum PlanStatus {
  Draft = 'draft',                  // 草稿（班主任编辑中）
  Pending = 'pending',              // 待学生确认
  ChangePending = 'change_pending', // 变更待确认
  Active = 'active',                // 已生效·执行中
  Completed = 'completed',          // 已完成
  Cancelled = 'cancelled',          // 已取消
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  Pending = 'pending',         // 未开始
  InProgress = 'in_progress',  // 进行中
  Done = 'done',               // 已完成
  Overdue = 'overdue',         // 已逾期
}

/**
 * 任务优先级枚举
 */
export enum TaskPriority {
  High = '高',
  Medium = '中',
  Low = '低',
}

/**
 * 任务重复类型枚举
 */
export enum RepeatType {
  Once = 'once',
  Daily = 'daily',
  Weekly = 'weekly',
}

/**
 * 规划确认操作类型
 */
export enum ConfirmAction {
  Confirm = 'confirm',
  Reject = 'reject',
}

// ─── 接口类型 ─────────────────────────────────────────────

/**
 * 规划任务（period_plan_tasks）
 */
export interface PlanTask {
  id: string;
  planId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;    // ISO date string: YYYY-MM-DD
  dueTime?: string | null;    // HH:MM
  priority: TaskPriority;
  repeatType: RepeatType;
  sortOrder: number;
  status: TaskStatus;
  doneAt?: string | null;     // ISO datetime string
  doneNote?: string | null;
  createdAt: string;
}

/**
 * 规划确认记录（plan_confirmations）
 */
export interface PlanConfirmation {
  id: number;
  planId: string;
  action: ConfirmAction;
  actorId: string;
  content?: string | null;
  createdAt: string;
}

/**
 * 用户简要信息（嵌套在规划中）
 */
export interface UserSummary {
  id: string;
  name: string;
}

/**
 * 考学阶段规划（period_plans）
 * 完整类型，包含关联数据
 */
export interface PeriodPlan {
  id: string;
  studentId: string;
  periodCode: string;       // P1~P8
  stageName: string;
  goal?: string | null;
  startDate: string;        // YYYY-MM-DD
  endDate: string;          // YYYY-MM-DD
  version: number;
  status: PlanStatus;
  changeReason?: string | null;
  previousPlanId?: string | null;
  createdBy?: string | null;
  createdAt: string;
  sentAt?: string | null;
  confirmedAt?: string | null;
  confirmedBy?: string | null;

  // 关联数据（可选，按 API 返回情况）
  tasks?: PlanTask[];
  createdByUser?: UserSummary | null;
  confirmedByUser?: UserSummary | null;
  confirmations?: PlanConfirmation[];
}

/**
 * 创建规划的请求体
 */
export interface CreatePlanRequest {
  periodCode: string;
  stageName: string;
  goal?: string;
  startDate: string;
  endDate: string;
  tasks?: CreateTaskRequest[];
}

/**
 * 创建任务的请求体
 */
export interface CreateTaskRequest {
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  priority?: TaskPriority;
  repeatType?: RepeatType;
  sortOrder?: number;
}

/**
 * 发起规划变更的请求体
 */
export interface ChangePlanRequest {
  changeReason: string;
  stageName?: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * 学生提出异议的请求体
 */
export interface RejectPlanRequest {
  content: string;
}

/**
 * 规划列表 API 响应
 */
export interface PlansResponse {
  data: PeriodPlan[];
}

/**
 * 单个规划 API 响应
 */
export interface PlanResponse {
  data: PeriodPlan;
  message?: string;
}

/**
 * 阶段编码与名称映射
 */
export const PERIOD_LABELS: Record<string, string> = {
  P1: '语言准备期',
  P2: '方向确立期',
  P3: '内诺攻坚期',
  P4: '研究计划书期',
  P5: '出愿准备期',
  P6: '考试冲刺期',
  P7: '等待结果期',
  P8: '合格后手续期',
};

/**
 * 规划状态中文标签映射
 */
export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  [PlanStatus.Draft]: '草稿',
  [PlanStatus.Pending]: '待确认',
  [PlanStatus.ChangePending]: '变更待确认',
  [PlanStatus.Active]: '执行中',
  [PlanStatus.Completed]: '已完成',
  [PlanStatus.Cancelled]: '已取消',
};

/**
 * 规划状态颜色映射（Ant Design token 颜色名）
 */
export const PLAN_STATUS_COLORS: Record<PlanStatus, string> = {
  [PlanStatus.Draft]: 'default',
  [PlanStatus.Pending]: 'warning',
  [PlanStatus.ChangePending]: 'purple',
  [PlanStatus.Active]: 'success',
  [PlanStatus.Completed]: 'default',
  [PlanStatus.Cancelled]: 'error',
};
