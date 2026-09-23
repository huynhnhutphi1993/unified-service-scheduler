import { defineConfig } from 'vitest/config';
import { testPlugins } from './vitest.shared.js';

export default defineConfig({
  plugins: testPlugins(),
  test: {
    globals: true,
    include: ['test/integration/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 60000,
  },
});
