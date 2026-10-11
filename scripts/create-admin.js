'use strict';

const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { database, statements } = require('../server/db/database');
const { hashPassword } = require('../server/auth');

async function main() {
  if (statements.listUsers.all().some(user => user.role === 'admin' && user.active)) {
    throw new Error('An active administrator already exists. Use administrator account management instead.');
  }
  const terminal = readline.createInterface({ input: stdin, output: stdout });
  try {
    const username = String(process.env.ROOTLINE_ADMIN_USERNAME || await terminal.question('Administrator username: ')).trim();
    const fullName = String(process.env.ROOTLINE_ADMIN_NAME || await terminal.question('Administrator full name: ')).trim();
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) throw new Error('Username must be 3–50 letters, numbers, dots, underscores, or hyphens.');
    if (fullName.length < 2 || fullName.length > 120) throw new Error('Full name must contain 2–120 characters.');
    if (statements.findUser.get(username)) throw new Error('That username is already in use.');
    const password = crypto.randomBytes(24).toString('base64url');
    const result = statements.createUser.run({
      username,
      fullName,
      role: 'admin',
      passwordHash: hashPassword(password),
      active: 1,
      isDemo: process.env.NODE_ENV === 'production' ? 0 : 1,
      department: '',
      linkedStudentId: '',
      createdAt: new Date().toISOString()
    });
    statements.addActivity.run('administrator_created', new Date().toISOString(), JSON.stringify({ username, userId: result.lastInsertRowid }));
    stdout.write('\nAdministrator account created. The generated password is shown once:\n');
    stdout.write(`Username: ${username}\nPassword: ${password}\n`);
    stdout.write('Store it in a password manager; the application stores only its scrypt hash.\n');
  } finally {
    terminal.close();
  }
}

main().catch(error => {
  console.error(`[Rootline] ${error.message}`);
  process.exitCode = 1;
}).finally(() => database.close());
