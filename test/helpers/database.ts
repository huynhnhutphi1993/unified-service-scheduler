import 'dotenv/config';
import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import { createTestMikroOrmConfig } from '../../src/database/mikro-orm-config.factory.js';
import { Migration20260922000000_CreateSchedulerSchema } from '../../src/database/migrations/Migration20260922000000_CreateSchedulerSchema.js';
import { seedFoundation } from '../../src/database/seed-foundation.js';

export function requireTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      'TEST_DATABASE_URL is required; tests never fall back to DATABASE_URL.',
    );
  const url = new URL(value);
  if (!/^\/[a-z0-9_]+_test$/.test(url.pathname)) {
    throw new Error(
      'Destructive tests require a database name ending in _test.',
    );
  }
  for (const applicationUrl of [
    process.env.DATABASE_URL,
    process.env.MIGRATION_DATABASE_URL,
  ]) {
    if (!applicationUrl) continue;
    const other = new URL(applicationUrl);
    if (
      url.hostname === other.hostname &&
      url.port === other.port &&
      url.pathname === other.pathname
    ) {
      throw new Error(
        'TEST_DATABASE_URL must not refer to the application database.',
      );
    }
  }
  return value;
}

export async function createTestDatabase() {
  requireTestDatabaseUrl();
  const config = createTestMikroOrmConfig();
  const orm = await MikroORM.init({
    ...config,
    debug: false,
    migrations: {
      ...config.migrations,
      migrationsList: [Migration20260922000000_CreateSchedulerSchema],
    },
  });
  await orm.migrator.up();
  return {
    orm,
    async reset() {
      const em = orm.em.fork();
      await em.execute(
        'truncate table customers, dealerships, services restart identity cascade',
      );
      await seedFoundation(em);
    },
    async close() {
      await orm.close(true);
    },
  };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
