/**
 * Apply migrations to the integration-test database.
 *
 * Runs before the test suite so a fresh clone (or CI) needs one command. The
 * name check is a guard, not a formality: the suite truncates every table.
 */
import { execFileSync } from 'node:child_process';
import 'dotenv/config';

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  console.info('TEST_DATABASE_URL is not set — skipping integration database setup.');
  process.exit(0);
}

if (!/test/i.test(url)) {
  console.error(
    'TEST_DATABASE_URL must name a database containing "test"; refusing to migrate it.',
  );
  process.exit(1);
}

execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});
