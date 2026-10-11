'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');
const temporaryData = fs.mkdtempSync(path.join(os.tmpdir(), 'rootline-auth-test-'));
let server;
let serverOutput = '';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const { port } = listener.address();
      listener.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Server exited during startup:\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch (_error) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Server did not become ready:\n${serverOutput}`);
}

async function request(baseUrl, route, { method = 'GET', cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });
  const text = await response.text();
  let payload = {};
  if (text) payload = JSON.parse(text);
  return { response, payload };
}

async function main() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const legacyDb = new Database(path.join(temporaryData, 'rootline.sqlite'));
  legacyDb.exec(`
    CREATE TABLE app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  legacyDb.prepare('INSERT INTO app_state (id, state_json, updated_at) VALUES (1, ?, ?)')
    .run(JSON.stringify({
      campusiq_students: JSON.stringify([{ id: 'STU-1', name: 'Synthetic Student' }, { id: 'STU-2', name: 'Other Student' }]),
      campusiq_users: JSON.stringify([{
        username: 'legacyfaculty',
        fullName: 'Migrated Faculty',
        role: 'faculty',
        password: 'LegacyDemoPassword6'
      }])
    }), new Date().toISOString());
  legacyDb.close();
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), ROOTLINE_DATA_DIRECTORY: temporaryData, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.setEncoding('utf8').on('data', value => { serverOutput += value; });
  server.stderr.setEncoding('utf8').on('data', value => { serverOutput += value; });
  try {
    await waitForServer(baseUrl);
    const setup = spawnSync(process.execPath, ['scripts/create-admin.js'], {
      cwd: root,
      env: {
        ...process.env,
        ROOTLINE_DATA_DIRECTORY: temporaryData,
        ROOTLINE_ADMIN_USERNAME: 'testadmin',
        ROOTLINE_ADMIN_NAME: 'Test Administrator',
        NODE_ENV: 'test'
      },
      input: '',
      encoding: 'utf8',
      timeout: 10000
    });
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);
    const password = setup.stdout.match(/Password: ([A-Za-z0-9_-]+)/)?.[1];
    assert.ok(password && password.length >= 24, `first-run setup creates a random password:\n${setup.stdout}\n${setup.stderr}`);

    const blocked = await request(baseUrl, '/api/state');
    assert.equal(blocked.response.status, 401, 'state requires an authenticated session');

    const adminLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'testadmin', password, role: 'admin' }
    });
    assert.equal(adminLogin.response.status, 200, JSON.stringify(adminLogin.payload));
    const adminCookie = adminLogin.response.headers.get('set-cookie').split(';')[0];
    assert.match(adminLogin.response.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(adminLogin.response.headers.get('set-cookie'), /SameSite=Strict/i);
    assert.equal(adminLogin.payload.user.fullName, 'Test Administrator');
    const migratedLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'legacyfaculty', password: 'LegacyDemoPassword6', role: 'faculty' }
    });
    assert.equal(migratedLogin.response.status, 200, 'legacy demo accounts are retained after hash migration');
    const wrongRole = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'testadmin', password, role: 'faculty' }
    });
    assert.equal(wrongRole.response.status, 401, 'the server validates the selected role');

    const initialData = await request(baseUrl, '/api/state', {
      method: 'PUT',
      cookie: adminCookie,
      body: { state: { campusiq_students: JSON.stringify([{ id: 'STU-1', name: 'Synthetic Student' }, { id: 'STU-2', name: 'Other Student' }]) } }
    });
    assert.equal(initialData.response.status, 200, JSON.stringify(initialData.payload));
    const dbForClasses = new Database(path.join(temporaryData, 'rootline.sqlite'));
    dbForClasses.prepare(`
      INSERT INTO academic_classes
        (class_id, course_code, course_name, department, year_label, is_demo)
      VALUES ('DEMO-CLS-TEST', 'TEST-101', 'Synthetic Class', 'Computer Science', '1st Year', 1)
    `).run();
    dbForClasses.prepare('INSERT INTO class_enrollments (class_id, student_id) VALUES (?, ?)')
      .run('DEMO-CLS-TEST', 'STU-1');
    dbForClasses.close();
    const availableClasses = await request(baseUrl, '/api/auth/classes', { cookie: adminCookie });
    assert.equal(availableClasses.response.status, 200);
    assert.equal(availableClasses.payload.classes[0].id, 'DEMO-CLS-TEST');
    const createClassFaculty = await request(baseUrl, '/api/auth/users', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        username: 'facultyclass',
        fullName: 'Class Faculty',
        role: 'faculty',
        password: 'SyntheticClassFacultyPassword123!',
        assignedClassIds: ['DEMO-CLS-TEST']
      }
    });
    assert.equal(createClassFaculty.response.status, 201, JSON.stringify(createClassFaculty.payload));
    assert.deepEqual(createClassFaculty.payload.user.assignedStudentIds, ['STU-1']);
    assert.deepEqual(createClassFaculty.payload.user.assignedClasses.map(item => item.id), ['DEMO-CLS-TEST']);
    const classFacultyLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'facultyclass', password: 'SyntheticClassFacultyPassword123!', role: 'faculty' }
    });
    assert.equal(classFacultyLogin.response.status, 200, JSON.stringify(classFacultyLogin.payload));
    assert.equal(classFacultyLogin.payload.user.assignedClasses[0].studentCount, 1);
    const classFacultyCookie = classFacultyLogin.response.headers.get('set-cookie').split(';')[0];
    const classScopedState = await request(baseUrl, '/api/state', { cookie: classFacultyCookie });
    assert.deepEqual(JSON.parse(classScopedState.payload.state.campusiq_students).map(student => student.id), ['STU-1']);
    const classFacultyForbiddenWrite = await request(baseUrl, '/api/state', {
      method: 'PUT',
      cookie: classFacultyCookie,
      body: { state: { campusiq_students: JSON.stringify([{ id: 'STU-2', name: 'Out of class' }]) } }
    });
    assert.equal(classFacultyForbiddenWrite.response.status, 403, 'class access cannot be used to write another class roster');

    const createFaculty = await request(baseUrl, '/api/auth/users', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        username: 'faculty01',
        fullName: 'Faculty One',
        role: 'faculty',
        password: 'SyntheticFacultyPassword123!',
        assignedStudentIds: ['STU-1']
      }
    });
    assert.equal(createFaculty.response.status, 201, JSON.stringify(createFaculty.payload));
    assert.deepEqual(createFaculty.payload.user.assignedStudentIds, ['STU-1']);
    assert.equal(Object.hasOwn(createFaculty.payload.user, 'passwordHash'), false);

    const facultyLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'faculty01', password: 'SyntheticFacultyPassword123!', role: 'faculty' }
    });
    assert.equal(facultyLogin.response.status, 200, JSON.stringify(facultyLogin.payload));
    const facultyCookie = facultyLogin.response.headers.get('set-cookie').split(';')[0];
    const scoped = await request(baseUrl, '/api/state', { cookie: facultyCookie });
    assert.deepEqual(JSON.parse(scoped.payload.state.campusiq_students).map(student => student.id), ['STU-1']);
    const activityDenied = await request(baseUrl, '/api/activity', { cookie: facultyCookie });
    assert.equal(activityDenied.response.status, 403, 'faculty cannot access administrator audit events');
    const forbiddenWrite = await request(baseUrl, '/api/state', {
      method: 'PUT',
      cookie: facultyCookie,
      body: { state: { campusiq_students: JSON.stringify([{ id: 'STU-2', name: 'Tampered' }]) } }
    });
    assert.equal(forbiddenWrite.response.status, 403);

    const deactivate = await request(baseUrl, `/api/auth/users/${createFaculty.payload.user.id}`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { active: false }
    });
    assert.equal(deactivate.response.status, 200, JSON.stringify(deactivate.payload));
    const expiredSession = await request(baseUrl, '/api/state', { cookie: facultyCookie });
    assert.equal(expiredSession.response.status, 401, 'deactivating a user revokes active sessions');
    const inactiveLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'faculty01', password: 'SyntheticFacultyPassword123!', role: 'faculty' }
    });
    assert.equal(inactiveLogin.response.status, 401, 'inactive users cannot sign in');
    const db = new Database(path.join(temporaryData, 'rootline.sqlite'), { readonly: true });
    const storedState = db.prepare('SELECT state_json FROM app_state WHERE id = 1').get().state_json;
    const migratedHash = db.prepare("SELECT password_hash AS hash FROM users WHERE username = 'legacyfaculty'").get().hash;
    assert.equal(storedState.includes('LegacyDemoPassword6'), false, 'legacy cleartext account data is removed from the snapshot');
    assert.match(migratedHash, /^scrypt\$/);
    assert.notEqual(migratedHash, 'LegacyDemoPassword6');
    db.close();

    process.stdout.write('Authentication integration checks passed: setup, scrypt-backed login, protected API, scoped faculty data, and account deactivation.\n');
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise(resolve => server.once('exit', resolve));
    }
    fs.rmSync(temporaryData, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  if (serverOutput) console.error(serverOutput);
  process.exitCode = 1;
});
