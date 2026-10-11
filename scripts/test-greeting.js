'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../assets/js/time-greeting.js'), 'utf8');
const browserWindow = {};
vm.runInNewContext(source, { window: browserWindow, Date, Number, RangeError, TypeError, Object });
const greeting = browserWindow.RootlineGreeting;

for (const [hour, expected] of [
  [0, 'Good evening'], [4, 'Good evening'], [5, 'Good morning'], [11, 'Good morning'],
  [12, 'Good afternoon'], [16, 'Good afternoon'], [17, 'Good evening'], [23, 'Good evening']
]) {
  assert.equal(greeting.periodForHour(hour), expected, `local hour ${hour}`);
}

const beforeNoon = new Date(2026, 9, 11, 11, 59, 59, 500);
assert.equal(greeting.millisecondsUntilChange(beforeNoon), 500);
const evening = new Date(2026, 9, 11, 22, 0, 0, 0);
const nextMorning = new Date(2026, 9, 12, 5, 0, 0, 0);
assert.equal(greeting.millisecondsUntilChange(evening), nextMorning.getTime() - evening.getTime());
assert.equal(greeting.displayName({ fullName: 'Taylor Example', username: 'taylor', isDemo: false }), 'Taylor Example');
assert.equal(greeting.displayName({ fullName: 'Demo Faculty', username: 'faculty-demo', isDemo: true }), 'Demo Faculty (Demo account)');
assert.equal(greeting.displayName(null), 'your account');
assert.throws(() => greeting.periodForHour(24), RangeError);

process.stdout.write('Greeting checks passed for morning, afternoon, evening, and local period boundaries.\n');
