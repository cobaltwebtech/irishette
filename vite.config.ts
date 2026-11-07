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
			// Keep Oxfmt scoped like Biome was: not docs, agent files, generated
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
		],
		jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
		rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
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
