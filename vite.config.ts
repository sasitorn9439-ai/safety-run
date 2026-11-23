import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { devApi } from './server/dev-api.js';

export default defineConfig({
  plugins: [devApi()],
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), admin: resolve(import.meta.dirname, 'admin.html') } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
