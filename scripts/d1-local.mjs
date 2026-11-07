#!/usr/bin/env node
// LOCAL D1 helpers. Always passes --local and the project state dir, so these
// commands can never touch the remote database.
//
//   node scripts/d1-local.mjs migrate            apply ./drizzle migrations
//   node scripts/d1-local.mjs seed               run scripts/seed-local.sql
//   node scripts/d1-local.mjs make-admin <email> promote an existing user
//
// Exposed as pnpm db:migrate:local, db:seed:local, db:make-admin:local.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Must match DB in cloudflare.config.ts.
const DATABASE_ID = '7a52bbfc-592e-4792-990e-6a5e51ca8cbd';
// Same dir @cloudflare/vite-plugin v2 uses for `pnpm dev` (.cloudflare/state/v3).
const PERSIST_TO = '.cloudflare/state';
const LOCAL = ['--local', '--persist-to', PERSIST_TO];

function cf(args) {
	const result = spawnSync('cf', args, { stdio: 'inherit' });
	if (result.error) {
		console.error(result.error.message);
		process.exit(1);
	}
	if (result.status !== 0) process.exit(result.status ?? 1);
}

/** `--sql=<value>` keeps SQL that starts with `--` from being read as a flag. */
function raw(sql, params = []) {
	const args = ['d1', 'raw', DATABASE_ID, ...LOCAL, `--sql=${sql}`];
	if (params.length > 0) args.push('--params', ...params);
	cf(args);
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
	case 'migrate':
		cf([
			'd1',
			'migrations',
			'apply',
			DATABASE_ID,
			'--dir',
			'./drizzle',
			...LOCAL,
		]);
		break;
	case 'seed':
		raw(readFileSync('scripts/seed-local.sql', 'utf8'));
		break;
	case 'make-admin': {
		const email = rest[0]?.trim();
		if (!email?.includes('@')) {
			console.error('Usage: pnpm db:make-admin:local <email>');
			process.exit(1);
		}
		raw("UPDATE user SET role = 'admin' WHERE email = ?", [email]);
		raw('SELECT id, email, role FROM user WHERE email = ?', [email]);
		break;
	}
	default:
		console.error(
			'Usage: node scripts/d1-local.mjs <migrate|seed|make-admin <email>>',
		);
		process.exit(1);
}
