// src/types/student.ts
// 知日塾大学院考学进度管理系统 - 学生相关 TypeScript 类型定义
// 包含：Student、RiskTag、StudentDetail 等

// ─── 枚举类型 ─────────────────────────────────────────────

/**
 * 风险标签颜色/类型枚举
 */
export enum RiskTagCode {
  LowLanguage = 'low_language',       // 语言成绩未考出（橙色）
  HighTarget = 'high_target',          // 目标过高/摇摆（蓝色）
  AttitudeIssue = 'attitude_issue',    // 推进节奏/态度问题（红色）
  LostContact = 'lost_contact',        // 身心异常/失联（黑色）
  WeakMajor = 'weak_major',            // 已内诺但专业课薄弱（紫色）
}

/**
 * 内诺状态枚举（理科专属）
 */
export enum InnoStatus {
  NotStarted = 'not_started',  // 未开始
  InProgress = 'in_progress',  // 沟通中
  Confirmed = 'confirmed',     // 已获内诺
  Rejected = 'rejected',       // 被拒
}

/**
 * 学校进度结果
 */
export enum SchoolResult {
  Pass = '合格',
  Fail = '不合格',
  Supplement = '補欠',
  Abandon = '放弃',
}

// ─── 接口类型 ─────────────────────────────────────────────

/**
 * 用户基本信息
 */
export interface UserInfo {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

/**
 * 校区信息
 */
export interface Campus {
  id: number;
  name: string;
}

/**
 * 学科信息
 */
export interface Subject {
  id: number;
  name: string;
  code: string;
}

/**
 * 风险标签定义
 */
export interface RiskTag {
  id: number;
  code: RiskTagCode;
  label: string;
  color: string;
}

/**
 * 学生-风险标签关联（带标签详情）
 */
export interface StudentRiskTag {
  id: number;
  studentId: string;
  tagId: number;
  reason: string;
  taggedBy: string;
  taggedAt: string;     // ISO datetime
  removedAt?: string | null;
  removedBy?: string | null;
  removeReason?: string | null;
  tag: RiskTag;
  taggedByUser?: {
    id: string;
    name: string;
  } | null;
}

/**
 * 班主任关联记录
 */
export interface StudentTeacher {
  id: number;
  studentId: string;
  teacherId: string;
  startedAt: string;    // ISO datetime
  endedAt?: string | null;
  changedBy?: string | null;
  changeReason?: string | null;
  teacher: {
    id: string;
    name: string;
  };
}

/**
 * 志望校进度节点
 */
export interface SchoolProgressNode {
  id: number;
  schoolId: string;
  nodeCode: string;
  nodeName: string;
  isDone: boolean;
  doneAt?: string | null;
  doneBy?: string | null;
  sortOrder: number;
}

/**
 * 内诺跟踪（理科专属）
 */
export interface InnoTracking {
  id: string;
  schoolId: string;
  status: InnoStatus;
  contactCount: number;
  lastContactAt?: string | null;
  confirmedAt?: string | null;
  notes?: string | null;
  updatedAt: string;
}

/**
 * 内诺沟通记录
 */
export interface InnoContact {
  id: number;
  trackingId: string;
  method?: string | null;
  contactDate?: string | null;
  summary?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

/**
 * 志望校
 */
export interface TargetSchool {
  id: string;
  studentId: string;
  universityName: string;
  department?: string | null;
  rank?: number | null;
  professorName?: string | null;
  professorUrl?: string | null;
  examTypes: string[];
  applicationStart?: string | null;
  applicationEnd?: string | null;
  examDate?: string | null;
  resultDate?: string | null;
  result?: SchoolResult | null;
  createdAt: string;

  // 关联
  progressNodes?: SchoolProgressNode[];
  innoTracking?: InnoTracking | null;
}

/**
 * 辅导记录
 */
export interface CoachingRecord {
  id: string;
  studentId: string;
  teacherId: string;
  coachedAt: string;    // YYYY-MM-DD
  form?: string | null;
  schoolIds: string[];
  content: string;
  nextDate?: string | null;
  createdAt: string;
}

/**
 * 文件版本
 */
export interface FileVersion {
  id: string;
  fileId: string;
  versionNo: number;
  ossKey: string;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedBy: string;
  uploadedAt: string;
  notes?: string | null;
}

/**
 * 文件记录
 */
export interface StudentFile {
  id: string;
  studentId: string;
  fileType: string;
  displayName: string;
  uploadedBy: string;
  createdAt: string;
  versions?: FileVersion[];
}

/**
 * 学生列表项（精简信息，用于列表展示）
 */
export interface StudentListItem {
  id: string;
  userId: string;
  campusId?: number | null;
  subjectId?: number | null;
  entryDate?: string | null;
  targetYear?: string | null;
  targetSeason?: string | null;
  jlptLevel?: string | null;
  createdAt: string;
  updatedAt: string;

  // 关联信息
  user: Pick<UserInfo, 'id' | 'name' | 'phone' | 'avatarUrl'>;
  campus?: Campus | null;
  subject?: Subject | null;
  teachers?: StudentTeacher[];
  riskTags?: StudentRiskTag[];
}

/**
 * 学生详情（完整信息）
 */
export interface StudentDetail extends StudentListItem {
  jlptScore?: number | null;
  undergradMajor?: string | null;
  undergradGpa?: number | null;
  notes?: string | null;

  // 完整关联数据
  user: UserInfo;
  periodPlans?: import('./plan').PeriodPlan[];
  targetSchools?: TargetSchool[];
  coachingRecords?: CoachingRecord[];
  files?: StudentFile[];
}

/**
 * 操作日志
 */
export interface OperationLog {
  id: string;           // BigInt 在前端展示为 string
  studentId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actionType: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * 操作日志类型标签映射
 */
export const ACTION_TYPE_LABELS: Record<string, string> = {
  plan_create: '创建规划',
  plan_send: '发送确认',
  plan_confirm: '学生确认',
  plan_reject: '学生异议',
  plan_change: '发起变更',
  alert_no_plan: '未设规划告警',
  alert_unconfirmed: '未确认规划告警',
  teacher_change: '变更班主任',
  tag_add: '添加风险标签',
  tag_remove: '移除风险标签',
};

/**
 * 风险标签颜色映射（Ant Design 颜色名）
 */
export const RISK_TAG_COLORS: Record<RiskTagCode, string> = {
  [RiskTagCode.LowLanguage]: 'orange',
  [RiskTagCode.HighTarget]: 'blue',
  [RiskTagCode.AttitudeIssue]: 'red',
  [RiskTagCode.LostContact]: 'default',
  [RiskTagCode.WeakMajor]: 'purple',
};
