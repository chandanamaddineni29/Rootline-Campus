# Architecture Notes

## Runtime sequence

1. `index.html` renders the application shell and loads `assets/js/bootstrap.js`.
2. The bootstrap checks `/api/auth/me`; only a valid server session can load the SQLite-backed application state. Unauthenticated browser storage is cleared before the modules initialize.
3. Frontend modules load in an explicit order so the legacy global functions and inline event handlers remain compatible.
4. User edits are written to browser storage by existing application workflows. The persistence bridge submits supported state keys to authenticated `/api/state`.
5. Express checks the session, role, and (for faculty) assigned student IDs before SQLite state is read or written.

## Backend boundaries

- `server/index.js` owns HTTP middleware, route mounting, static-file serving and graceful shutdown.
- `server/config.js` centralizes the runtime port and filesystem paths.
- `server/routes/api.js` handles academic-state validation and role-scoped persistence.
- `server/routes/auth.js` handles sign-in, logout, account administration, throttling, and session/profile endpoints.
- `server/auth.js` owns scrypt password verification, session-token hashing, cookie settings, and authorization middleware.
- `server/db/database.js` owns the SQLite connection, snapshot storage, password-hash account tables, faculty-to-student assignments, sessions, prepared statements and transactional persistence.
- `scripts/create-admin.js` initializes the first administrator with a generated one-time password.
- `scripts/seed-demo.js` adds repeatable synthetic chart records, a demo administrator if needed, and assignments for the synthetic roster to `faculty002`.

## Current design trade-offs

The frontend still shares state through browser-global variables. The ordered module files reduce file size and clarify responsibility, but they are not isolated ES modules yet. A future migration should replace inline event handlers with event delegation, introduce an explicit application state/service layer, and then convert each feature to ES modules with imports and exports.

The API stores academic profiles, attendance, assessments, and interventions in a serialized state snapshot rather than normalized student and academic record tables. Demo classes, class enrollments, faculty-to-class assignments, and direct faculty-to-student assignments are relational SQLite records. Faculty access is scoped to the union of directly assigned students and students enrolled in assigned classes. The class catalog is synthetic demo data; authoritative course schedules, timetables, and institutional enrollment synchronization are not implemented. Activity events are application/account-level rather than a complete audit of every academic record change.

The overview's attendance rate is attended recorded sessions divided by present, late, and absent sessions; late counts as attended, while excused and undated/invalid sessions are excluded. Average marks normalize each valid dated internal result against its maximum before averaging. Exact student/date/subject attendance duplicates and student/date/assessment/subject assessment duplicates count once. At-risk alerts are distinct students with dated attendance below 65%, dated assessment average below 55%, or a decline of at least 10 percentage points between the two latest dated assessment averages (assessments sharing a date are averaged first). High severity applies when attendance is below 55% or assessment average below 40%; one flagged student is counted only once. Missing or invalid source data is shown separately and is not treated as a positive outcome. Synthetic demo rows are included in these calculations but marked in the KPI context.

The overview filters and charts use the current cohort and source records, but there is no date-range filter, scheduled-assessment model for identifying missing assessments, or production early-warning validation. Department comparisons use normalized dated internal marks. Other legacy analytics and the student directory still include profile-based starter indicators; they must not be presented as official measured outcomes. The snapshot persistence model, lack of class/course records, and incomplete academic audit trail keep this demo unsuitable for institutional decisions or multi-user institutional deployment.

Authentication integration checks use a disposable SQLite directory and exercise setup, password hashing, protected APIs, faculty record scoping, and deactivation. Greeting tests cover local morning, afternoon, evening, and period-boundary calculations. Dashboard metric tests cover normalization, duplicate handling, source-data coverage, unique alert counts, and severity. Run the focused suites with `npm run test:auth`, `npm run test:greeting`, and `npm run test:dashboard-metrics`.

The demo-seed check uses a disposable SQLite directory to verify synthetic coverage for each workspace, faculty assignments, one-time generated passwords, and idempotent reruns. Run it with `npm run test:seed-demo`. Demo credentials are generated at runtime; no password is committed to source.
