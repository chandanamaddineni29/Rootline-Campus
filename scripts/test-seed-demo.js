'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const temporaryData = fs.mkdtempSync(path.join(os.tmpdir(), 'rootline-demo-seed-'));
const environment = { ...process.env, ROOTLINE_DATA_DIRECTORY: temporaryData };
const run = args => spawnSync(process.execPath, [path.join(__dirname, 'seed-demo.js'), ...args], {
  cwd: projectRoot,
  env: environment,
  encoding: 'utf8'
});

try {
  const fixture = spawnSync(process.execPath, ['-e', `
    const { database, statements } = require('./server/db/database');
    const { hashPassword } = require('./server/auth');
    const students = Array.from({ length: 18 }, (_, i) => ({
      id: 'STU-' + String(1001 + i),
      name: 'Synthetic Student ' + (i + 1),
      dept: ['Computer Science', 'Electronics', 'Information Technology', 'Mechanical', 'Electrical', 'Civil'][i % 6],
      year: ['2nd Year', '3rd Year', '4th Year'][i % 3],
      attendance: 55 + (i * 7) % 45,
      academic: 45 + (i * 9) % 50,
      cgpa: 6 + (i % 4),
      backlogs: i % 3
    }));
    statements.putState.run(JSON.stringify({
      campusiq_students: JSON.stringify(students),
      campusiq_actions: '[]',
      campusiq_module_records: JSON.stringify({ attendance: [], internal: [], semester: [], lms: [], placement: [], extra: [], feedback: [] }),
      campusiq_historical_snapshots: '[]'
    }), new Date().toISOString());
    statements.createUser.run({
      username: 'faculty002',
      fullName: 'Demo Faculty',
      role: 'faculty',
      passwordHash: hashPassword('OldSyntheticPassword123!'),
      active: 1,
      isDemo: 1,
      department: '',
      linkedStudentId: '',
      createdAt: new Date().toISOString()
    });
    statements.createUser.run({
      username: 'custom.faculty',
      fullName: 'Custom Faculty',
      role: 'faculty',
      passwordHash: hashPassword('CustomFacultyPassword123!'),
      active: 1,
      isDemo: 0,
      department: '',
      linkedStudentId: '',
      createdAt: new Date().toISOString()
    });
    database.close();
  `], { cwd: projectRoot, env: environment, encoding: 'utf8' });
  assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);

  const firstRun = run(['--rotate-passwords']);
  assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
  const credentials = [...firstRun.stdout.matchAll(/^(Administrator|Faculty|Student) \| ([^|]+) \| ([A-Za-z0-9_-]+)$/gm)];
  assert.deepEqual(
    [...firstRun.stdout.matchAll(/^(Administrator|Faculty|Student) \| ([^|]+) \| ([A-Za-z0-9_-]+)$/gm)]
      .map(([, role, username, password]) => [role, username.trim(), password]),
    [
      ['Administrator', 'admin.demo', 'Rootline123'],
      ['Faculty', 'faculty002', 'Rootline123'],
      ['Student', 'student.demo', 'Rootline123']
    ],
    'Should print the shared demo password for administrator, faculty, and student.'
  );
  const Database = require('better-sqlite3');
  const database = new Database(path.join(temporaryData, 'rootline.sqlite'));
  const { verifyPassword } = require('../server/auth');
  const findUser = database.prepare('SELECT id, password_hash AS passwordHash FROM users WHERE username = ?');
  const listAssignments = database.prepare('SELECT student_id FROM user_student_assignments WHERE user_id = ?');
  const listUserClasses = database.prepare('SELECT class_id FROM user_class_assignments WHERE user_id = ?');
  const listClassStudents = database.prepare('SELECT student_id FROM class_enrollments WHERE class_id = ?');
  for (const username of ['admin.demo', 'faculty002', 'student.demo']) {
    assert.equal(verifyPassword('Rootline123', findUser.get(username).passwordHash), true);
  }
  assert.equal(
    verifyPassword('CustomFacultyPassword123!', findUser.get('custom.faculty').passwordHash),
    true,
    'Seeding must not change custom account passwords.'
  );
  const saved = JSON.parse(database.prepare('SELECT state_json FROM app_state WHERE id=1').get().state_json);
  const roster = JSON.parse(saved.campusiq_students);
  const modules = JSON.parse(saved.campusiq_module_records);
  assert.equal(roster.length, 24);
  for (const workspace of ['attendance', 'internal', 'semester', 'lms', 'placement', 'extra', 'feedback']) {
    assert.ok(modules[workspace].length > 0, `${workspace} workspace should have seeded records`);
    assert.ok(modules[workspace].every(record => record.demo === true), `${workspace} records should be labeled synthetic`);
  }
  assert.equal(JSON.parse(saved.campusiq_historical_snapshots).length, 3);
  assert.equal(listAssignments.all(findUser.get('faculty002').id).length, 24);
  const classes = database.prepare('SELECT class_id FROM academic_classes ORDER BY class_id').all();
  assert.ok(classes.length > 0);
  const facultyClassIds = listUserClasses.all(findUser.get('faculty002').id).map(item => item.class_id);
  assert.deepEqual(facultyClassIds.sort(), classes.map(item => item.class_id).sort());
  for (const classId of facultyClassIds) assert.ok(listClassStudents.all(classId).length > 0);
  assert.equal(database.prepare("SELECT linked_student_id FROM users WHERE username='student.demo'").get().linked_student_id, 'DEMO-2601');
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin'").get().count, 1);
  const originalRecordCounts = Object.fromEntries(Object.entries(modules).map(([key, records]) => [key, records.length]));
  database.close();

  const secondRun = run([]);
  assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);
  assert.match(secondRun.stdout, /Administrator \| admin\.demo \| Rootline123/);
  const verifyDb = new (require('better-sqlite3'))(path.join(temporaryData, 'rootline.sqlite'), { readonly: true });
  const secondSaved = JSON.parse(verifyDb.prepare('SELECT state_json FROM app_state WHERE id=1').get().state_json);
  const secondModules = JSON.parse(secondSaved.campusiq_module_records);
  assert.deepEqual(Object.fromEntries(Object.entries(secondModules).map(([key, records]) => [key, records.length])), originalRecordCounts);
  assert.equal(JSON.parse(secondSaved.campusiq_historical_snapshots).length, 3);
  const verifyDemoPassword = verifyDb.prepare('SELECT password_hash AS passwordHash FROM users WHERE username = ?');
  for (const username of ['admin.demo', 'faculty002', 'student.demo']) {
    assert.equal(verifyPassword('Rootline123', verifyDemoPassword.get(username).passwordHash), true);
  }
  assert.equal(verifyPassword('CustomFacultyPassword123!', verifyDemoPassword.get('custom.faculty').passwordHash), true);
  verifyDb.close();
  process.stdout.write('Demo seed checks passed: roster, synthetic workspace data, faculty class/student assignment, all three shared-password demo roles, and idempotent rerun.\n');
} finally {
  fs.rmSync(temporaryData, { recursive: true, force: true });
}
