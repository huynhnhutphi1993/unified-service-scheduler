import { defineConfig } from 'vitest/config';
import { testPlugins } from './vitest.shared.js';

export default defineConfig({
  plugins: testPlugins(),
  test: {
    globals: true,
    root: './',
    include: ['test/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
