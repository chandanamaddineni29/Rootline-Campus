/* Local-time greeting helpers shared by the dashboard and focused tests. */
(function (root) {
  'use strict';

  function periodForHour(hour) {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RangeError('Hour must be an integer from 0 through 23.');
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function millisecondsUntilChange(now) {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('A valid local Date is required.');
    const next = new Date(now);
    const hour = now.getHours();
    if (hour < 5) next.setHours(5, 0, 0, 0);
    else if (hour < 12) next.setHours(12, 0, 0, 0);
    else if (hour < 17) next.setHours(17, 0, 0, 0);
    else {
      next.setDate(next.getDate() + 1);
      next.setHours(5, 0, 0, 0);
    }
    return next.getTime() - now.getTime();
  }

  function displayName(user) {
    if (!user || typeof user !== 'object') return 'your account';
    const name = String(user.fullName || user.username || '').trim() || 'your account';
    return user.isDemo ? `${name} (Demo account)` : name;
  }

  root.RootlineGreeting = Object.freeze({ periodForHour, millisecondsUntilChange, displayName });
})(window);
