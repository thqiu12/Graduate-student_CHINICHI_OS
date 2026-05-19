// src/middlewares/authorize.ts
// 知日塾大学院考学进度管理系统 - RBAC 权限中间件
// 基于角色的访问控制，支持多角色检查

import { FastifyRequest, FastifyReply } from 'fastify';
import { JwtPayload } from '../plugins/auth';

// 系统角色枚举
export const Roles = {
  ADMIN_TOTAL: 'admin_total',    // 教务总负责人
  SUBJECT_HEAD: 'subject_head',  // 学科负责人
  TEACHER: 'teacher',            // 大学院班主任
  STUDENT: 'student',            // 学生
  SUPER_ADMIN: 'super_admin',    // 系统超级管理员
} as const;

export type RoleCode = (typeof Roles)[keyof typeof Roles];

/**
 * 创建 RBAC 权限检查中间件
 * @param allowedRoles 允许访问的角色列表（满足其一即可）
 * @returns Fastify preHandler 中间件函数
 *
 * @example
 * // 只允许教务总负责人和学科负责人
 * preHandler: [authenticate, authorize([Roles.ADMIN_TOTAL, Roles.SUBJECT_HEAD])]
 */
export function authorize(allowedRoles: RoleCode[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as JwtPayload;

    if (!user) {
      reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: '请先登录',
      });
      return;
    }

    const hasPermission = user.roles.some((role) =>
      allowedRoles.includes(role as RoleCode),
    );

    if (!hasPermission) {
      request.log.warn(
        {
          userId: user.sub,
          userRoles: user.roles,
          requiredRoles: allowedRoles,
          path: request.url,
        },
        'RBAC 拒绝访问',
      );
      reply.status(403).send({
        code: 'FORBIDDEN',
        message: '权限不足，无法访问此资源',
      });
      return;
    }
  };
}

/**
 * 检查当前用户是否具有指定角色（辅助函数，用于业务层）
 */
export function hasRole(user: JwtPayload, role: RoleCode): boolean {
  return user.roles.includes(role);
}

/**
 * 检查是否为管理层（教务总负责人或学科负责人）
 */
export function isManagement(user: JwtPayload): boolean {
  return (
    hasRole(user, Roles.ADMIN_TOTAL) || hasRole(user, Roles.SUBJECT_HEAD)
  );
}

/**
 * 检查是否为教师（班主任及以上管理层）
 */
export function isTeacherOrAbove(user: JwtPayload): boolean {
  return (
    hasRole(user, Roles.ADMIN_TOTAL) ||
    hasRole(user, Roles.SUBJECT_HEAD) ||
    hasRole(user, Roles.TEACHER)
  );
}
