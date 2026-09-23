import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseEntities } from './entities/index.js';

export type DatabaseConfigKind = 'runtime' | 'migration' | 'test';

const databaseDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(databaseDir, '../..');
const defaultSchema = process.env.DB_APP_SCHEMA ?? 'public';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function databaseUrlFor(kind: DatabaseConfigKind): string {
  if (kind === 'test') {
    return requireEnv('TEST_DATABASE_URL');
  }

  if (kind === 'migration') {
    return requireEnv('MIGRATION_DATABASE_URL');
  }

  return requireEnv('DATABASE_URL');
}

export function createMikroOrmConfig(kind: DatabaseConfigKind) {
  return defineConfig({
    allowGlobalContext: false,
    clientUrl: databaseUrlFor(kind),
    debug: false,
    driverOptions: {
      connectionTimeoutMillis: 3_000,
      idle_in_transaction_session_timeout: 10_000,
      lock_timeout: 3_000,
      statement_timeout: 5_000,
      transaction_timeout: 10_000,
    },
    entities: [...databaseEntities],
    extensions: [Migrator],
    metadataProvider: ReflectMetadataProvider,
    migrations: {
      allOrNothing: true,
      disableForeignKeys: false,
      path: join(databaseDir, 'migrations'),
      pathTs: join(projectRoot, 'src/database/migrations'),
      snapshot: false,
      snapshotOnMigrate: false,
      transactional: true,
    },
    pool: {
      max: 10,
    },
    schema: defaultSchema,
  });
}

export function createRuntimeMikroOrmConfig() {
  return createMikroOrmConfig('runtime');
}

export function createMigrationMikroOrmConfig() {
  return createMikroOrmConfig('migration');
}

export function createTestMikroOrmConfig() {
  return createMikroOrmConfig('test');
}
