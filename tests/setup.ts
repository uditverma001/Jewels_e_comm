import 'dotenv/config';

/**
 * Global test setup.
 *
 * Integration tests must never point at a development database — the suite
 * truncates tables. The guard below makes that mistake impossible rather than
 * merely documented.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (testDatabaseUrl) {
  if (!/test/i.test(testDatabaseUrl)) {
    throw new Error(
      'TEST_DATABASE_URL must point at a database whose name contains "test"; ' +
        'the integration suite truncates every table before it runs.',
    );
  }
  process.env.DATABASE_URL = testDatabaseUrl;
}

// `NODE_ENV` is typed read-only by @types/node; assign through the record.
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-characters-long';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.PAYMENT_PROVIDER = 'fake';
process.env.EMAIL_DRIVER = 'console';
process.env.STORAGE_DRIVER = 'local';

// Sessions, CSRF and rate limiting read `next/headers`, which only exists
// inside a request. Importing this module installs an in-memory stand-in, so
// services can be tested directly instead of being reshaped for the runner.
import './helpers/request-context';
