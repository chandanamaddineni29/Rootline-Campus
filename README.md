# Rootline Campus Analytics

A campus analytics demonstration for reviewing student-success indicators, exploring cohorts, identifying data-quality issues, and coordinating student-support interventions. The project includes a browser frontend and a local Node.js/SQLite persistence API.

## Architecture

```text
rootline-campus-analytics/
├── index.html                         # Application shell and page markup
├── assets/
│   ├── css/
│   │   └── styles.css                 # Design system, layout and responsive styling
│   └── js/
│       ├── bootstrap.js               # Restores saved state and loads application modules
│       └── modules/
│           ├── 01-state-and-configuration.js
│           ├── 02-scoring-and-utilities.js
│           ├── 03-dashboard-and-journey.js
│           ├── 04-students-and-data-workspaces.js
│           ├── 05-data-quality-and-import.js
│           ├── 06-insights-and-study-support.js
│           ├── 07-navigation-and-interventions.js
│           └── 08-demo-authentication.js
├── server/
│   ├── index.js                       # HTTP server and middleware
│   ├── config.js                      # Paths and runtime configuration
│   ├── routes/
│   │   └── api.js                     # Health, state and activity endpoints
│   └── db/
│       └── database.js                # SQLite schema and prepared statements
├── scripts/
│   └── check-project.js               # Syntax checks for project JavaScript
├── docs/
│   └── reference/
│       └── Rootline-Campus-Analytics-original.html  # Original single-file reference
├── data/                              # Created at runtime; database is not committed
├── package.json
├── .editorconfig
└── .gitignore
```

### Frontend module responsibilities

| Module | Responsibility |
| --- | --- |
| `01-state-and-configuration.js` | Demo records, browser-state hydration helpers, configuration and methodology export |
| `02-scoring-and-utilities.js` | Score calculation, risk rules, normalization and shared UI utilities |
| `03-dashboard-and-journey.js` | Dashboard metrics, cohorts, analytics and student journey views |
| `04-students-and-data-workspaces.js` | Student profiles, source data workspaces and record editing |
| `05-data-quality-and-import.js` | CSV import validation, preview, reconciliation and quality findings |
| `06-insights-and-study-support.js` | Rule-based insight responses and study guidance |
| `07-navigation-and-interventions.js` | Navigation, dialogs, intervention workflows and exports |
| `08-demo-authentication.js` | Demo role switching and login-screen behavior |

The frontend modules are currently loaded as ordered classic scripts because the existing markup uses inline event handlers and shared global functions. This is an intentional compatibility step; a future refactor can move these responsibilities into ES modules and explicit state/services once inline handlers are removed.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`. The server creates `data/rootline.sqlite` on first run. Do not open `index.html` directly if you want SQLite persistence; use the local server URL.

### Deploying

Deploy the full Node.js application as a web service (Node.js 20+), not as a static site. In your host's service settings, use this project directory as the service root, `npm install` as the build/install command, and `npm start` as the start command. Do not configure a static publish directory or deploy only the frontend files.

The frontend calls same-origin `/api/*` endpoints served by Express. If a request to `/api/health` returns HTML instead of JSON, the host is serving the static site or an error page rather than running this Node.js service. After deployment, check that `/api/health` returns JSON with `"ok": true`. The server listens on the platform-provided `PORT` and on all network interfaces by default.

SQLite requires writable persistent storage. Configure a persistent disk and set `ROOTLINE_DATA_DIRECTORY` to its mount path so the database survives restarts. After the service is running, create the initial administrator with `npm run create-admin` in the deployed service environment.

### First administrator account

No shared administrator username or password is shipped in the application. Before signing in for the first time, run:

```bash
npm run create-admin
```

Choose a username and display name when prompted. The command generates a random, one-time password and prints it once. Store it securely. The password is stored as a scrypt hash; it cannot be recovered from the database. In a non-production environment, this initial account is labeled as a demo account. Administrators can create additional accounts, assign faculty access to specific student records, deactivate accounts, and reset passwords from User management.

`ROOTLINE_DATA_DIRECTORY` can point the application and setup command at a separate data folder. This is useful for isolated test runs and local demo instances.

### Seed presentation data and demo accounts

After the application has saved its starter student roster to SQLite, seed a repeatable synthetic dataset:

```bash
npm run seed:demo
```

The seed adds six clearly synthetic student profiles, dated attendance and assessment records for the synthetic roster, semester/LMS/placement/activity/feedback examples, and historical chart snapshots. It also creates synthetic department/year course sections, enrolls the roster into those classes, assigns the classes and students to the existing demo faculty account `faculty002`, and creates a linked student account `student.demo`. The extra record `STU-1099` is left unchanged and unassigned. Administrators can also assign classes to faculty from User management; the server scopes their accessible students to those enrolled in their assigned classes.

The seeded reviewer accounts use the shared demo password `Rootline123`: `admin.demo` (Administrator), `faculty002` (Faculty), and `student.demo` (Student). These credentials are also listed on the sign-in page. The seed ensures these demo accounts have that password; custom and production accounts are not changed. Passwords are stored only as scrypt hashes. To reapply the shared password and revoke active demo sessions:

```bash
npm run seed:demo -- --rotate-passwords
```

The command prints the shared demo credentials and revokes the demo accounts' active sessions. These shared credentials are for local synthetic demo accounts only and are not suitable for production. To clear/reset demo data, use a separate `ROOTLINE_DATA_DIRECTORY` rather than deleting an existing database.

For development with automatic server restart:

```bash
npm run dev
```

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service health information |
| `GET` | `/api/auth/me` | Return the signed-in account profile |
| `POST` | `/api/auth/login` | Verify credentials and start a session |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/auth/users` | List accounts (administrator only) |
| `GET` | `/api/auth/classes` | List assignable classes (administrator only) |
| `POST` | `/api/auth/users` | Create an account with an scrypt password hash (administrator only) |
| `PATCH` | `/api/auth/users/:id` | Activate or deactivate an account (administrator only) |
| `PUT` | `/api/auth/users/:id/password` | Reset an account password (administrator only) |
| `GET` | `/api/state` | Read the authenticated role's SQLite-backed state view |
| `PUT` | `/api/state` | Persist supported state keys; faculty writes are limited to assigned student IDs |
| `GET` | `/api/activity` | Return recent activity (administrator only) |

## Quality checks

```bash
npm run check
```

This runs `node --check` against JavaScript files in the server and frontend. It verifies syntax, not full browser behavior or database integration tests.

Focused demo and analytics checks:

```bash
npm run test:seed-demo
npm run test:dashboard-metrics
npm run test:auth
npm run test:greeting
```

The isolated demo-seed test verifies workspace data, class/student assignments, all three demo roles, the shared demo password hash, and idempotent reruns.

## Data and security notes

This is a local demonstration, not production-ready student information software. Login now uses server-side scrypt password hashes, random opaque sessions in SQLite, HttpOnly/SameSite cookies, session expiry, login throttling, and server-side role checks. Faculty state views and writes are restricted to their assigned student IDs. Legacy browser-stored demo account passwords are migrated to password hashes and removed from the saved state when the server starts. All application academic data still uses a shared JSON snapshot in SQLite rather than normalized student, class, attendance, and assessment tables. Faculty assignments therefore scope student records, not real class/course enrollments.

Use only synthetic demonstration data and never enter real student data or production credentials. The local SQLite database is not a cloud database or an institutional system connector. The current dataset and rule-based indicators are not a trained or validated predictive model. Production deployment still requires an institutional identity provider, secure TLS and secret management, normalized academic records and audit retention, operational backup/recovery, independent security review, and validated analytics.

The insight assistant and risk labels use configured rules and indicators. They are not a trained or validated predictive model. Synthetic records are for demonstration only and should not be interpreted as official student records.

## Git workflow

Keep `main` stable and make focused changes on short-lived branches, for example:

- `feature/dashboard-polish`
- `feature/student-profiles`
- `feature/data-workspaces`
- `feature/intervention-tracking`
- `chore/accessibility-and-quality`

Commit small, reviewable changes and run `npm run check` before pushing. These are suggested branch names, not pre-created branches.
