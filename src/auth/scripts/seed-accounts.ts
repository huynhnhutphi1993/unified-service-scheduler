import 'reflect-metadata';
import 'dotenv/config';
import { MikroORM } from '@mikro-orm/postgresql';
import type { EntityManager as PostgreSqlEntityManager } from '@mikro-orm/postgresql';
import { pathToFileURL } from 'node:url';
import { User } from '../../database/entities/index.js';
import { createMigrationMikroOrmConfig } from '../../database/mikro-orm-config.factory.js';
import { seedIds } from '../../database/seed-data.js';
import { hashPassword, isAcceptableSeedPassword } from '../password-hash.js';
import { normalizeUsername } from '../username.js';

const ACCOUNT_SEEDS = [
  {
    key: 'customerA',
    username: 'customer.a',
    customerId: seedIds.customers.customerA,
    passwordEnv: 'SEED_CUSTOMER_A_PASSWORD',
  },
  {
    key: 'customerB',
    username: 'customer.b',
    customerId: seedIds.customers.customerB,
    passwordEnv: 'SEED_CUSTOMER_B_PASSWORD',
  },
] as const;

export interface SeedAccountPasswords {
  customerA: string;
  customerB: string;
}

export async function seedAccounts(
  em: PostgreSqlEntityManager,
  passwords: SeedAccountPasswords = readSeedPasswordsFromEnv(),
): Promise<void> {
  for (const account of ACCOUNT_SEEDS) {
    const username = normalizeUsername(account.username);
    if (!username) {
      throw new Error(`Invalid seed username: ${account.username}`);
    }

    const existingUser = await em.findOne(User, { username });
    if (existingUser) {
      continue;
    }

    em.persist(
      em.create(User, {
        username,
        passwordHash: await hashPassword(passwords[account.key]),
        customerId: account.customerId,
      }),
    );
  }

  await em.flush();
}

async function main(): Promise<void> {
  const orm = await MikroORM.init(createMigrationMikroOrmConfig());

  try {
    await seedAccounts(orm.em.fork());
    console.log('Account seed complete.');
  } finally {
    await orm.close(true);
  }
}

function readSeedPasswordsFromEnv(): SeedAccountPasswords {
  return {
    customerA: readSeedPassword('SEED_CUSTOMER_A_PASSWORD'),
    customerB: readSeedPassword('SEED_CUSTOMER_B_PASSWORD'),
  };
}

function readSeedPassword(envName: keyof NodeJS.ProcessEnv): string {
  const password = process.env[envName];
  if (!isAcceptableSeedPassword(password)) {
    throw new Error(`${envName} must be between 15 and 128 characters.`);
  }

  return password;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch {
    // A failed INSERT may include password_hash in the driver's error message.
    console.error(
      'Account seed failed. Check the foundation seed, connection and seed password configuration.',
    );
    process.exitCode = 1;
  }
}
