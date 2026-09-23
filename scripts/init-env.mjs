import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const output = process.argv[2] ?? '.env';
const password = randomBytes(24).toString('hex');
const appPassword = randomBytes(24).toString('hex');
const port = process.env.POSTGRES_PORT ?? '5432';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  throw new Error('POSTGRES_PORT must be a TCP port from 1 to 65535.');
}
const adminUrl = `postgresql://scheduler_admin:${encodeURIComponent(password)}@127.0.0.1:${port}`;
const settings = {
  POSTGRES_PASSWORD: password,
  POSTGRES_PORT: port,
  DATABASE_URL: `postgresql://scheduler_app:${appPassword}@127.0.0.1:${port}/scheduler`,
  MIGRATION_DATABASE_URL: `${adminUrl}/scheduler`,
  TEST_DATABASE_URL: `${adminUrl}/scheduler_test`,
  JWT_SECRET_BASE64: randomBytes(48).toString('base64'),
  SEED_CUSTOMER_A_PASSWORD: randomBytes(24).toString('base64url'),
  SEED_CUSTOMER_B_PASSWORD: randomBytes(24).toString('base64url'),
  HOST: '127.0.0.1',
  PORT: '3000',
  NODE_ENV: 'development',
};
try {
  writeFileSync(
    output,
    Object.entries(settings)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    `Created ${output} with generated local credentials. Existing files are never overwritten.`,
  );
} catch (error) {
  console.error(
    error.code === 'EEXIST'
      ? `${output} already exists; it was preserved. Choose another filename.`
      : 'Could not create the environment file.',
  );
  process.exitCode = 1;
}
