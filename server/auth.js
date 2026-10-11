'use strict';

const crypto = require('node:crypto');
const { statements } = require('./db/database');

const SESSION_COOKIE = 'rootline_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyPassword(password, encoded) {
  const [algorithm, saltHex, hashHex] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !/^[0-9a-f]{32}$/i.test(saltHex || '') || !/^[0-9a-f]{128}$/i.test(hashHex || '')) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function cookieValue(request, name) {
  const prefix = `${name}=`;
  const item = String(request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : '';
}

function sessionCookie(token, request, maxAgeSeconds) {
  const secure = request.secure || request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function tokenDigest(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeUser(user) {
  const directAssignedStudentIds = statements.listAssignments.all(user.id).map(item => item.studentId);
  const assignedClasses = statements.listUserClasses.all(user.id);
  const assignedStudentIds = [...new Set([
    ...directAssignedStudentIds,
    ...statements.listClassStudentIds.all(user.id).map(item => item.studentId)
  ])].sort();
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    active: Boolean(user.active),
    isDemo: Boolean(user.isDemo),
    department: user.department || '',
    linkedStudentId: user.linkedStudentId || '',
    directAssignedStudentIds,
    assignedClassIds: assignedClasses.map(item => item.id),
    assignedClasses,
    assignedStudentIds
  };
}

function requireAuth(request, response, next) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    return response.status(401).json({ error: 'Sign in is required.' });
  }
  const now = new Date().toISOString();
  const session = statements.findSession.get(tokenDigest(token), now);
  if (!session || !session.active) {
    if (token) statements.deleteSession.run(tokenDigest(token));
    response.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'strict' });
    return response.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
  request.authUser = safeUser(session);
  request.sessionTokenHash = tokenDigest(token);
  return next();
}

function requireAdmin(request, response, next) {
  if (request.authUser?.role !== 'admin') {
    return response.status(403).json({ error: 'Administrator access is required for this action.' });
  }
  return next();
}

function requireSameOrigin(request, response, next) {
  const origin = request.get('origin');
  if (origin) {
    let parsed;
    try { parsed = new URL(origin); }
    catch (_error) { return response.status(403).json({ error: 'Request origin could not be verified.' }); }
    if (parsed.host !== request.get('host') || parsed.protocol !== `${request.protocol}:`) {
      return response.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    }
  }
  return next();
}

function createSession(user, request, response) {
  statements.deleteExpiredSessions.run(new Date().toISOString());
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  statements.addSession.run(tokenDigest(token), user.id, now.toISOString(), expiresAt.toISOString());
  response.setHeader('Set-Cookie', sessionCookie(token, request, SESSION_DURATION_MS / 1000));
  return safeUser(user);
}

module.exports = {
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  createSession,
  hashPassword,
  requireAdmin,
  requireAuth,
  requireSameOrigin,
  safeUser,
  sessionCookie,
  tokenDigest,
  verifyPassword
};
