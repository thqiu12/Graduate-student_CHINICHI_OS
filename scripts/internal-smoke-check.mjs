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
assertContains('backend/src/routes/plans.ts', 'PlanStatus.cancelled');

console.log('Internal smoke checks passed.');
