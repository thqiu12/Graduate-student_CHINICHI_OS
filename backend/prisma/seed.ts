// prisma/seed.ts
// 知日塾大学院考学进度管理系统 - 数据库种子数据
// 插入：2个学科、8个校区、5个角色、3个测试用户

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('开始插入种子数据...');

  // ═══════════════════════════════════════
  // 1. 学科（2个）
  // ═══════════════════════════════════════
  const liberalSubject = await prisma.subject.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: '文科大学院',
      code: 'liberal',
    },
  });

  const scienceSubject = await prisma.subject.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      name: '理科大学院',
      code: 'science',
    },
  });

  console.log('学科创建完成:', liberalSubject.name, scienceSubject.name);

  // ═══════════════════════════════════════
  // 2. 校区（8个）
  // ═══════════════════════════════════════
  const campusData = [
    { id: 1, name: '东京校' },
    { id: 2, name: '关西校' },
    { id: 3, name: '成都校' },
    { id: 4, name: '广州校' },
    { id: 5, name: '上海校' },
    { id: 6, name: '杭州校' },
    { id: 7, name: '武汉校' },
    { id: 8, name: '西安校' },
  ];

  for (const campus of campusData) {
    await prisma.campus.upsert({
      where: { id: campus.id },
      update: {},
      create: campus,
    });
  }
  console.log('校区创建完成，共', campusData.length, '个校区');

  // ═══════════════════════════════════════
  // 3. 角色（5个）
  // ═══════════════════════════════════════
  const roleData = [
    { id: 1, code: 'admin_total', name: '教务总负责人' },
    { id: 2, code: 'subject_head', name: '学科负责人' },
    { id: 3, code: 'teacher', name: '大学院班主任' },
    { id: 4, code: 'student', name: '学生' },
    { id: 5, code: 'super_admin', name: '系统超级管理员' },
  ];

  for (const role of roleData) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: {},
      create: role,
    });
  }
  console.log('角色创建完成，共', roleData.length, '个角色');

  // ═══════════════════════════════════════
  // 4. 风险标签预设
  // ═══════════════════════════════════════
  const riskTagData = [
    { id: 1, code: 'low_language', label: '语言成绩未考出', color: 'orange' },
    { id: 2, code: 'high_target', label: '目标过高/摇摆', color: 'blue' },
    { id: 3, code: 'attitude_issue', label: '推进节奏/态度问题', color: 'red' },
    { id: 4, code: 'lost_contact', label: '身心异常/失联', color: 'black' },
    { id: 5, code: 'weak_major', label: '已内诺但专业课薄弱', color: 'purple' },
  ];

  for (const tag of riskTagData) {
    await prisma.riskTag.upsert({
      where: { id: tag.id },
      update: {},
      create: tag,
    });
  }
  console.log('风险标签创建完成，共', riskTagData.length, '个标签');

  // ═══════════════════════════════════════
  // 5. 测试用户（3个）
  // ═══════════════════════════════════════

  // 测试管理员
  const adminUser = await prisma.user.upsert({
    where: { phone: '13900000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: '测试管理员',
      phone: '13900000001',
      email: 'admin@chinichi.jp',
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: 1, // admin_total
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: 1,
    },
  });

  // 测试班主任
  const teacherUser = await prisma.user.upsert({
    where: { phone: '13900000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: '测试班主任',
      phone: '13900000002',
      email: 'teacher@chinichi.jp',
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: teacherUser.id,
        roleId: 3, // teacher
      },
    },
    update: {},
    create: {
      userId: teacherUser.id,
      roleId: 3,
      campusId: 1, // 东京校
    },
  });

  // 测试学生（先创建user，再创建student档案）
  const studentUser = await prisma.user.upsert({
    where: { phone: '13900000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      name: '测试学生',
      phone: '13900000003',
      email: 'student@chinichi.jp',
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: studentUser.id,
        roleId: 4, // student
      },
    },
    update: {},
    create: {
      userId: studentUser.id,
      roleId: 4,
    },
  });

  // 创建学生档案
  const studentRecord = await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      id: '00000000-0000-0000-0001-000000000001',
      userId: studentUser.id,
      campusId: 1, // 东京校
      subjectId: 1, // 文科大学院
      entryDate: new Date('2026-04-01'),
      targetYear: '2027年春入学',
      targetSeason: '2026年秋季考',
      jlptLevel: 'N2',
      jlptScore: 98,
      undergradMajor: '经济学',
      notes: '测试学生账号，用于开发和测试',
    },
  });

  // 关联班主任
  const existingRelation = await prisma.studentTeacher.findFirst({
    where: {
      studentId: studentRecord.id,
      teacherId: teacherUser.id,
      endedAt: null,
    },
  });

  if (!existingRelation) {
    await prisma.studentTeacher.create({
      data: {
        studentId: studentRecord.id,
        teacherId: teacherUser.id,
        startedAt: new Date(),
      },
    });
  }

  console.log('测试用户创建完成:');
  console.log('  - 管理员:', adminUser.name, '/', adminUser.phone);
  console.log('  - 班主任:', teacherUser.name, '/', teacherUser.phone);
  console.log('  - 学生:', studentUser.name, '/', studentUser.phone);

  console.log('\n种子数据插入完成！');
}

main()
  .catch((e: Error) => {
    console.error('种子数据插入失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
