import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./entrypoints/content/search.test-setup.ts'],
  },
});
