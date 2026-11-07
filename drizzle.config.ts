import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from 'drizzle-kit';

// drizzle-kit is used for `generate`, `check` and `studio` only.
// NEVER run `drizzle-kit migrate` or `push` against D1: they track state in
// `__drizzle_migrations`, while Wrangler/cf apply migrations via `d1_migrations`.
// Apply migrations with `pnpm db:migrate:local` / `pnpm db:migrate:remote`.
//
// Targets:
// - default (local): Studio opens the local Miniflare D1 SQLite file.
// - DB_TARGET=remote: Studio talks to the real D1 database over HTTP using
//   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID and CLOUDFLARE_D1_TOKEN from
//   .env. That token can write: treat remote Studio as production access.

const LOCAL_D1_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

const base = {
	schema: './src/db/schema-export.ts',
	out: './drizzle',
	dialect: 'sqlite',
} as const;

/** Newest local D1 SQLite file (Miniflare names it by hash). */
function findLocalSqlite(): string | undefined {
	if (!existsSync(LOCAL_D1_DIR)) return undefined;
	const files = readdirSync(LOCAL_D1_DIR)
		.filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
		.map((f) => join(LOCAL_D1_DIR, f))
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
	return files[0];
}

function remoteConfig(): Config {
	try {
		process.loadEnvFile('.env');
	} catch {
		// No .env; rely on variables already in the environment.
	}
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const databaseId = process.env.CLOUDFLARE_DATABASE_ID;
	const token = process.env.CLOUDFLARE_D1_TOKEN;
	if (!accountId || !databaseId || !token) {
		throw new Error(
			'DB_TARGET=remote needs CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID and CLOUDFLARE_D1_TOKEN',
		);
	}
	return {
		...base,
		driver: 'd1-http',
		dbCredentials: { accountId, databaseId, token },
	};
}

function localConfig(): Config {
	const file = findLocalSqlite();
	// `generate` and `check` need no credentials, so a missing local DB is fine.
	return file ? { ...base, dbCredentials: { url: `file:${file}` } } : base;
}

export default (process.env.DB_TARGET === 'remote'
	? remoteConfig()
	: localConfig()) satisfies Config;
