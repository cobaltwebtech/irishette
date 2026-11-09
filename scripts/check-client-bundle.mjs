// Fails if a secret variable NAME appears in client assets. Run after build.
// Names only: this never reads or prints secret values.
// Keep SECRET_NAMES in sync with the bindings.secret() entries in
// cloudflare.config.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS_DIR = '.cloudflare/output/v0/workers/default/assets';

const SECRET_NAMES = [
	'BETTER_AUTH_SECRET',
	'STRIPE_SECRET_KEY',
	'STRIPE_TRPC_WEBHOOK_SECRET',
	'RESEND_API_KEY',
	'TURNSTILE_SECRET_KEY',
];

const TEXT_EXT = /\.(js|mjs|cjs|css|html|json|map|txt|svg|xml)$/i;

function* walk(dir) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) yield* walk(full);
		else yield full;
	}
}

let files;
try {
	files = [...walk(ASSETS_DIR)].filter((f) => TEXT_EXT.test(f));
} catch {
	console.error(
		`check-client-bundle: ${ASSETS_DIR} not found. Run a build first.`,
	);
	process.exit(2);
}

const hits = [];
for (const file of files) {
	const contents = readFileSync(file, 'utf8');
	for (const name of SECRET_NAMES) {
		// Better Auth's client bundle ships an env-getter table such as
		// `get BETTER_AUTH_SECRET(){return fn('BETTER_AUTH_SECRET')}`. It reads
		// from an empty object in the browser, so it carries a name, not a value.
		const withoutKnownGetter = contents.replaceAll(
			new RegExp(
				`get ${name}\\(\\)\\{return [\\w$]+\\([\`'"]${name}[\`'"]\\)\\}`,
				'g',
			),
			'',
		);
		if (withoutKnownGetter.includes(name)) hits.push(`${file}: ${name}`);
	}
}

if (hits.length > 0) {
	console.error('Secret variable names found in client assets:');
	for (const hit of hits) console.error(`  ${hit}`);
	process.exit(1);
}
console.log(
	`check-client-bundle: OK (${files.length} client files, ${SECRET_NAMES.length} names checked)`,
);
