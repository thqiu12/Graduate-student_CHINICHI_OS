import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assertContains(file, expected) {
  const content = read(file);
  if (!content.includes(expected)) {
    throw new Error(`${file} missing expected content: ${expected}`);
  }
}

const demoPhones = [
  '13900000001',
  '13900000004',
  '13900000002',
  '13900000003',
  '13812345678',
];

for (const phone of demoPhones) {
  assertContains('frontend/src/pages/auth/Login.tsx', phone);
  assertContains('backend/prisma/seed.ts', phone);
}

assertContains('frontend/src/App.tsx', 'path="/notifications"');
assertContains('frontend/src/pages/admin/UserManagement.tsx', '导入学生CSV');
assertContains('backend/src/routes/students.ts', '/students/import');
assertContains('backend/src/routes/files.ts', '/students/:id/files/:fileId/versions/:versionId/download');
assertContains('backend/src/routes/files.ts', '/students/:id/files/:fileId');
assertContains('frontend/src/pages/student/Files.tsx', 'FILE_TYPE_OPTIONS');
assertContains('frontend/src/pages/teacher/StudentDetail/index.tsx', 'teacher-student-files');
assertContains('frontend/src/pages/teacher/StudentDetail/index.tsx', '已上传文件');
assertContains('backend/src/routes/plans.ts', 'PlanStatus.cancelled');
assertContains('backend/src/routes/plans.ts', 'createInAppNotification');
assertContains('backend/src/routes/plans.ts', 'notificationDelivery.create');
assertContains('backend/src/routes/plans.ts', 'task_done');
assertContains('backend/src/routes/plans.ts', 'task_reopen');
assertContains('frontend/src/api/plans.api.ts', 'planQueryKeys.logs(studentId)');
assertContains('backend/src/routes/coaching.ts', "targetType: 'coaching_record'");
assertContains('backend/src/routes/risk-tags.ts', "targetType: 'student_risk_tag'");
assertContains('frontend/src/api/coaching.api.ts', 'planQueryKeys.all(studentId)');
assertContains('frontend/src/pages/teacher/StudentDetail/StagesTab.tsx', 'getErrorMessage');
assertContains('frontend/src/pages/teacher/StudentDetail/TasksTab.tsx', 'getErrorMessage');
assertContains('backend/src/utils/notifications.ts', 'notificationDelivery.create');
assertContains('backend/src/jobs/check-overdue-tasks.job.ts', 'createInAppNotification');
assertContains('backend/src/jobs/check-unconfirmed-plans.job.ts', 'createInAppNotification');
assertContains('backend/src/jobs/check-unset-plans.job.ts', 'createInAppNotification');
assertContains('backend/src/jobs/weekly-summary-teacher.job.ts', 'createInAppNotification');
assertContains('backend/src/jobs/weekly-summary-dept.job.ts', 'createInAppNotification');
assertContains('backend/src/routes/schools.ts', "node.nodeCode === 'inno'");
assertContains('backend/src/routes/schools.ts', 'removedInnoTracking');
assertContains('backend/src/routes/schools.ts', "targetType: 'target_school'");
assertContains('frontend/src/api/schools.api.ts', 'planQueryKeys.logs(studentId)');
assertContains('backend/src/routes/inno.ts', "nodeCode: 'inno'");
assertContains('backend/src/routes/inno.ts', 'inno_status_update');
assertContains('backend/src/routes/inno.ts', 'inno_contact_add');

console.log('Internal smoke checks passed.');
