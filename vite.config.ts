import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, lazyPlugins } from 'vite-plus';

const config = defineConfig({
	fmt: {
		useTabs: true,
		singleQuote: true,
		printWidth: 80,
		overrides: [{ files: ['**/*.css'], options: { singleQuote: false } }],
		sortImports: {
			internalPattern: ['@/'],
		},
		sortTailwindcss: {
			stylesheet: './src/styles/styles.css',
			functions: ['cn', 'cva', 'clsx'],
		},
		ignorePatterns: [
			'src/routeTree.gen.ts',
			'worker-configuration.d.ts',
			'.tanstack',
			'**/dist',
			// Keep Oxfmt scoped to code: not docs, agent files, generated
			// output, migrations or root config/manifest files.
			'.agents',
			'.claude',
			'.zed',
			'.fallow',
			'docs',
			'drizzle',
			'public',
			'/*.md',
			'/*.json',
			'/*.jsonc',
			'/*.yaml',
			'/varlock.d.ts',
			'/drizzle.config.ts',
			'/cloudflare.config.ts',
		],
	},
	lint: {
		plugins: ['typescript', 'unicorn', 'oxc', 'react', 'jsx-a11y'],
		categories: { correctness: 'error' },
		ignorePatterns: [
			'src/routeTree.gen.ts',
			'.tanstack/**',
			'.cloudflare/**',
			// Typed by e2e/tsconfig.json (root tsconfig excludes it).
			'playwright.config.ts',
			// Installed agent skills (vendored; some ship example .tsx assets).
			'.agents/**',
			'.claude/**',
		],
		jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
		rules: {
			'vite-plus/prefer-vite-plus-imports': 'error',
			'unicorn/no-document-cookie': 'error',
			// The React Compiler skips components that break these rules. Read the
			// clock with useNow() (src/utils/use-now.ts), not `new Date()` in render.
			'react/purity': 'error',
			'react/set-state-in-effect': 'error',
		},
		options: { typeAware: true, typeCheck: true },
	},
	// `cf dev` does not forward --port, so pin it here.
	server: {
		port: 3000,
		strictPort: true,
	},
	// Varlock is the only env source. Stops @cloudflare/vite-plugin (and Vite)
	// from reading .env*/.dev.vars files, where encrypted values appear as
	// literal `varlock("local:...")` text. Values arrive via process.env.
	envDir: false,
	resolve: {
		tsconfigPaths: true,
	},
	build: {
		rolldownOptions: {
			// The Vite+ core (not stock Vite 8) warns that `vite:css-post` emits no
			// sourcemap for `styles.css?url` (Tailwind) in the server build. That
			// import only resolves to a URL string there, so the missing CSS map is
			// harmless. Drop only this exact warning; all other logs still print.
			onLog(level, log, handler) {
				if (log.code === 'SOURCEMAP_BROKEN' && log.plugin === 'vite:css-post') {
					return;
				}
				handler(level, log);
			},
		},
	},
	plugins: lazyPlugins(() => [
		cloudflare({
			viteEnvironment: {
				name: 'ssr',
			},
		}),
		tailwindcss(),
		tanstackStart({
			srcDirectory: 'src',
			start: { entry: './start.tsx' },
			server: { entry: './server.ts' },
		}),
		// React Compiler via the Rust port (oxc-transform-react); no Babel.
		react({ compiler: true }),
	]),
});

export default config;
