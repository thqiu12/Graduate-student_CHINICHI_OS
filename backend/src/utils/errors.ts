// src/utils/errors.ts
// 知日塾大学院考学进度管理系统 - 统一错误类定义
// 包含 AppError 类和常用错误码常量

/**
 * 错误码枚举
 */
export const ErrorCode = {
  // 通用错误
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // 认证与权限
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // 业务错误
  PLAN_STATUS_INVALID: 'PLAN_STATUS_INVALID',
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND',
  PLAN_ALREADY_ACTIVE: 'PLAN_ALREADY_ACTIVE',
  PLAN_NOT_ACTIVE: 'PLAN_NOT_ACTIVE',
  PLAN_CANNOT_CONFIRM: 'PLAN_CANNOT_CONFIRM',

  STUDENT_NOT_FOUND: 'STUDENT_NOT_FOUND',
  STUDENT_ACCESS_DENIED: 'STUDENT_ACCESS_DENIED',

  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',

  NOTIFICATION_NOT_FOUND: 'NOTIFICATION_NOT_FOUND',

  FILE_TYPE_NOT_ALLOWED: 'FILE_TYPE_NOT_ALLOWED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',

  SMS_SEND_FAILED: 'SMS_SEND_FAILED',
  SMS_CODE_INVALID: 'SMS_CODE_INVALID',
  SMS_CODE_EXPIRED: 'SMS_CODE_EXPIRED',

  WECHAT_AUTH_FAILED: 'WECHAT_AUTH_FAILED',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * HTTP 状态码映射
 */
const statusCodeMap: Record<ErrorCodeType, number> = {
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,

  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.INVALID_CREDENTIALS]: 401,

  [ErrorCode.PLAN_STATUS_INVALID]: 400,
  [ErrorCode.PLAN_NOT_FOUND]: 404,
  [ErrorCode.PLAN_ALREADY_ACTIVE]: 409,
  [ErrorCode.PLAN_NOT_ACTIVE]: 400,
  [ErrorCode.PLAN_CANNOT_CONFIRM]: 400,

  [ErrorCode.STUDENT_NOT_FOUND]: 404,
  [ErrorCode.STUDENT_ACCESS_DENIED]: 403,

  [ErrorCode.USER_NOT_FOUND]: 404,
  [ErrorCode.USER_ALREADY_EXISTS]: 409,

  [ErrorCode.NOTIFICATION_NOT_FOUND]: 404,

  [ErrorCode.FILE_TYPE_NOT_ALLOWED]: 400,
  [ErrorCode.FILE_TOO_LARGE]: 400,

  [ErrorCode.SMS_SEND_FAILED]: 500,
  [ErrorCode.SMS_CODE_INVALID]: 400,
  [ErrorCode.SMS_CODE_EXPIRED]: 400,

  [ErrorCode.WECHAT_AUTH_FAILED]: 400,
};

/**
 * 应用错误基类
 * 携带错误码、HTTP 状态码和详细信息
 */
export class AppError extends Error {
  public readonly code: ErrorCodeType;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    code: ErrorCodeType,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCodeMap[code] ?? 500;
    this.details = details;

    // 修复 TypeScript 继承 Error 的原型链问题
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

// 常用错误快捷方法
export const createError = {
  notFound: (resource: string, id?: string) =>
    new AppError(
      ErrorCode.NOT_FOUND,
      id ? `${resource}（ID: ${id}）不存在` : `${resource}不存在`,
    ),

  forbidden: (message = '权限不足') =>
    new AppError(ErrorCode.FORBIDDEN, message),

  unauthorized: (message = '请先登录') =>
    new AppError(ErrorCode.UNAUTHORIZED, message),

  validation: (message: string, details?: unknown) =>
    new AppError(ErrorCode.VALIDATION_ERROR, message, details),

  planStatus: (currentStatus: string, expectedStatus: string) =>
    new AppError(
      ErrorCode.PLAN_STATUS_INVALID,
      `规划状态不正确，当前状态：${currentStatus}，期望状态：${expectedStatus}`,
    ),

  studentNotFound: (id: string) =>
    new AppError(ErrorCode.STUDENT_NOT_FOUND, `学生（ID: ${id}）不存在`),
};
