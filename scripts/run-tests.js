#!/usr/bin/env node
// Cross-platform test runner — finds all .test.js files and passes them to node --test
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, '..', 'out', 'test');
const files = fs.readdirSync(testDir)
    .filter(f => f.endsWith('.test.js'))
    .map(f => path.join(testDir, f));

if (files.length === 0) {
    console.error('No test files found in', testDir);
    process.exit(1);
}

console.log(`Running ${files.length} test suites...\n`);

try {
    execSync(`node --test ${files.map(f => `"${f}"`).join(' ')}`, {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
    });
} catch (e) {
    process.exit(e.status || 1);
}
