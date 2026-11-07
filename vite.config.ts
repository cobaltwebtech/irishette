import { cloudflare } from '@cloudflare/vite-plugin';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const config = defineConfig({
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
		react(),
		babel({ presets: [reactCompilerPreset()] }),
	],
});

export default config;
