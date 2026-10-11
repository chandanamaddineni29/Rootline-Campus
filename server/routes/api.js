'use strict';

const express = require('express');
const { statements, saveStateTransaction } = require('../db/database');
const authRouter = require('./auth');
const { requireAdmin, requireAuth, requireSameOrigin } = require('../auth');

const router = express.Router();
const SUPPORTED_STATE_KEY = /^campusiq_(students|actions|module_records|historical_snapshots|import_reconciliation|test_data_seeded)$/;

router.use('/auth', authRouter);

router.get('/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'rootline-local-api',
    database: 'sqlite',
    time: new Date().toISOString()
  });
});

function scopedState(state, user) {
  const result = { ...state };
  delete result.campusiq_users;
  if (user.role === 'admin') return result;
  const allowedIds = new Set(user.role === 'student'
    ? [String(user.linkedStudentId || '')]
    : user.assignedStudentIds.map(String));
  const isAllowed = id => allowedIds.has(String(id || ''));
  if (result.campusiq_students) {
    const students = JSON.parse(result.campusiq_students);
    result.campusiq_students = JSON.stringify(students.filter(student => isAllowed(student.id)));
  }
  if (result.campusiq_actions) {
    const actions = JSON.parse(result.campusiq_actions);
    result.campusiq_actions = JSON.stringify(actions.filter(action => isAllowed(action.studentId)));
  }
  if (result.campusiq_module_records) {
    const records = JSON.parse(result.campusiq_module_records);
    for (const [key, values] of Object.entries(records)) {
      if (Array.isArray(values)) records[key] = values.filter(record => isAllowed(record.studentId));
    }
    result.campusiq_module_records = JSON.stringify(records);
  }
  delete result.campusiq_historical_snapshots;
  delete result.campusiq_import_reconciliation;
  result.campusiq_test_data_seeded = 'yes';
  return result;
}

function mergeFacultyState(current, incoming, user) {
  const allowedIds = new Set(user.assignedStudentIds.map(String));
  const isAllowed = id => allowedIds.has(String(id || ''));
  const result = { ...current };
  if (Object.keys(incoming).some(key => !['campusiq_students', 'campusiq_actions', 'campusiq_module_records'].includes(key))) {
    return { error: 'Faculty accounts may update assigned student, intervention, and source-record data only.' };
  }
  for (const key of Object.keys(incoming)) {
    let nextValue;
    try { nextValue = JSON.parse(incoming[key]); }
    catch (_error) { return { error: `${key} contains invalid JSON.` }; }
    if (key === 'campusiq_students' || key === 'campusiq_actions') {
      if (!Array.isArray(nextValue)) return { error: `${key} must contain a list.` };
      const idKey = key === 'campusiq_students' ? 'id' : 'studentId';
      if (nextValue.some(item => !item || !isAllowed(item[idKey]))) {
        return { error: 'Changes may only include students assigned to your faculty account.' };
      }
      let oldRows;
      try { oldRows = JSON.parse(current[key] || '[]'); }
      catch (_error) { return { error: 'Saved data is invalid and could not be safely updated.' }; }
      const retained = oldRows.filter(item => !isAllowed(item[idKey]));
      result[key] = JSON.stringify([...retained, ...nextValue]);
      continue;
    }
    if (!nextValue || typeof nextValue !== 'object' || Array.isArray(nextValue)) {
      return { error: 'Module records must be organized by record type.' };
    }
    let oldGroups;
    try { oldGroups = JSON.parse(current[key] || '{}'); }
    catch (_error) { return { error: 'Saved data is invalid and could not be safely updated.' }; }
    const merged = { ...oldGroups };
    for (const [group, rows] of Object.entries(nextValue)) {
      if (!Array.isArray(rows)) return { error: `Module record group "${group}" must be a list.` };
      if (rows.some(item => !item || !isAllowed(item.studentId))) {
        return { error: 'Changes may only include records for students assigned to your faculty account.' };
      }
      const retained = (Array.isArray(oldGroups[group]) ? oldGroups[group] : []).filter(item => !isAllowed(item.studentId));
      merged[group] = [...retained, ...rows];
    }
    result[key] = JSON.stringify(merged);
  }
  return { state: result };
}

router.get('/state', requireAuth, (_request, response) => {
  const row = statements.getState.get();
  if (!row) return response.json({ state: null, updatedAt: null });

  try {
    return response.json({ state: scopedState(JSON.parse(row.state_json), _request.authUser), updatedAt: row.updated_at });
  } catch (_error) {
    return response.status(500).json({ error: 'Stored application state could not be decoded.' });
  }
});

router.put('/state', requireAuth, requireSameOrigin, (request, response) => {
  const state = request.body && request.body.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return response.status(400).json({ error: 'A state object is required.' });
  }

  if (request.authUser.role === 'student') {
    return response.status(403).json({ error: 'Student accounts cannot modify application records.' });
  }
  const supportedState = Object.fromEntries(Object.entries(state)
    .filter(([key, value]) => SUPPORTED_STATE_KEY.test(key) && key !== 'campusiq_users' && typeof value === 'string'));
  if (!Object.keys(supportedState).length) {
    return response.status(400).json({ error: 'No supported application data was provided.' });
  }

  const currentRow = statements.getState.get();
  let mergedState = {};
  if (currentRow) {
    try { mergedState = JSON.parse(currentRow.state_json); }
    catch (_error) { mergedState = {}; }
  }

  if (request.authUser.role === 'faculty') {
    const scoped = mergeFacultyState(mergedState, supportedState, request.authUser);
    if (scoped.error) return response.status(403).json({ error: scoped.error });
    mergedState = scoped.state;
  } else {
    Object.assign(mergedState, supportedState);
  }
  const timestamp = new Date().toISOString();
  saveStateTransaction(JSON.stringify(mergedState), timestamp, Object.keys(supportedState));
  return response.json({ ok: true, updatedAt: timestamp, keysSaved: Object.keys(supportedState).length });
});

router.get('/activity', requireAuth, requireAdmin, (_request, response) => {
  const items = statements.getActivity.all().map(row => ({ ...row, detail: JSON.parse(row.detail) }));
  response.json({ items });
});

module.exports = router;
