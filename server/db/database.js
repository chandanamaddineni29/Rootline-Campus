'use strict';

const fs = require('node:fs');
const Database = require('better-sqlite3');
const { dataDirectory, databasePath } = require('../config');

fs.mkdirSync(dataDirectory, { recursive: true });
const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'faculty', 'student')),
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    is_demo INTEGER NOT NULL DEFAULT 1 CHECK (is_demo IN (0, 1)),
    department TEXT NOT NULL DEFAULT '',
    linked_student_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_student_assignments (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    PRIMARY KEY (user_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS academic_classes (
    class_id TEXT PRIMARY KEY,
    course_code TEXT NOT NULL UNIQUE,
    course_name TEXT NOT NULL,
    department TEXT NOT NULL,
    year_label TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 1 CHECK (is_demo IN (0, 1))
  );
  CREATE TABLE IF NOT EXISTS class_enrollments (
    class_id TEXT NOT NULL REFERENCES academic_classes(class_id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    PRIMARY KEY (class_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS user_class_assignments (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES academic_classes(class_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, class_id)
  );
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
`);

const statements = {
  getState: database.prepare('SELECT state_json, updated_at FROM app_state WHERE id = 1'),
  putState: database.prepare(`
    INSERT INTO app_state (id, state_json, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
  `),
  addActivity: database.prepare(
    'INSERT INTO activity_log (event_type, created_at, detail_json) VALUES (?, ?, ?)'
  ),
  getActivity: database.prepare(`
    SELECT id, event_type AS eventType, created_at AS createdAt, detail_json AS detail
    FROM activity_log ORDER BY id DESC LIMIT 25
  `),
  findUser: database.prepare(`
    SELECT id, username, full_name AS fullName, role, password_hash AS passwordHash,
      active, is_demo AS isDemo, department, linked_student_id AS linkedStudentId
    FROM users WHERE username = ? COLLATE NOCASE
  `),
  getUser: database.prepare(`
    SELECT id, username, full_name AS fullName, role, active, is_demo AS isDemo,
      department, linked_student_id AS linkedStudentId
    FROM users WHERE id = ?
  `),
  listUsers: database.prepare(`
    SELECT id, username, full_name AS fullName, role, active, is_demo AS isDemo,
      department, linked_student_id AS linkedStudentId, created_at AS createdAt
    FROM users ORDER BY full_name COLLATE NOCASE, username COLLATE NOCASE
  `),
  countUsers: database.prepare('SELECT COUNT(*) AS count FROM users'),
  createUser: database.prepare(`
    INSERT INTO users
      (username, full_name, role, password_hash, active, is_demo, department, linked_student_id, created_at)
    VALUES (@username, @fullName, @role, @passwordHash, @active, @isDemo, @department, @linkedStudentId, @createdAt)
  `),
  updateUser: database.prepare(`
    UPDATE users SET username = @username, full_name = @fullName, role = @role, active = @active,
      is_demo = @isDemo, department = @department, linked_student_id = @linkedStudentId
    WHERE id = @id
  `),
  setPassword: database.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  deleteUser: database.prepare('DELETE FROM users WHERE username = ? COLLATE NOCASE'),
  listAssignments: database.prepare('SELECT student_id AS studentId FROM user_student_assignments WHERE user_id = ? ORDER BY student_id'),
  deleteAssignments: database.prepare('DELETE FROM user_student_assignments WHERE user_id = ?'),
  addAssignment: database.prepare('INSERT INTO user_student_assignments (user_id, student_id) VALUES (?, ?)'),
  listClasses: database.prepare(`
    SELECT class_id AS id, course_code AS code, course_name AS name,
      department, year_label AS yearLabel, is_demo AS isDemo,
      (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = c.class_id) AS studentCount
    FROM academic_classes c ORDER BY department COLLATE NOCASE, year_label, course_code
  `),
  findClass: database.prepare('SELECT class_id AS id FROM academic_classes WHERE class_id = ?'),
  listUserClasses: database.prepare(`
    SELECT c.class_id AS id, c.course_code AS code, c.course_name AS name,
      c.department, c.year_label AS yearLabel, c.is_demo AS isDemo,
      COUNT(e.student_id) AS studentCount
    FROM user_class_assignments a
    JOIN academic_classes c ON c.class_id = a.class_id
    LEFT JOIN class_enrollments e ON e.class_id = c.class_id
    WHERE a.user_id = ?
    GROUP BY c.class_id
    ORDER BY c.department COLLATE NOCASE, c.year_label, c.course_code
  `),
  listClassStudentIds: database.prepare(`
    SELECT e.student_id AS studentId FROM class_enrollments e
    JOIN user_class_assignments a ON a.class_id = e.class_id
    WHERE a.user_id = ? ORDER BY e.student_id
  `),
  deleteUserClasses: database.prepare('DELETE FROM user_class_assignments WHERE user_id = ?'),
  addUserClass: database.prepare('INSERT OR IGNORE INTO user_class_assignments (user_id, class_id) VALUES (?, ?)'),
  addSession: database.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
  findSession: database.prepare(`
    SELECT u.id, u.username, u.full_name AS fullName, u.role, u.active,
      u.is_demo AS isDemo, u.department, u.linked_student_id AS linkedStudentId,
      s.expires_at AS expiresAt
    FROM auth_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `),
  deleteSession: database.prepare('DELETE FROM auth_sessions WHERE token_hash = ?'),
  deleteExpiredSessions: database.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?')
};

function migrateLegacyAccounts() {
  const row = statements.getState.get();
  if (!row) return;
  let state;
  try { state = JSON.parse(row.state_json); }
  catch (error) {
    console.error('[Rootline] The saved state could not be read while removing legacy plaintext account passwords.', error);
    throw error;
  }
  const legacyAccounts = (() => {
    try { return JSON.parse(state.campusiq_users || '[]'); }
    catch (error) {
      console.error('[Rootline] Legacy account data could not be read; refusing to keep plaintext passwords.', error);
      throw error;
    }
  })();
  const insertLegacyAccount = database.prepare(`
    INSERT INTO users
      (username, full_name, role, password_hash, active, is_demo, department, linked_student_id, created_at)
    VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?)
    ON CONFLICT(username) DO NOTHING
  `);
  const assignLegacyStudent = database.prepare('INSERT OR IGNORE INTO user_student_assignments (user_id, student_id) VALUES (?, ?)');
  const findLegacyUser = database.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE');
  const hashLegacyPassword = password => {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(String(password), salt, 64);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  };
  const migrate = database.transaction(() => {
    if (Array.isArray(legacyAccounts)) {
      for (const account of legacyAccounts) {
        if (!account || typeof account !== 'object' || !/^[a-zA-Z0-9._-]{3,50}$/.test(String(account.username || ''))
          || !['admin', 'faculty', 'student'].includes(account.role) || !String(account.password || '')) continue;
        const username = String(account.username).trim();
        insertLegacyAccount.run(
          username,
          String(account.fullName || username).trim().slice(0, 120) || username,
          account.role,
          hashLegacyPassword(account.password),
          String(account.department || '').slice(0, 120),
          String(account.studentId || '').slice(0, 80),
          new Date().toISOString()
        );
        if (account.role === 'student' && account.studentId) {
          const user = findLegacyUser.get(username);
          assignLegacyStudent.run(user.id, String(account.studentId).slice(0, 80));
        }
      }
    }
    delete state.campusiq_users;
    statements.putState.run(JSON.stringify(state), new Date().toISOString());
    statements.addActivity.run('legacy_accounts_migrated', new Date().toISOString(), JSON.stringify({ count: Array.isArray(legacyAccounts) ? legacyAccounts.length : 0 }));
  });
  migrate();
}

const crypto = require('node:crypto');
migrateLegacyAccounts();

const saveStateTransaction = database.transaction((serializedState, timestamp, keys) => {
  statements.putState.run(serializedState, timestamp);
  statements.addActivity.run('state_saved', timestamp, JSON.stringify({ keys }));
});

module.exports = { database, statements, saveStateTransaction };
