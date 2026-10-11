'use strict';

const { database, statements } = require('../server/db/database');
const { hashPassword, verifyPassword } = require('../server/auth');

const DEFAULT_DEMO_PASSWORD = 'Rootline123';

const demoProfiles = [
  { id: 'DEMO-2601', name: 'Nila Rao', dept: 'Computer Science', year: '2nd Year', cgpa: 8.1, backlogs: 0, attendance: 86, lms: 82, engagement: 79, placement: 0, skills: 80, academic: 84 },
  { id: 'DEMO-2602', name: 'Dev Malhotra', dept: 'Electronics', year: '3rd Year', cgpa: 6.7, backlogs: 2, attendance: 61, lms: 55, engagement: 48, placement: 0, skills: 58, academic: 52 },
  { id: 'DEMO-2603', name: 'Tara Kulkarni', dept: 'Information Technology', year: '4th Year', cgpa: 8.7, backlogs: 0, attendance: 93, lms: 90, engagement: 86, placement: 82, skills: 88, academic: 89 },
  { id: 'DEMO-2604', name: 'Neil Fernandes', dept: 'Mechanical', year: '2nd Year', cgpa: 7.1, backlogs: 1, attendance: 74, lms: 68, engagement: 62, placement: 0, skills: 65, academic: 70 },
  { id: 'DEMO-2605', name: 'Aisha Menon', dept: 'Electrical', year: '4th Year', cgpa: 5.9, backlogs: 3, attendance: 52, lms: 44, engagement: 39, placement: 38, skills: 42, academic: 43 },
  { id: 'DEMO-2606', name: 'Ritvik Das', dept: 'Civil', year: '3rd Year', cgpa: 7.8, backlogs: 0, attendance: 89, lms: 84, engagement: 76, placement: 0, skills: 81, academic: 78 }
];

const demoSubjects = {
  'Computer Science': 'Data Structures',
  Electronics: 'Digital Electronics',
  'Information Technology': 'Database Systems',
  Mechanical: 'Engineering Mechanics',
  Electrical: 'Circuit Analysis',
  Civil: 'Structural Analysis'
};
const departmentCodes = {
  'Computer Science': 'CSE',
  Electronics: 'ECE',
  'Information Technology': 'IT',
  Mechanical: 'ME',
  Electrical: 'EE',
  Civil: 'CE'
};
const attendanceDates = ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-02', '2026-10-09'];
const assessmentDates = ['2026-08-28', '2026-09-11', '2026-10-02'];

function createDemoRecords(student, index) {
  const subject = demoSubjects[student.dept] || 'Campus Foundations';
  const records = {
    attendance: [],
    internal: [],
    semester: [],
    lms: [],
    placement: [],
    extra: [],
    feedback: []
  };
  attendanceDates.forEach((date, sessionIndex) => {
    const attended = ((sessionIndex * 37 + index * 17) % 100) < Number(student.attendance);
    const status = attended ? (sessionIndex === 3 && index % 3 === 0 ? 'Late' : 'Present') : 'Absent';
    records.attendance.push({
      _id: `DEMO-SEED-ATT-${student.id}-${date}`,
      studentId: student.id,
      date,
      subject,
      status,
      attendancePercent: student.attendance,
      notes: 'Synthetic Rootline demo attendance record',
      demo: true
    });
  });

  assessmentDates.forEach((date, assessmentIndex) => {
    const baseline = Number(student.academic);
    const drift = index % 5 === 1 && assessmentIndex === 2
      ? -15
      : assessmentIndex === 0 ? 3 : assessmentIndex === 1 ? 1 : 0;
    const percent = Math.max(10, Math.min(98, baseline + drift));
    records.internal.push({
      _id: `DEMO-SEED-MARK-${student.id}-${assessmentIndex + 1}`,
      studentId: student.id,
      date,
      assessment: `Demo Assessment ${assessmentIndex + 1}`,
      subject,
      marks: percent,
      maxMarks: 100,
      remarks: 'Synthetic Rootline demo assessment',
      demo: true
    });
  });

  const yearNumber = Number.parseInt(student.year, 10) || 1;
  for (let semester = 1; semester <= yearNumber * 2; semester += 1) {
    const academicYear = semester <= 2 ? '2024-25' : semester <= 4 ? '2025-26' : '2026-27';
    const marks = Math.max(25, Math.min(98, Math.round(Number(student.academic) + ((semester % 3) - 1) * 3)));
    records.semester.push({
      _id: `DEMO-SEED-SEM-${student.id}-${semester}`,
      studentId: student.id,
      academicYear,
      semester,
      examSession: `Semester ${semester} (synthetic demo)`,
      marks,
      sgpa: Math.round(marks / 10 * 10) / 10,
      cgpa: Number(student.cgpa),
      backlogs: Number(student.backlogs),
      result: student.backlogs ? 'Review' : 'Pass',
      demo: true
    });
  }

  records.lms.push({
    _id: `DEMO-SEED-LMS-${student.id}`,
    studentId: student.id,
    date: '2026-10-08',
    course: subject,
    logins: 5 + index * 2,
    assignmentsCompleted: Math.max(1, Math.round(Number(student.lms) / 10)),
    assignmentsTotal: 10,
    quizAverage: Number(student.lms),
    notes: 'Synthetic Rootline demo LMS record',
    demo: true
  });
  if (student.year === '4th Year') {
    records.placement.push({
      _id: `DEMO-SEED-PLACEMENT-${student.id}`,
      studentId: student.id,
      date: '2026-10-07',
      program: 'Demo career-readiness clinic',
      sessionsAttended: Math.round(Number(student.placement) / 10),
      sessionsTotal: 10,
      mockScore: Number(student.placement),
      certification: '',
      status: 'In progress',
      demo: true
    });
  }
  records.extra.push({
    _id: `DEMO-SEED-EXTRA-${student.id}`,
    studentId: student.id,
    date: '2026-09-12',
    activity: 'Synthetic Campus Innovation Day',
    category: 'Technical',
    role: index % 2 ? 'Participant' : 'Team member',
    achievement: 'Synthetic demo participation',
    hours: 2 + index,
    demo: true
  });
  records.feedback.push({
    _id: `DEMO-SEED-FEEDBACK-${student.id}`,
    studentId: student.id,
    date: '2026-10-06',
    category: 'Student support',
    rating: index % 5 + 1,
    comments: 'Synthetic feedback for demonstrating the support workflow.',
    followup: index % 3 ? 'No' : 'In progress',
    demo: true
  });
  return records;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function buildSnapshots(roster, records) {
  return ['2026-09-11', '2026-10-02', '2026-10-09'].map(date => {
    const marks = records.internal.filter(record => record.date <= date).map(record => record.marks / record.maxMarks * 100);
    const attendance = records.attendance.filter(record => record.date <= date && ['Present', 'Late', 'Absent'].includes(record.status));
    const attended = attendance.filter(record => record.status === 'Present' || record.status === 'Late').length;
    return {
      id: `DEMO-SEED-SNAPSHOT-${date}`,
      date,
      createdAt: `${date}T12:00:00.000Z`,
      studentCount: roster.length,
      avgScore: average(marks) === null ? null : average(marks).toFixed(1),
      avgAttendance: attendance.length ? Number((100 * attended / attendance.length).toFixed(1)) : null,
      avgAcademic: average(marks) === null ? null : average(marks).toFixed(1),
      departments: [...new Set(roster.map(student => student.dept))].sort().map(dept => {
        const departmentMarks = records.internal.filter(record => record.date <= date
          && roster.find(student => student.id === record.studentId)?.dept === dept)
          .map(record => record.marks / record.maxMarks * 100);
        return { dept, count: departmentMarks.length, avgScore: average(departmentMarks) };
      }),
      demo: true
    };
  });
}

function main() {
  const rotatePasswords = process.argv.includes('--rotate-passwords');
  const stateRow = statements.getState.get();
  if (!stateRow) throw new Error('No saved application data exists. Sign in once to initialize the SQLite demo state, then rerun this command.');

  const state = JSON.parse(stateRow.state_json);
  const roster = JSON.parse(state.campusiq_students || '[]');
  const modules = JSON.parse(state.campusiq_module_records || '{}');
  const actions = JSON.parse(state.campusiq_actions || '[]');
  const snapshots = JSON.parse(state.campusiq_historical_snapshots || '[]');
  if (!Array.isArray(roster) || !modules || typeof modules !== 'object' || Array.isArray(modules)) {
    throw new Error('Saved student or module data has an unexpected shape; demo data was not changed.');
  }
  for (const key of ['attendance', 'internal', 'semester', 'lms', 'placement', 'extra', 'feedback']) {
    if (!Array.isArray(modules[key])) modules[key] = [];
  }

  const generatedRoster = roster.filter(student => /^STU-10(?:0[1-9]|1[0-8])$/.test(String(student.id)));
  if (generatedRoster.length < 18) {
    throw new Error('The expected 18-student synthetic starter roster is incomplete; no records were written.');
  }
  const studentsById = new Map(roster.map(student => [String(student.id), student]));
  for (const student of demoProfiles) {
    const current = studentsById.get(student.id);
    if (current && current.name !== student.name) {
      throw new Error(`Student ID ${student.id} already belongs to a different profile; no records were written.`);
    }
    if (!current) {
      roster.push({ ...student, demo: true });
      studentsById.set(student.id, roster[roster.length - 1]);
    }
  }
  const demoRoster = [...generatedRoster, ...demoProfiles.map(student => studentsById.get(student.id))];
  const knownSemesterRows = new Set(modules.semester.map(record =>
    `${record.studentId}|${record.academicYear}|${record.semester}`));
  demoRoster.forEach((student, index) => {
    const generated = createDemoRecords(student, index);
    for (const [group, rows] of Object.entries(generated)) {
      const existingIds = new Set(modules[group].map(record => record && String(record._id || '')));
      for (const record of rows) {
        if (existingIds.has(record._id)) continue;
        if (group === 'semester') {
          const semesterKey = `${record.studentId}|${record.academicYear}|${record.semester}`;
          if (knownSemesterRows.has(semesterKey)) continue;
          knownSemesterRows.add(semesterKey);
        }
        modules[group].push(record);
      }
    }
  });

  const seedRosterRecords = Object.values(modules).flat().filter(record => record?.demo === true);
  const newSnapshots = buildSnapshots(demoRoster, {
    attendance: modules.attendance.filter(record => demoRoster.some(student => student.id === record.studentId)),
    internal: modules.internal.filter(record => demoRoster.some(student => student.id === record.studentId))
  });
  const snapshotsById = new Set(snapshots.map(snapshot => String(snapshot.id || '')));
  for (const snapshot of newSnapshots) if (!snapshotsById.has(snapshot.id)) snapshots.push(snapshot);

  const faculty = statements.findUser.get('faculty002');
  if (!faculty || faculty.role !== 'faculty' || !faculty.isDemo) {
    throw new Error('Expected faculty002 to be an existing demo faculty account; no accounts or assignments were changed.');
  }
  const admin = statements.findUser.get('admin.demo');
  if (admin && (admin.role !== 'admin' || !admin.isDemo)) {
    throw new Error('Username admin.demo is already used by a non-demo or non-administrator account.');
  }
  const demoStudent = statements.findUser.get('student.demo');
  if (demoStudent && (demoStudent.role !== 'student' || !demoStudent.isDemo || demoStudent.linkedStudentId !== 'DEMO-2601')) {
    throw new Error('Username student.demo is already used by an account that is not the designated demo student.');
  }
  if (!studentsById.has('DEMO-2601')) throw new Error('The student profile for student.demo does not exist.');

  const classMap = new Map();
  for (const student of demoRoster) {
    const code = departmentCodes[student.dept];
    const courseName = demoSubjects[student.dept];
    const yearLabel = String(student.year || '');
    if (!code || !courseName || !/^[1-4](st|nd|rd|th) Year$/.test(yearLabel)) {
      throw new Error(`Cannot create a class for ${student.id}: department or year is unsupported.`);
    }
    const suffix = yearLabel.match(/^\d+/)?.[0];
    const classId = `DEMO-CLS-${code}-${suffix}`;
    if (!classMap.has(classId)) {
      classMap.set(classId, {
        id: classId,
        code: `${code}-${suffix}01`,
        name: courseName,
        department: student.dept,
        yearLabel,
        studentIds: []
      });
    }
    classMap.get(classId).studentIds.push(student.id);
  }

  const timestamp = new Date().toISOString();
  const transaction = database.transaction(() => {
    let adminId;
    if (!admin) {
      const result = statements.createUser.run({
        username: 'admin.demo',
        fullName: 'Rootline Demo Administrator',
        role: 'admin',
        passwordHash: hashPassword(DEFAULT_DEMO_PASSWORD),
        active: 1,
        isDemo: 1,
        department: '',
        linkedStudentId: '',
        createdAt: timestamp
      });
      adminId = result.lastInsertRowid;
    } else {
      adminId = admin.id;
      if (rotatePasswords || !verifyPassword(DEFAULT_DEMO_PASSWORD, admin.passwordHash)) {
        statements.setPassword.run(hashPassword(DEFAULT_DEMO_PASSWORD), adminId);
        database.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(adminId);
      }
      database.prepare('UPDATE users SET active = 1 WHERE id = ?').run(adminId);
    }
    let studentId;
    if (!demoStudent) {
      const result = statements.createUser.run({
        username: 'student.demo',
        fullName: studentsById.get('DEMO-2601').name,
        role: 'student',
        passwordHash: hashPassword(DEFAULT_DEMO_PASSWORD),
        active: 1,
        isDemo: 1,
        department: studentsById.get('DEMO-2601').dept,
        linkedStudentId: 'DEMO-2601',
        createdAt: timestamp
      });
      studentId = result.lastInsertRowid;
    } else {
      studentId = demoStudent.id;
      database.prepare('UPDATE users SET active = 1 WHERE id = ?').run(studentId);
      if (rotatePasswords || !verifyPassword(DEFAULT_DEMO_PASSWORD, demoStudent.passwordHash)) {
        statements.setPassword.run(hashPassword(DEFAULT_DEMO_PASSWORD), studentId);
        database.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(studentId);
      }
    }
    if (rotatePasswords || !verifyPassword(DEFAULT_DEMO_PASSWORD, faculty.passwordHash)) {
      statements.setPassword.run(hashPassword(DEFAULT_DEMO_PASSWORD), faculty.id);
      database.prepare('UPDATE users SET active = 1 WHERE id = ?').run(faculty.id);
      database.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(faculty.id);
    } else {
      database.prepare('UPDATE users SET active = 1 WHERE id = ?').run(faculty.id);
    }

    const assignments = database.prepare('INSERT OR IGNORE INTO user_student_assignments (user_id, student_id) VALUES (?, ?)');
    for (const student of demoRoster) assignments.run(faculty.id, student.id);
    const upsertClass = database.prepare(`
      INSERT INTO academic_classes (class_id, course_code, course_name, department, year_label, is_demo)
      VALUES (@id, @code, @name, @department, @yearLabel, 1)
      ON CONFLICT(class_id) DO UPDATE SET course_code=excluded.course_code,
        course_name=excluded.course_name, department=excluded.department,
        year_label=excluded.year_label, is_demo=1
    `);
    const deleteEnrollments = database.prepare('DELETE FROM class_enrollments WHERE class_id = ?');
    const enrollStudent = database.prepare('INSERT OR IGNORE INTO class_enrollments (class_id, student_id) VALUES (?, ?)');
    for (const item of classMap.values()) {
      upsertClass.run(item);
      deleteEnrollments.run(item.id);
      for (const studentId of item.studentIds) enrollStudent.run(item.id, studentId);
      statements.addUserClass.run(faculty.id, item.id);
    }
    state.campusiq_students = JSON.stringify(roster);
    state.campusiq_module_records = JSON.stringify(modules);
    state.campusiq_actions = JSON.stringify(actions);
    state.campusiq_historical_snapshots = JSON.stringify(snapshots);
    state.campusiq_test_data_seeded = 'yes';
    statements.putState.run(JSON.stringify(state), timestamp);
    statements.addActivity.run('demo_dataset_seeded', timestamp, JSON.stringify({
      studentsAdded: demoProfiles.filter(student => !generatedRoster.some(existing => existing.id === student.id)).length,
      studentsAssignedTo: 'faculty002',
      assignedCount: demoRoster.length,
      assignedClasses: classMap.size,
      studentLoginLinkedTo: 'DEMO-2601',
      generatedSourceRecords: seedRosterRecords.length,
      semesterRows: modules.semester.filter(record => String(record._id || '').startsWith('DEMO-SEED-SEM-')).length
    }));
  });
  transaction();

  process.stdout.write('Synthetic presentation dataset is ready.\n');
  process.stdout.write(`Students in administrator directory: ${roster.length}\n`);
  process.stdout.write(`Synthetic students assigned to faculty002: ${demoRoster.length}\n`);
  process.stdout.write(`Synthetic classes assigned to faculty002: ${classMap.size}\n`);
  process.stdout.write(`Records by workspace: ${Object.entries(modules).map(([key, rows]) => `${key}=${rows.length}`).join(', ')}\n`);
  process.stdout.write(`Dated trend snapshots available: ${snapshots.length}\n`);
  process.stdout.write('\nDemo sign-in credentials (synthetic accounts only):\n');
  process.stdout.write(`Administrator | admin.demo | ${DEFAULT_DEMO_PASSWORD}\n`);
  process.stdout.write(`Faculty | faculty002 | ${DEFAULT_DEMO_PASSWORD}\n`);
  process.stdout.write(`Student | student.demo | ${DEFAULT_DEMO_PASSWORD}\n`);
  if (rotatePasswords) process.stdout.write('Demo passwords were reset and active demo sessions were revoked.\n');
  process.stdout.write('All generated academic records are marked synthetic demo data.\n');
}

try {
  main();
} catch (error) {
  console.error(`[Rootline demo seed] ${error.message}`);
  process.exitCode = 1;
} finally {
  database.close();
}
