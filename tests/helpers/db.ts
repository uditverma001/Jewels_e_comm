import { PrismaClient } from '@prisma/client';

/**
 * Integration-test database helpers.
 *
 * The suite runs against a real Postgres because the things worth testing here
 * — atomic stock reservation, transactional order creation, unique-constraint
 * idempotency — only exist in the database. A mocked Prisma client would test
 * the mock.
 */
export const testDb = new PrismaClient({ log: ['error'] });

/**
 * Truncate every table except the migration ledger.
 *
 * `RESTART IDENTITY CASCADE` in one statement is far faster than deleting in
 * dependency order, and it cannot get the order wrong as the schema grows.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await testDb.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename NOT LIKE '_prisma%'
  `;
  if (tables.length === 0) return;

  const list = tables.map((row) => `"public"."${row.tablename}"`).join(', ');
  await testDb.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function disconnect(): Promise<void> {
  await testDb.$disconnect();
}
