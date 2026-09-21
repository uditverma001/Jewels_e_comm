import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside the Next bundler; tests exercise the same
      // modules directly, so it is aliased to a no-op here.
      'server-only': new URL('./tests/server-only-stub.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Integration tests share one Postgres database, so files run sequentially:
    // truncation between files must never race another file's fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
