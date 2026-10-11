/* Application bootstrap: hydrate saved state before loading dependent UI modules. */
(function () {
  'use strict';

  const storageKeys = [
    'campusiq_students',
    'campusiq_actions',
    'campusiq_module_records',
    'campusiq_historical_snapshots',
    'campusiq_import_reconciliation',
    'campusiq_test_data_seeded'
  ];
  const moduleScripts = [
    'assets/js/time-greeting.js',
    'assets/js/modules/01-state-and-configuration.js',
    'assets/js/modules/02-scoring-and-utilities.js',
    'assets/js/modules/03-dashboard-and-journey.js',
    'assets/js/modules/04-students-and-data-workspaces.js',
    'assets/js/modules/05-data-quality-and-import.js',
    'assets/js/modules/06-insights-and-study-support.js',
    'assets/js/modules/07-navigation-and-interventions.js',
    'assets/js/modules/08-demo-authentication.js'
  ];

  async function readApiJson(response) {
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error('The deployed site returned HTML instead of API data. Deploy the Node.js server with `npm start`; static-only hosting is not supported.');
    }
    try {
      return JSON.parse(body);
    } catch (_error) {
      throw new Error('The API returned invalid JSON. Check the server logs for the failed request.');
    }
  }
  window.RootlineApi = { readJson: readApiJson };

  const status = document.createElement('div');
  status.id = 'rootline-db-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'position:fixed;right:16px;bottom:14px;z-index:9999;padding:8px 12px;border:1px solid #dce4ee;border-radius:999px;background:#fff;color:#344054;font:600 12px/1.2 system-ui,sans-serif;box-shadow:0 3px 12px #172b4d12;';
  status.textContent = 'Checking database…';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(status), { once: true });

  function setStatus(message, connected) {
    status.textContent = message;
    status.style.borderColor = connected ? '#b7e4c7' : '#f2d5a0';
    status.style.color = connected ? '#176b3a' : '#8a5b12';
  }

  function collectState() {
    const facultyWritableKeys = new Set(['campusiq_students', 'campusiq_actions', 'campusiq_module_records']);
    return Object.fromEntries(storageKeys
      .filter(key => window.RootlineAuth?.user?.role !== 'faculty' || facultyWritableKeys.has(key))
      .map(key => [key, localStorage.getItem(key)])
      .filter(([, value]) => value !== null));
  }

  async function sync() {
    if (!window.RootlineAuth?.user || window.RootlineAuth.user.role === 'student') return;
    try {
      const response = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: collectState() })
      });
      if (!response.ok) {
        let detail = 'Database save failed.';
        try { detail = (await readApiJson(response)).error || detail; } catch (error) { detail = error.message; }
        setStatus(`Save blocked · ${detail}`, false);
        return;
      }
      setStatus('SQLite database · synced', true);
    } catch (error) {
      console.error('[Rootline] Could not save application data:', error);
      setStatus('SQLite save failed · check your connection', false);
    }
  }

  window.RootlineDatabase = { sync, status: () => status.textContent };
  window.addEventListener('rootline:sync', sync);

  async function hydrateAndStart() {
    let connected = false;
    let authenticatedUser = null;
    for (const key of storageKeys) localStorage.removeItem(key);
    localStorage.removeItem('campusiq_users');
    try {
      const sessionResponse = await fetch('/api/auth/me', { cache: 'no-store' });
      if (sessionResponse.ok) {
        authenticatedUser = (await readApiJson(sessionResponse)).user;
        const stateResponse = await fetch('/api/state', { cache: 'no-store' });
        if (!stateResponse.ok) throw new Error((await readApiJson(stateResponse)).error || 'Saved application data could not be loaded.');
        const payload = await readApiJson(stateResponse);
        if (payload.state && typeof payload.state === 'object') {
          for (const key of storageKeys) {
            if (typeof payload.state[key] === 'string') localStorage.setItem(key, payload.state[key]);
          }
        }
        if (authenticatedUser.role === 'admin') {
          const usersResponse = await fetch('/api/auth/users', { cache: 'no-store' });
          if (!usersResponse.ok) throw new Error((await readApiJson(usersResponse)).error || 'Account directory could not be loaded.');
          window.RootlineInitialUsers = (await readApiJson(usersResponse)).users;
          const classesResponse = await fetch('/api/auth/classes', { cache: 'no-store' });
          if (!classesResponse.ok) throw new Error((await readApiJson(classesResponse)).error || 'Class directory could not be loaded.');
          window.RootlineInitialClasses = (await readApiJson(classesResponse)).classes;
        }
        connected = true;
        setStatus('SQLite database · connected', true);
      } else if (sessionResponse.status !== 401) {
        throw new Error((await readApiJson(sessionResponse)).error || 'Authentication service is unavailable.');
      } else {
        setStatus('Sign in required · SQLite data protected', false);
      }
    } catch (error) {
      console.error('[Rootline] Could not initialize authenticated application data:', error);
      authenticatedUser = null;
      connected = false;
      for (const key of storageKeys) localStorage.removeItem(key);
      setStatus(`Data unavailable · ${error.message}`, false);
    }
    window.RootlineAuth = { user: authenticatedUser };

    for (const source of moduleScripts) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = source;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Could not load ${source}`));
        document.body.appendChild(script);
      });
    }
    if (connected && authenticatedUser.role !== 'student') window.setTimeout(sync, 800);
  }

  hydrateAndStart().catch(error => {
    console.error('[Rootline] Application startup failed:', error);
    setStatus('Application failed to start · check console', false);
  });
})();
