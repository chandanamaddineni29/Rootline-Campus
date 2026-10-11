'use strict';

const express = require('express');
const { statements } = require('../db/database');
const {
  SESSION_COOKIE,
  createSession,
  hashPassword,
  requireAdmin,
  requireAuth,
  requireSameOrigin,
  safeUser,
  tokenDigest,
  verifyPassword
} = require('../auth');

const router = express.Router();
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ALLOWED_ROLES = new Set(['admin', 'faculty', 'student']);

function validateAccount(input, requirePassword) {
  const username = String(input.username || '').trim();
  const fullName = String(input.fullName || '').trim();
  const role = String(input.role || '').trim();
  const password = String(input.password || '');
  const department = String(input.department || '').trim();
  const linkedStudentId = String(input.linkedStudentId || '').trim();
  const assignedStudentIds = Array.isArray(input.assignedStudentIds)
    ? [...new Set(input.assignedStudentIds.map(value => String(value).trim()).filter(Boolean))]
    : [];
  const assignedClassIds = Array.isArray(input.assignedClassIds)
    ? [...new Set(input.assignedClassIds.map(value => String(value).trim()).filter(Boolean))]
    : [];
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) return { error: 'Username must be 3–50 letters, numbers, dots, underscores, or hyphens.' };
  if (fullName.length < 2 || fullName.length > 120) return { error: 'Enter a full name between 2 and 120 characters.' };
  if (!ALLOWED_ROLES.has(role)) return { error: 'Choose a valid account role.' };
  if (requirePassword && (password.length < 12 || password.length > 200)) return { error: 'Password must contain at least 12 characters.' };
  if (department.length > 120 || linkedStudentId.length > 80 || assignedStudentIds.length > 1000 || assignedClassIds.length > 200) return { error: 'Account details exceed allowed limits.' };
  return { username, fullName, role, password, department, linkedStudentId, assignedStudentIds, assignedClassIds };
}

function requestFingerprint(request) {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

function readAttempts(request) {
  const key = requestFingerprint(request);
  const now = Date.now();
  if (loginAttempts.size > 10000) {
    for (const [address, value] of loginAttempts) {
      if (now - value.startedAt > ATTEMPT_WINDOW_MS) loginAttempts.delete(address);
    }
  }
  const previous = loginAttempts.get(key);
  if (!previous || now - previous.startedAt > ATTEMPT_WINDOW_MS) {
    const value = { startedAt: now, count: 0 };
    loginAttempts.set(key, value);
    return value;
  }
  return previous;
}

router.get('/setup-required', (_request, response) => {
  response.json({ setupRequired: statements.countUsers.get().count === 0 });
});

router.post('/login', requireSameOrigin, (request, response) => {
  const attempt = readAttempts(request);
  if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
    return response.status(429).json({ error: 'Too many sign-in attempts. Wait 15 minutes and try again.' });
  }
  const username = String(request.body?.username || '').trim();
  const password = String(request.body?.password || '');
  const role = String(request.body?.role || '');
  if (username.length > 50 || password.length > 200 || !username || !password) {
    attempt.count += 1;
    return response.status(400).json({ error: 'Enter your username and password.' });
  }
  const user = statements.findUser.get(username);
  if (!user || !user.active || (role && role !== user.role) || !verifyPassword(password, user.passwordHash)) {
    attempt.count += 1;
    return response.status(401).json({ error: 'The username, password, or selected role is incorrect.' });
  }
  const existing = String(request.headers.cookie || '').split(';').map(value => value.trim())
    .find(value => value.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (existing && /^[0-9a-f]{64}$/i.test(existing)) statements.deleteSession.run(tokenDigest(existing));
  loginAttempts.delete(requestFingerprint(request));
  const profile = createSession(user, request, response);
  statements.addActivity.run('user_signed_in', new Date().toISOString(), JSON.stringify({ username: user.username, role: user.role }));
  return response.json({ user: profile });
});

router.post('/logout', requireSameOrigin, (request, response) => {
  const token = String(request.headers.cookie || '').split(';').map(value => value.trim())
    .find(value => value.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (token && /^[0-9a-f]{64}$/i.test(token)) statements.deleteSession.run(tokenDigest(token));
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  return response.json({ ok: true });
});

router.get('/me', requireAuth, (request, response) => response.json({ user: request.authUser }));

router.get('/users', requireAuth, requireAdmin, (_request, response) => {
  const users = statements.listUsers.all().map(user => safeUser(user));
  return response.json({ users });
});

router.get('/classes', requireAuth, requireAdmin, (_request, response) => {
  return response.json({ classes: statements.listClasses.all().map(item => ({ ...item, isDemo: Boolean(item.isDemo) })) });
});

router.post('/users', requireAuth, requireAdmin, requireSameOrigin, (request, response) => {
  const account = validateAccount(request.body || {}, true);
  if (account.error) return response.status(400).json({ error: account.error });
  const linkedIds = new Set([account.linkedStudentId, ...account.assignedStudentIds].filter(Boolean));
  if (account.role === 'student' && !account.linkedStudentId) {
    return response.status(400).json({ error: 'Student accounts must be linked to a student record.' });
  }
  if (account.role === 'faculty' && account.assignedStudentIds.length === 0 && account.assignedClassIds.length === 0) {
    return response.status(400).json({ error: 'Assign at least one student record or class to a faculty account.' });
  }
  if (account.role !== 'faculty' && (account.assignedStudentIds.length || account.assignedClassIds.length)) {
    return response.status(400).json({ error: 'Student and class assignments are only valid for faculty accounts.' });
  }
  const row = statements.getState.get();
  if (linkedIds.size && !row) return response.status(400).json({ error: 'No student profiles are available to link.' });
  let studentIds = new Set();
  if (row) {
    try {
      const state = JSON.parse(row.state_json);
      const students = JSON.parse(state.campusiq_students || '[]');
      studentIds = new Set(students.map(student => String(student.id || '').toLowerCase()));
    } catch (error) {
      console.error('[Rootline] Could not validate assigned student records:', error);
      return response.status(500).json({ error: 'Stored student data could not be validated.' });
    }
  }
  for (const studentId of linkedIds) {
    if (!studentIds.has(studentId.toLowerCase())) return response.status(400).json({ error: `Student record ${studentId} does not exist.` });
  }
  for (const classId of account.assignedClassIds) {
    if (!statements.findClass.get(classId)) return response.status(400).json({ error: `Class ${classId} does not exist.` });
  }
  if (statements.findUser.get(account.username)) return response.status(409).json({ error: 'That username is already in use.' });
  const insertUser = statements.createUser;
  const createAccount = require('../db/database').database.transaction(() => {
    const result = insertUser.run({
      username: account.username,
      fullName: account.fullName,
      role: account.role,
      passwordHash: hashPassword(account.password),
      active: 1,
      isDemo: 1,
      department: account.department,
      linkedStudentId: account.linkedStudentId,
      createdAt: new Date().toISOString()
    });
    for (const studentId of account.assignedStudentIds) statements.addAssignment.run(result.lastInsertRowid, studentId);
    for (const classId of account.assignedClassIds) statements.addUserClass.run(result.lastInsertRowid, classId);
    return statements.getUser.get(result.lastInsertRowid);
  });
  try {
    const user = createAccount();
    statements.addActivity.run('account_created', new Date().toISOString(), JSON.stringify({ username: user.username, role: user.role }));
    return response.status(201).json({ user: safeUser(user) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'That username is already in use.' });
    console.error('[Rootline] Account creation failed:', error);
    return response.status(500).json({ error: 'The account could not be created.' });
  }
});

router.patch('/users/:id', requireAuth, requireAdmin, requireSameOrigin, (request, response) => {
  const id = Number(request.params.id);
  const user = Number.isSafeInteger(id) && id > 0 ? statements.getUser.get(id) : null;
  if (!user) return response.status(404).json({ error: 'Account not found.' });
  const active = request.body?.active;
  if (typeof active === 'boolean') {
    if (!active && user.id === request.authUser.id) return response.status(400).json({ error: 'You cannot deactivate your own signed-in account.' });
    statements.updateUser.run({ ...user, active: active ? 1 : 0, isDemo: user.isDemo ? 1 : 0 });
    if (!active) {
      const db = require('../db/database').database;
      db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
    }
    statements.addActivity.run(active ? 'account_activated' : 'account_deactivated', new Date().toISOString(), JSON.stringify({ username: user.username }));
    return response.json({ user: safeUser(statements.getUser.get(id)) });
  }
  const account = validateAccount(request.body || {}, false);
  if (account.error) return response.status(400).json({ error: account.error });
  if (account.role === 'student' && !account.linkedStudentId) {
    return response.status(400).json({ error: 'Student accounts must be linked to a student record.' });
  }
  if (account.role === 'faculty' && account.assignedStudentIds.length === 0 && account.assignedClassIds.length === 0) {
    return response.status(400).json({ error: 'Assign at least one student record or class to a faculty account.' });
  }
  if (account.role !== 'faculty' && (account.assignedStudentIds.length || account.assignedClassIds.length)) {
    return response.status(400).json({ error: 'Student and class assignments are only valid for faculty accounts.' });
  }
  if (user.id === request.authUser.id && account.role !== user.role) {
    return response.status(400).json({ error: 'You cannot change your own account role.' });
  }
  const row = statements.getState.get();
  let studentIds = new Set();
  if (row) {
    try {
      const state = JSON.parse(row.state_json);
      const students = JSON.parse(state.campusiq_students || '[]');
      studentIds = new Set(students.map(student => String(student.id || '').toLowerCase()));
    } catch (error) {
      console.error('[Rootline] Could not validate assigned student records:', error);
      return response.status(500).json({ error: 'Stored student data could not be validated.' });
    }
  }
  for (const studentId of [account.linkedStudentId, ...account.assignedStudentIds].filter(Boolean)) {
    if (!studentIds.has(studentId.toLowerCase())) return response.status(400).json({ error: `Student record ${studentId} does not exist.` });
  }
  for (const classId of account.assignedClassIds) {
    if (!statements.findClass.get(classId)) return response.status(400).json({ error: `Class ${classId} does not exist.` });
  }
  const db = require('../db/database').database;
  const updateAccount = db.transaction(() => {
    statements.updateUser.run({
      id,
      username: account.username,
      fullName: account.fullName,
      role: account.role,
      active: user.active,
      isDemo: user.isDemo ? 1 : 0,
      department: account.department,
      linkedStudentId: account.linkedStudentId
    });
    statements.deleteAssignments.run(id);
    statements.deleteUserClasses.run(id);
    for (const studentId of account.assignedStudentIds) statements.addAssignment.run(id, studentId);
    for (const classId of account.assignedClassIds) statements.addUserClass.run(id, classId);
    if (account.password) statements.setPassword.run(hashPassword(account.password), id);
  });
  try { updateAccount(); }
  catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'That username is already in use.' });
    console.error('[Rootline] Account update failed:', error);
    return response.status(500).json({ error: 'The account could not be updated.' });
  }
  if (account.password || account.role !== user.role) {
    const db = require('../db/database').database;
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
  }
  statements.addActivity.run('account_updated', new Date().toISOString(), JSON.stringify({ username: user.username, role: account.role }));
  return response.json({ user: safeUser(statements.getUser.get(id)) });
});

router.delete('/users/:id', requireAuth, requireAdmin, requireSameOrigin, (request, response) => {
  const id = Number(request.params.id);
  const user = Number.isSafeInteger(id) && id > 0 ? statements.getUser.get(id) : null;
  if (!user) return response.status(404).json({ error: 'Account not found.' });
  if (user.id === request.authUser.id) return response.status(400).json({ error: 'You cannot remove your own signed-in account.' });
  statements.deleteUser.run(user.username);
  statements.addActivity.run('account_removed', new Date().toISOString(), JSON.stringify({ username: user.username }));
  return response.json({ ok: true });
});

router.put('/users/:id/password', requireAuth, requireAdmin, requireSameOrigin, (request, response) => {
  const id = Number(request.params.id);
  const password = String(request.body?.password || '');
  const user = Number.isSafeInteger(id) && id > 0 ? statements.getUser.get(id) : null;
  if (!user) return response.status(404).json({ error: 'Account not found.' });
  if (password.length < 12 || password.length > 200) return response.status(400).json({ error: 'Password must contain at least 12 characters.' });
  statements.setPassword.run(hashPassword(password), id);
  require('../db/database').database.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
  statements.addActivity.run('account_password_changed', new Date().toISOString(), JSON.stringify({ username: user.username }));
  return response.json({ ok: true });
});

module.exports = router;
