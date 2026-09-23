import { defineConfig } from 'vitest/config';
import { testPlugins } from './vitest.shared.js';

export default defineConfig({
  plugins: testPlugins(),
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
