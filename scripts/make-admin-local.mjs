#!/usr/bin/env node
// Promote an existing LOCAL user to admin.
// Usage: pnpm db:make-admin:local <email>
// Only ever touches the local D1 database (--local).
import { spawnSync } from 'node:child_process';

const email = process.argv[2]?.trim();

if (!email || !/^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/.test(email)) {
	console.error('Usage: pnpm db:make-admin:local <email>');
	process.exit(1);
}

const sql = `UPDATE user SET role = 'admin' WHERE email = '${email}'; SELECT id, email, role FROM user WHERE email = '${email}';`;

const result = spawnSync(
	'pnpm',
	['wrangler', 'd1', 'execute', 'DB', '--local', '--command', sql],
	{ stdio: 'inherit', env: { ...process.env, CI: '1' } },
);

process.exit(result.status ?? 1);
