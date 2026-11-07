import path from 'node:path';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode || 'development', process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [
      tailwindcss(),
      sveltekit({
        compilerOptions: {
          runes: ({ filename }) =>
            filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
        },
        adapter: adapter(),
      }),
    ],
    resolve: {
      alias: {
        $convex: path.resolve('./convex'),
      },
    },
    server: {
      strictPort: true,
      allowedHosts: true,
    },
    preview: {
      strictPort: true,
      allowedHosts: true,
    },
    test: {
      expect: { requireAssertions: true },
      projects: [
        {
          extends: './vite.config.ts',
          server: {
            strictPort: false,
          },
          test: {
            name: 'client',
            browser: {
              enabled: true,
              provider: playwright(),
              instances: [{ browser: 'chromium', headless: true }],
            },
            include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
            exclude: ['src/lib/server/**'],
          },
        },
        {
          extends: './vite.config.ts',
          test: {
            name: 'server',
            environment: 'node',
            include: ['src/**/*.{test,spec}.{js,ts}'],
            exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
          },
        },
      ],
    },
  };
});
