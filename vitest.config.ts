import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['web/tests/*.test.ts', 'tools/tests/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
