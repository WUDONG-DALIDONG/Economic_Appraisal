import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    environmentMatchGlobs: [
      ['packages/frontend/**', 'jsdom'],
    ],
    deps: {
      inline: ['better-sqlite3', 'vm2'],
    },
  },
});