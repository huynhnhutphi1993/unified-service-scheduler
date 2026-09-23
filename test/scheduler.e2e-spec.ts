import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { DateTime } from 'luxon';
import { bootstrapRuntimeRole } from '../src/database/bootstrap-roles.js';
import { seedAccounts } from '../src/auth/scripts/seed-accounts.js';
import { seedIds } from '../src/database/seed-data.js';
import { User } from '../src/database/entities/index.js';
import { createTestDatabase, type TestDatabase } from './helpers/database.js';
import {
  api,
  startApplication,
  type ApplicationProcess,
} from './helpers/application-process.js';

let db: TestDatabase;
let first: ApplicationProcess;
let second: ApplicationProcess;
let tokenA: string;
let tokenB: string;
let userA: string;
let runtimeUrl: string;
const archivedLogs: string[] = [];

function booking(overrides: Record<string, string> = {}) {
  let local = DateTime.now()
    .setZone('Europe/London')
    .plus({ days: 7 })
    .startOf('day')
    .set({ hour: 10 });
  while (local.weekday > 5) local = local.plus({ days: 1 });
  return {
    dealershipId: seedIds.dealerships.northLoop,
    vehicleId: seedIds.vehicles.customerAHatchback,
    serviceId: seedIds.services.oilChange,
    startsAt: local.toUTC().toISO()!,
    ...overrides,
  };
}

async function create(
  overrides: Record<string, string> = {},
  key = randomUUID(),
  app = first,
  token = tokenA,
) {
  return api(app, '/appointments', {
    method: 'POST',
    token,
    key,
    body: booking(overrides),
  });
}

async function waitFor(condition: () => Promise<boolean>, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  while (!(await condition())) {
    if (Date.now() >= deadline)
      throw new Error('Timed out waiting for the database barrier.');
    await delay(10);
  }
}

async function lockedRace<T>(
  table: 'dealerships' | 'vehicles',
  id: string | string[],
  actions: () => Promise<T>[],
) {
  const lock = db.orm.em.fork();
  await lock.begin();
  try {
    const ids = Array.isArray(id) ? id : [id];
    await lock.execute(
      `select id from ${table} where id in (${ids.map(() => '?').join(',')}) order by id for update`,
      ids,
    );
    const requests = actions();
    await waitFor(async () => {
      const [row] = await db.orm.em.fork().execute<{ count: number }[]>(`
        select count(*)::int as count from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
          and cardinality(pg_blocking_pids(pid)) > 0
      `);
      return row.count >= requests.length;
    });
    await lock.commit();
    return await Promise.all(requests);
  } catch (error) {
    if (lock.isInTransaction()) await lock.rollback();
    throw error;
  }
}

beforeAll(async () => {
  db = await createTestDatabase();
  await db.reset();
  await seedAccounts(db.orm.em.fork());
  await bootstrapRuntimeRole(db.orm.em.fork());
  const url = new URL(process.env.DATABASE_URL!);
  const testUrl = new URL(process.env.TEST_DATABASE_URL!);
  url.hostname = testUrl.hostname;
  url.port = testUrl.port;
  url.pathname = testUrl.pathname;
  runtimeUrl = url.href;
  first = await startApplication(runtimeUrl);
  second = await startApplication(runtimeUrl);
  const loginA = await api(first, '/auth/login', {
    method: 'POST',
    body: {
      username: 'customer.a',
      password: process.env.SEED_CUSTOMER_A_PASSWORD,
    },
  });
  const loginB = await api(first, '/auth/login', {
    method: 'POST',
    body: {
      username: 'customer.b',
      password: process.env.SEED_CUSTOMER_B_PASSWORD,
    },
  });
  expect(loginA.status).toBe(200);
  expect(loginB.status).toBe(200);
  tokenA = loginA.body.accessToken as string;
  tokenB = loginB.body.accessToken as string;
  userA = (
    await db.orm.em.fork().findOneOrFail(User, { username: 'customer.a' })
  ).id;
}, 60_000);

beforeEach(async () => {
  await db.orm.em.fork().execute('truncate table appointments');
});
afterAll(async () => {
  await Promise.all([first?.stop(), second?.stop()]);
  await db?.close();
});

describe('HTTP, authentication and authorization', () => {
  it('serves a public health check, protects catalog and exposes only owned vehicles', async () => {
    expect((await api(first, '/health')).status).toBe(200);
    expect((await api(first, '/catalog')).status).toBe(401);
    const catalog = await api(first, '/catalog', { token: tokenA });
    expect(catalog.status).toBe(200);
    expect(catalog.body.vehicles.map((v: { id: string }) => v.id)).toEqual([
      seedIds.vehicles.customerAHatchback,
      seedIds.vehicles.customerASuv,
    ]);
    expect(catalog.headers.get('x-content-type-options')).toBe('nosniff');
    expect(catalog.headers.get('access-control-allow-origin')).toBeNull();
    expect(catalog.headers.get('cache-control')).toBe('no-store');
  });

  it('does not disclose whether a username exists', async () => {
    const unknown = await api(first, '/auth/login', {
      method: 'POST',
      body: { username: 'unknown.user', password: 'incorrect-password' },
    });
    const wrong = await api(first, '/auth/login', {
      method: 'POST',
      body: { username: 'customer.a', password: 'incorrect-password' },
    });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.code).toBe(unknown.body.code);
  });

  it('rejects expired, incorrectly scoped, unsigned and nonexistent-user tokens', async () => {
    const jwt = new JwtService();
    const secret = Buffer.from(process.env.JWT_SECRET_BASE64!, 'base64');
    const base = {
      sub: userA,
      iss: 'unified-service-scheduler',
      aud: 'scheduler-api',
    };
    const invalid = [
      jwt.sign(base, { secret, algorithm: 'HS256', expiresIn: -1 }),
      jwt.sign(
        { ...base, aud: 'another-api' },
        { secret, algorithm: 'HS256', expiresIn: 900 },
      ),
      jwt.sign(
        { ...base, iss: 'another-issuer' },
        { secret, algorithm: 'HS256', expiresIn: 900 },
      ),
      jwt.sign(base, { secret, algorithm: 'HS512', expiresIn: 900 }),
      jwt.sign(
        { ...base, sub: randomUUID() },
        { secret, algorithm: 'HS256', expiresIn: 900 },
      ),
      jwt.sign(base, { secret, algorithm: 'HS256' }),
      `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(base)).toString('base64url')}.`,
      `${tokenA.slice(0, -5)}wrong`,
    ];
    for (const token of invalid)
      expect((await api(first, '/catalog', { token })).status).toBe(401);
  });

  it('prevents customer impersonation and reading or cancelling another customer appointment', async () => {
    const created = await create();
    expect(created.status).toBe(201);
    expect(
      (await api(first, `/appointments/${created.body.id}`, { token: tokenB }))
        .status,
    ).toBe(404);
    expect(
      (
        await api(first, `/appointments/${created.body.id}/cancel`, {
          method: 'POST',
          token: tokenB,
          body: {},
        })
      ).status,
    ).toBe(404);
    expect(
      (await create({ vehicleId: seedIds.vehicles.customerBEstate })).status,
    ).toBe(404);
    expect(
      (await create({ customerId: seedIds.customers.customerB })).status,
    ).toBe(400);
  });

  it('rejects invalid DTOs, timestamps, oversized bodies and non-JSON input', async () => {
    const invalidInputs: Record<string, string>[] = [
      { technicianId: seedIds.technicians.northAlex },
      { startsAt: '2030-02-30T09:00:00Z' },
      { startsAt: '2030-10-01T09:00:00' },
      { vehicleId: 'not-a-uuid' },
    ];
    for (const overrides of invalidInputs) {
      expect((await create(overrides)).status).toBe(400);
    }
    expect(
      (
        await api(first, '/appointments', {
          method: 'POST',
          token: tokenA,
          key: 'large',
          body: { ...booking(), padding: 'x'.repeat(17_000) },
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await api(first, '/appointments', {
          method: 'POST',
          token: tokenA,
          body: booking(),
          headers: { 'Content-Type': 'text/plain' },
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await api(first, '/appointments', {
          method: 'POST',
          token: tokenA,
          body: booking(),
        })
      ).status,
    ).toBe(400);
  });
});

describe('appointment lifecycle', () => {
  it('checks availability without holding resources and persists across application restart', async () => {
    const query = new URLSearchParams(booking()).toString();
    const available = await api(first, `/availability?${query}`, {
      token: tokenA,
    });
    expect(available.status).toBe(200);
    expect(available.body.available).toBe(true);
    expect(available.body.technicianId).toBeUndefined();
    const created = await create();
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('CONFIRMED');
    expect(created.body.durationMinutes).toBe(45);
    await first.stop();
    archivedLogs.push(...first.logs);
    first = await startApplication(runtimeUrl);
    const restored = await api(first, `/appointments/${created.body.id}`, {
      token: tokenA,
    });
    expect(restored.body).toEqual(created.body);
  });

  it('returns current state on replay, preserves cancellation details, and accepts a new key after cancel', async () => {
    const key = randomUUID();
    const created = await create({}, key);
    expect(created.status).toBe(201);
    const replay = await create(
      {
        startsAt: DateTime.fromISO(booking().startsAt)
          .setZone('Asia/Ho_Chi_Minh')
          .toISO()!,
      },
      key,
    );
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(created.body.id);
    expect(
      (await create({ vehicleId: seedIds.vehicles.customerASuv }, key)).status,
    ).toBe(409);
    const cancelled = await api(
      first,
      `/appointments/${created.body.id}/cancel`,
      {
        method: 'POST',
        token: tokenA,
        body: { reason: "Customer's schedule changed; DROP TABLE users; --" },
      },
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    const again = await api(second, `/appointments/${created.body.id}/cancel`, {
      method: 'POST',
      token: tokenA,
      body: { reason: 'Different reason' },
    });
    expect(again.body).toEqual(cancelled.body);
    const afterCancel = await create({}, key);
    expect(afterCancel.status).toBe(200);
    expect(afterCancel.body).toEqual(cancelled.body);
    expect((await create()).status).toBe(201);
    expect((await api(first, '/catalog', { token: tokenA })).status).toBe(200);
  });

  it('allows adjacent intervals and rejects past or out-of-hours creation', async () => {
    const firstBooking = await create();
    expect(firstBooking.status).toBe(201);
    const adjacent = await create({ startsAt: firstBooking.body.endsAt });
    expect(adjacent.status).toBe(201);
    expect(adjacent.body.technicianId).toBe(firstBooking.body.technicianId);
    expect((await create({ startsAt: '2020-01-01T10:00:00Z' })).status).toBe(
      422,
    );
    const closed = DateTime.fromISO(booking().startsAt)
      .setZone('Europe/London')
      .set({ hour: 17, minute: 1 })
      .toISO()!;
    expect((await create({ startsAt: closed })).status).toBe(422);
  });

  it('keeps idempotency scoped by customer', async () => {
    const key = randomUUID();
    const a = await create({}, key);
    const b = await create(
      { vehicleId: seedIds.vehicles.customerBEstate },
      key,
      second,
      tokenB,
    );
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);
  });
});

describe('two independent backend processes sharing PostgreSQL', () => {
  it('confirms at most one competing request when only one resource pair exists', async () => {
    const results = await lockedRace(
      'dealerships',
      seedIds.dealerships.riverGate,
      () => [
        create(
          { dealershipId: seedIds.dealerships.riverGate },
          randomUUID(),
          first,
        ),
        create(
          {
            dealershipId: seedIds.dealerships.riverGate,
            vehicleId: seedIds.vehicles.customerBEstate,
          },
          randomUUID(),
          second,
          tokenB,
        ),
      ],
    );
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
  });

  it('allocates the second pair after waiting instead of incorrectly declaring the whole dealer full', async () => {
    const results = await lockedRace(
      'dealerships',
      seedIds.dealerships.northLoop,
      () => [
        create({}, randomUUID(), first),
        create(
          { vehicleId: seedIds.vehicles.customerASuv },
          randomUUID(),
          second,
        ),
      ],
    );
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(new Set(results.map((r) => r.body.technicianId)).size).toBe(2);
    expect(new Set(results.map((r) => r.body.bayId)).size).toBe(2);
  });

  it('prevents the same vehicle being booked concurrently across dealerships', async () => {
    const results = await lockedRace(
      'vehicles',
      seedIds.vehicles.customerAHatchback,
      () => [
        create({}, randomUUID(), first),
        create(
          { dealershipId: seedIds.dealerships.riverGate },
          randomUUID(),
          second,
        ),
      ],
    );
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
  });

  it('returns one appointment for simultaneous identical idempotency keys', async () => {
    const key = randomUUID();
    const results = await lockedRace(
      'dealerships',
      seedIds.dealerships.northLoop,
      () => [create({}, key, first), create({}, key, second)],
    );
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 201,
    ]);
    expect(results[0].body.id).toBe(results[1].body.id);
  });

  it('resolves a shared key with different inputs even across dealerships', async () => {
    const key = randomUUID();
    const results = await lockedRace(
      'dealerships',
      [seedIds.dealerships.northLoop, seedIds.dealerships.riverGate],
      () => [
        create({}, key, first),
        create(
          {
            dealershipId: seedIds.dealerships.riverGate,
            vehicleId: seedIds.vehicles.customerASuv,
          },
          key,
          second,
        ),
      ],
    );
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(results.find((r) => r.status === 409)!.body.code).toBe(
      'IDEMPOTENCY_CONFLICT',
    );
  });

  it('makes simultaneous cancellation idempotent', async () => {
    const created = await create();
    expect(created.status).toBe(201);
    const results = await lockedRace(
      'dealerships',
      seedIds.dealerships.northLoop,
      () => [
        api(first, `/appointments/${created.body.id}/cancel`, {
          method: 'POST',
          token: tokenA,
          body: { reason: 'first' },
        }),
        api(second, `/appointments/${created.body.id}/cancel`, {
          method: 'POST',
          token: tokenA,
          body: { reason: 'second' },
        }),
      ],
    );
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].body).toEqual(results[1].body);
  });

  it('keeps cancellation and concurrent creation consistent and releases resources after commit', async () => {
    const created = await create({
      dealershipId: seedIds.dealerships.riverGate,
    });
    expect(created.status).toBe(201);
    const newKey = randomUUID();
    const results = await lockedRace(
      'dealerships',
      seedIds.dealerships.riverGate,
      () => [
        api(first, `/appointments/${created.body.id}/cancel`, {
          method: 'POST',
          token: tokenA,
          body: {},
        }),
        create(
          {
            dealershipId: seedIds.dealerships.riverGate,
            vehicleId: seedIds.vehicles.customerBEstate,
          },
          newKey,
          second,
          tokenB,
        ),
      ],
    );
    expect(results[0].status).toBe(200);
    expect([201, 409]).toContain(results[1].status);
    const retry = await create(
      {
        dealershipId: seedIds.dealerships.riverGate,
        vehicleId: seedIds.vehicles.customerBEstate,
      },
      newKey,
      second,
      tokenB,
    );
    expect([200, 201]).toContain(retry.status);
    const [count] = await db.orm.em
      .fork()
      .execute<{ count: number }[]>(
        "select count(*)::int as count from appointments where status = 'CONFIRMED'",
      );
    expect(count.count).toBe(1);
  });

  it('returns 503 on lock timeout without partially creating an appointment', async () => {
    const lock = db.orm.em.fork();
    await lock.begin();
    try {
      await lock.execute('select id from dealerships where id = ? for update', [
        seedIds.dealerships.northLoop,
      ]);
      const rejected = await create();
      expect(rejected.status).toBe(503);
    } finally {
      await lock.rollback();
    }
    const [row] = await db.orm.em
      .fork()
      .execute<{ count: number }[]>(
        'select count(*)::int as count from appointments',
      );
    expect(row.count).toBe(0);
  });
});

describe('security limits and redaction', () => {
  it('limits brute-force login attempts per process', async () => {
    for (let index = 0; index < 5; index++) {
      expect(
        (
          await api(second, '/auth/login', {
            method: 'POST',
            body: { username: 'unknown.user', password: 'incorrect-password' },
          })
        ).status,
      ).toBe(401);
    }
    expect(
      (
        await api(second, '/auth/login', {
          method: 'POST',
          body: { username: 'unknown.user', password: 'incorrect-password' },
        })
      ).status,
    ).toBe(429);
  });

  it('does not log passwords, tokens, connection strings or cancellation reasons', () => {
    const output = [...archivedLogs, ...first.logs, ...second.logs].join('');
    for (const secret of [
      tokenA,
      tokenB,
      process.env.SEED_CUSTOMER_A_PASSWORD!,
      process.env.SEED_CUSTOMER_B_PASSWORD!,
      process.env.DATABASE_URL!,
      "Customer's schedule changed",
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});
