import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const config = defineConfig({
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
	plugins: [
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
	],
});

export default config;
