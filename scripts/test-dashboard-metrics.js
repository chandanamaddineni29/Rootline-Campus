'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const utilitySource = fs.readFileSync(path.join(root, 'assets/js/modules/02-scoring-and-utilities.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'assets/js/modules/03-dashboard-and-journey.js'), 'utf8');
const validStart = utilitySource.indexOf('function validInternalPercent(');
const validEnd = utilitySource.indexOf('\nfunction academicPerformanceForStudent', validStart);
const metricsStart = dashboardSource.indexOf('function sourceAnalyticsFor(');
const metricsEnd = dashboardSource.indexOf('\nfunction dashboardFilteredStudents', metricsStart);
assert(validStart >= 0 && validEnd > validStart, 'Could not locate the production assessment validator.');
assert(metricsStart >= 0 && metricsEnd > metricsStart, 'Could not locate the production dashboard metrics helper.');

const context = vm.createContext({ moduleRecords: {} });
vm.runInContext(`${utilitySource.slice(validStart, validEnd)}\n${dashboardSource.slice(metricsStart, metricsEnd)}`, context);
const students = ['S1', 'S2', 'S3', 'S4'].map(id => ({ id, name: id }));
context.moduleRecords = {
  attendance: [
    { studentId: 'S1', date: '2026-01-01', subject: 'A', status: 'Present' },
    { studentId: 'S1', date: '2026-01-02', subject: 'A', status: 'Late' },
    { studentId: 'S1', date: '2026-01-03', subject: 'A', status: 'Absent' },
    { studentId: 'S2', date: '2026-01-01', subject: 'A', status: 'Present' },
    { studentId: 'S2', date: '2026-01-02', subject: 'A', status: 'Absent' },
    { studentId: 'S3', date: '2026-99-99', subject: 'A', status: 'Present' },
    { studentId: 'S4', date: '2026-01-05', subject: 'A', status: 'Present' },
    { studentId: 'S4', date: '2026-01-05', subject: 'A', status: 'Present' }
  ],
  internal: [
    { studentId: 'S1', date: '2026-01-01', assessment: 'Test 1', subject: 'A', marks: 40, maxMarks: 50 },
    { studentId: 'S1', date: '2026-01-02', assessment: 'Test 2', subject: 'A', marks: 30, maxMarks: 50 },
    { studentId: 'S1', date: '2026-01-02', assessment: 'Test 2 retake', subject: 'A', marks: 40, maxMarks: 50 },
    { studentId: 'S2', date: '2026-01-01', assessment: 'Test 1', subject: 'A', marks: 15, maxMarks: 50 },
    { studentId: 'S2', date: '2026-01-02', assessment: 'Invalid', subject: 'A', marks: 80, maxMarks: 50 },
    { studentId: 'S4', date: '2026-01-05', assessment: 'Test 1', subject: 'A', marks: 40, maxMarks: 50 }
  ]
};

const metrics = vm.runInContext('sourceAnalyticsFor(students)', Object.assign(context, { students }));
assert.equal(metrics.attendanceRecordCount, 6, 'Duplicate and invalid-date attendance should not inflate session count.');
assert.equal(metrics.assessmentRecordCount, 5, 'Invalid assessment marks should not enter the average.');
assert.equal(metrics.attendanceRate, 100 * 4 / 6, 'Late is attended and excused/invalid records do not enter the denominator.');
assert.equal(metrics.averageMarks, 66, 'Marks should normalize to percentages before averaging.');
assert.equal(metrics.alerts.length, 2, 'A student with multiple triggers must count as one at-risk student.');
assert.equal(metrics.alertsByStudent.get('S1').severity, 'Medium', 'A decline across dated assessments should trigger a medium alert.');
assert.match(metrics.alertsByStudent.get('S1').reasons.join(' '), /80% to 70%/, 'Multiple assessments on the same date should be averaged before decline detection.');
assert.equal(metrics.alertsByStudent.get('S2').severity, 'High', 'Attendance below 55% or marks below 40% should be high severity.');
assert.equal(metrics.riskLevels.get('S3'), 'No data', 'Invalid dates must not be mistaken for a positive result.');
assert.equal(metrics.riskLevels.get('S4'), 'Low', 'A valid record set without triggered rules has no source alert.');

process.stdout.write('Dashboard metrics checks passed for normalization, duplicate handling, dated records, unique alerts, and severity.\n');
