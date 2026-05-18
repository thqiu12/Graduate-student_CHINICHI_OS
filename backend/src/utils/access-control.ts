import { FastifyInstance } from 'fastify';
import { JwtPayload } from '../plugins/auth';
import { Roles } from '../middlewares/authorize';
import { createError } from './errors';

export async function assertStudentAccess(
  fastify: FastifyInstance,
  user: JwtPayload,
  studentId: string,
): Promise<void> {
  if (user.roles.includes(Roles.ADMIN_TOTAL)) {
    return;
  }

  const student = await fastify.prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, userId: true, subjectId: true },
  });

  if (!student) {
    throw createError.studentNotFound(studentId);
  }

  if (user.roles.includes(Roles.STUDENT)) {
    if (student.userId === user.sub) return;
    throw createError.forbidden('只能访问自己的数据');
  }

  if (user.roles.includes(Roles.SUBJECT_HEAD)) {
    const headRole = await fastify.prisma.userRole.findFirst({
      where: {
        userId: user.sub,
        role: { code: Roles.SUBJECT_HEAD },
        subjectId: student.subjectId,
      },
    });
    if (headRole) return;
  }

  if (user.roles.includes(Roles.TEACHER)) {
    const relation = await fastify.prisma.studentTeacher.findFirst({
      where: {
        studentId,
        teacherId: user.sub,
        endedAt: null,
      },
      select: { id: true },
    });
    if (relation) return;
  }

  throw createError.forbidden('无权访问该学生数据');
}

export async function buildStudentScopeWhere(
  fastify: FastifyInstance,
  user: JwtPayload,
): Promise<Record<string, unknown>> {
  if (user.roles.includes(Roles.ADMIN_TOTAL)) {
    return {};
  }

  if (user.roles.includes(Roles.STUDENT)) {
    return { userId: user.sub };
  }

  if (user.roles.includes(Roles.SUBJECT_HEAD)) {
    const subjectRoles = await fastify.prisma.userRole.findMany({
      where: { userId: user.sub, role: { code: Roles.SUBJECT_HEAD } },
      select: { subjectId: true },
    });
    const subjectIds = subjectRoles
      .map((r) => r.subjectId)
      .filter((id): id is number => id !== null);
    if (subjectIds.length > 0) {
      return { subjectId: { in: subjectIds } };
    }
  }

  if (user.roles.includes(Roles.TEACHER)) {
    return {
      teachers: {
        some: { teacherId: user.sub, endedAt: null },
      },
    };
  }

  throw createError.forbidden('无权访问学生数据');
}
