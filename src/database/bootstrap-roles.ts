import 'dotenv/config';
import {
  MikroORM,
  type EntityManager as PostgreSqlEntityManager,
} from '@mikro-orm/postgresql';
import { pathToFileURL } from 'node:url';
import { createMigrationMikroOrmConfig } from './mikro-orm-config.factory.js';

const identifierPattern = /^[a-z_][a-z0-9_]{0,62}$/;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function readRuntimeUrl(): URL {
  return new URL(requireEnv('DATABASE_URL'));
}

function quoteIdentifier(identifier: string): string {
  if (!identifierPattern.test(identifier)) {
    throw new Error(`Invalid PostgreSQL identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function qualifiedTable(schema: string, tableName: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(tableName)}`;
}

function runtimeRoleName(): string {
  return (
    process.env.DB_RUNTIME_ROLE?.trim() ||
    decodeURIComponent(readRuntimeUrl().username)
  );
}

function runtimePassword(): string {
  return (
    process.env.DB_RUNTIME_PASSWORD ??
    decodeURIComponent(readRuntimeUrl().password)
  );
}

async function currentDatabaseName(
  em: PostgreSqlEntityManager,
): Promise<string> {
  const rows = await em.execute<{ database_name: string }[]>(
    'select current_database() as database_name',
  );
  const databaseName = rows[0]?.database_name;

  if (!databaseName) {
    throw new Error('Unable to resolve current database name');
  }

  return databaseName;
}

export async function bootstrapRuntimeRole(
  em: PostgreSqlEntityManager,
): Promise<void> {
  const schema = process.env.DB_APP_SCHEMA?.trim() || 'public';
  const roleName = runtimeRoleName();
  const password = runtimePassword();
  const roleIdentifier = quoteIdentifier(roleName);
  const schemaIdentifier = quoteIdentifier(schema);
  const databaseIdentifier = quoteIdentifier(await currentDatabaseName(em));
  const [session] = await em.execute<{ role_name: string }[]>(
    'select current_user as role_name',
  );
  if (roleName === session.role_name || !password) {
    throw new Error(
      'Runtime credentials must use a separate role with a nonempty password.',
    );
  }

  await em.execute(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = ${sqlLiteral(roleName)}) then
        create role ${roleIdentifier} nologin;
      end if;
    end
    $$;
  `);

  if (password) {
    try {
      await em.execute(`
        alter role ${roleIdentifier}
        with login password ${sqlLiteral(password)}
        nosuperuser inherit nocreatedb nocreaterole noreplication;
      `);
    } catch {
      throw new Error(`Unable to configure runtime role ${roleName}.`);
    }
  } else {
    await em.execute(`
      alter role ${roleIdentifier}
      with nologin nosuperuser inherit nocreatedb nocreaterole noreplication;
    `);
  }

  await em.execute(
    `grant connect on database ${databaseIdentifier} to ${roleIdentifier};`,
  );
  await em.execute(
    `grant usage on schema ${schemaIdentifier} to ${roleIdentifier};`,
  );

  await em.execute(`
    grant select on table
      ${qualifiedTable(schema, 'customers')},
      ${qualifiedTable(schema, 'users')},
      ${qualifiedTable(schema, 'vehicles')},
      ${qualifiedTable(schema, 'dealerships')},
      ${qualifiedTable(schema, 'opening_hours')},
      ${qualifiedTable(schema, 'services')},
      ${qualifiedTable(schema, 'technicians')},
      ${qualifiedTable(schema, 'technician_services')},
      ${qualifiedTable(schema, 'bays')}
    to ${roleIdentifier};
  `);

  await em.execute(`
    grant select, insert on table ${qualifiedTable(schema, 'appointments')}
    to ${roleIdentifier};
  `);

  await em.execute(`
    grant update (status, cancelled_at, cancellation_reason)
    on table ${qualifiedTable(schema, 'appointments')}
    to ${roleIdentifier};
  `);

  await em.execute(`
    grant update (id) on table
      ${qualifiedTable(schema, 'dealerships')},
      ${qualifiedTable(schema, 'vehicles')}
    to ${roleIdentifier};
  `);
}

async function main(): Promise<void> {
  const orm = await MikroORM.init(createMigrationMikroOrmConfig());

  try {
    await bootstrapRuntimeRole(orm.em.fork());
    console.log(
      `Database runtime role grants complete for ${runtimeRoleName()}.`,
    );
  } finally {
    await orm.close(true);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch {
    // PostgreSQL DDL errors can embed the ALTER ROLE password in their SQL text.
    console.error(
      'Runtime role setup failed. Check the migration connection, schema and separate runtime credentials.',
    );
    process.exitCode = 1;
  }
}
