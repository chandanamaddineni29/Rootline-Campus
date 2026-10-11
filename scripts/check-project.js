'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const directories = ['server', 'assets/js'];
const files = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
}
for (const directory of directories) collect(path.join(root, directory));

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`\n[FAIL] ${path.relative(root, file)}\n${result.stderr}`);
  } else {
    process.stdout.write(`[PASS] ${path.relative(root, file)}\n`);
  }
}
if (failed) process.exitCode = 1;
else process.stdout.write(`\nSyntax check passed for ${files.length} JavaScript files.\n`);
