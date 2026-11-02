import { defineConfig } from 'vitest/config';

const bench = Boolean(process.env.LEDGER_BENCH);

export default defineConfig({
  test: {
    include: bench ? ['bench/**/*.perf.ts'] : ['test/**/*.test.ts'],
    testTimeout: bench ? 120_000 : 30_000,
  },
});
