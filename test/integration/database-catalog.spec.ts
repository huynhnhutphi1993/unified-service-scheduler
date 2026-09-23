import 'dotenv/config';
import 'reflect-metadata';
import type { MikroORM as CoreMikroORM } from '@mikro-orm/core';
import {
  MikroORM,
  type EntityManager as PostgreSqlEntityManager,
  type PostgreSqlDriver,
} from '@mikro-orm/postgresql';
import { CatalogService } from '../../src/catalog/catalog.service.js';
import { bootstrapRuntimeRole } from '../../src/database/bootstrap-roles.js';
import { createRuntimeMikroOrmConfig } from '../../src/database/mikro-orm-config.factory.js';
import { seedIds } from '../../src/database/seed-data.js';
import {
  createTestDatabase,
  requireTestDatabaseUrl,
  type TestDatabase,
} from '../helpers/database.js';

type PostgreSqlOrm = CoreMikroORM<PostgreSqlDriver, PostgreSqlEntityManager>;
type AppointmentStatus = 'CONFIRMED' | 'CANCELLED';

interface AppointmentInsert {
  id: string;
  customerId: string;
  vehicleId: string;
  dealershipId: string;
  serviceId: string;
  technicianId: string;
  bayId: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  idempotencyKey: string;
  requestHash: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

interface TimeCase {
  label: string;
  baseStartsAt: string;
  baseEndsAt: string;
  baseDurationMinutes: number;
  candidateStartsAt: string;
  candidateEndsAt: string;
  candidateDurationMinutes: number;
  shouldConflict: boolean;
}

interface ExclusionScenario {
  label: string;
  constraintName: string;
  candidateOverrides: Partial<AppointmentInsert>;
}

const describeDatabase = process.env.TEST_DATABASE_URL
  ? describe.sequential
  : describe.skip;

const overlapCases: readonly TimeCase[] = [
  {
    label: 'partial overlap',
    baseStartsAt: '2035-01-02T10:00:00.000Z',
    baseEndsAt: '2035-01-02T11:00:00.000Z',
    baseDurationMinutes: 60,
    candidateStartsAt: '2035-01-02T10:30:00.000Z',
    candidateEndsAt: '2035-01-02T11:30:00.000Z',
    candidateDurationMinutes: 60,
    shouldConflict: true,
  },
  {
    label: 'contained overlap',
    baseStartsAt: '2035-01-02T10:00:00.000Z',
    baseEndsAt: '2035-01-02T12:00:00.000Z',
    baseDurationMinutes: 120,
    candidateStartsAt: '2035-01-02T10:30:00.000Z',
    candidateEndsAt: '2035-01-02T11:00:00.000Z',
    candidateDurationMinutes: 30,
    shouldConflict: true,
  },
  {
    label: 'full overlap',
    baseStartsAt: '2035-01-02T10:00:00.000Z',
    baseEndsAt: '2035-01-02T11:00:00.000Z',
    baseDurationMinutes: 60,
    candidateStartsAt: '2035-01-02T10:00:00.000Z',
    candidateEndsAt: '2035-01-02T11:00:00.000Z',
    candidateDurationMinutes: 60,
    shouldConflict: true,
  },
  {
    label: 'adjacent interval',
    baseStartsAt: '2035-01-02T10:00:00.000Z',
    baseEndsAt: '2035-01-02T11:00:00.000Z',
    baseDurationMinutes: 60,
    candidateStartsAt: '2035-01-02T11:00:00.000Z',
    candidateEndsAt: '2035-01-02T11:45:00.000Z',
    candidateDurationMinutes: 45,
    shouldConflict: false,
  },
];

const exclusionScenarios: readonly ExclusionScenario[] = [
  {
    label: 'technician',
    constraintName: 'appointments_technician_no_overlap',
    candidateOverrides: {
      vehicleId: seedIds.vehicles.customerASuv,
      technicianId: seedIds.technicians.northAlex,
      bayId: seedIds.bays.northTwo,
    },
  },
  {
    label: 'bay',
    constraintName: 'appointments_bay_no_overlap',
    candidateOverrides: {
      vehicleId: seedIds.vehicles.customerASuv,
      technicianId: seedIds.technicians.northBlair,
      bayId: seedIds.bays.northOne,
    },
  },
  {
    label: 'vehicle',
    constraintName: 'appointments_vehicle_no_overlap',
    candidateOverrides: {
      vehicleId: seedIds.vehicles.customerAHatchback,
      dealershipId: seedIds.dealerships.riverGate,
      technicianId: seedIds.technicians.riverCasey,
      bayId: seedIds.bays.riverOne,
    },
  },
];

let appointmentSequence = 1;

function nextAppointmentId(): string {
  const suffix = String(appointmentSequence).padStart(12, '0');
  appointmentSequence += 1;
  return `80000000-0000-4000-8000-${suffix}`;
}

function nextRequestHash(): string {
  return String(appointmentSequence).padStart(64, 'a');
}

function dbEm(db: TestDatabase): PostgreSqlEntityManager {
  return db.orm.em.fork() as PostgreSqlEntityManager;
}

function runtimeDatabaseUrl(): string {
  const runtimeUrl = process.env.DATABASE_URL;
  if (!runtimeUrl) {
    throw new Error('DATABASE_URL is required for runtime privilege tests.');
  }

  const runtime = new URL(runtimeUrl);
  const test = new URL(requireTestDatabaseUrl());
  runtime.pathname = test.pathname;
  return runtime.toString();
}

async function createRuntimeOrmForTest(): Promise<PostgreSqlOrm> {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = runtimeDatabaseUrl();

  try {
    return await MikroORM.init<PostgreSqlDriver, PostgreSqlEntityManager>(
      createRuntimeMikroOrmConfig(),
    );
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
}

function appointment(
  overrides: Partial<AppointmentInsert> = {},
): AppointmentInsert {
  const id = nextAppointmentId();

  return {
    id,
    customerId: seedIds.customers.customerA,
    vehicleId: seedIds.vehicles.customerAHatchback,
    dealershipId: seedIds.dealerships.northLoop,
    serviceId: seedIds.services.oilChange,
    technicianId: seedIds.technicians.northAlex,
    bayId: seedIds.bays.northOne,
    startsAt: '2035-01-02T10:00:00.000Z',
    endsAt: '2035-01-02T11:00:00.000Z',
    durationMinutes: 60,
    status: 'CONFIRMED',
    idempotencyKey: `db-test-${id}`,
    requestHash: nextRequestHash(),
    cancelledAt: null,
    cancellationReason: null,
    ...overrides,
  };
}

async function insertAppointment(
  db: TestDatabase,
  values: AppointmentInsert,
): Promise<void> {
  await dbEm(db).execute(
    `
      insert into appointments (
        id,
        customer_id,
        vehicle_id,
        dealership_id,
        service_id,
        technician_id,
        bay_id,
        starts_at,
        ends_at,
        duration_minutes,
        status,
        idempotency_key,
        request_hash,
        cancelled_at,
        cancellation_reason
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      values.id,
      values.customerId,
      values.vehicleId,
      values.dealershipId,
      values.serviceId,
      values.technicianId,
      values.bayId,
      values.startsAt,
      values.endsAt,
      values.durationMinutes,
      values.status,
      values.idempotencyKey,
      values.requestHash,
      values.cancelledAt,
      values.cancellationReason,
    ],
  );
}

async function expectRuntimeDenied(
  runtimeOrm: PostgreSqlOrm,
  sql: string,
  params: readonly unknown[] = [],
): Promise<void> {
  let succeeded = false;

  await expect(
    runtimeOrm.em.fork().transactional(async (tx) => {
      await tx.execute(sql, params);
      succeeded = true;
      throw new Error('rollback after unexpected runtime success');
    }),
  ).rejects.toThrow(/permission denied|must be owner|must be owner of/);
  expect(succeeded).toBe(false);
}

describeDatabase('database and catalog integration', () => {
  let db: TestDatabase;
  let runtimeOrm: PostgreSqlOrm;

  beforeAll(async () => {
    db = await createTestDatabase();
    await bootstrapRuntimeRole(dbEm(db));
    runtimeOrm = await createRuntimeOrmForTest();
  });

  beforeEach(async () => {
    await db.reset();
  });

  afterAll(async () => {
    await runtimeOrm?.close(true);
    await db?.close();
  });

  it('exposes the contracted PostgreSQL constraints', async () => {
    const rows = await dbEm(db).execute<{ conname: string }[]>(
      `
        select conname
        from pg_constraint
        where conname in (
          'appointments_customer_idempotency_unique',
          'appointments_technician_no_overlap',
          'appointments_bay_no_overlap',
          'appointments_vehicle_no_overlap'
        )
        order by conname;
      `,
    );
    const extensionRows = await dbEm(db).execute<{ extname: string }[]>(
      "select extname from pg_extension where extname = 'btree_gist';",
    );

    expect(rows.map((row) => row.conname)).toEqual([
      'appointments_bay_no_overlap',
      'appointments_customer_idempotency_unique',
      'appointments_technician_no_overlap',
      'appointments_vehicle_no_overlap',
    ]);
    expect(extensionRows).toHaveLength(1);
  });

  it('returns all reference catalog data and only the caller vehicles', async () => {
    const catalog = await new CatalogService(dbEm(db)).getCatalog({
      userId: '90000000-0000-4000-8000-000000000001',
      customerId: seedIds.customers.customerA,
    });

    expect(catalog.dealerships).toHaveLength(2);
    expect(
      catalog.dealerships.every(
        (dealership) => dealership.openingHours.length === 5,
      ),
    ).toBe(true);
    expect(catalog.services.map((service) => service.id).sort()).toEqual(
      Object.values(seedIds.services).sort(),
    );
    expect(catalog.vehicles.map((vehicle) => vehicle.id)).toEqual([
      seedIds.vehicles.customerAHatchback,
      seedIds.vehicles.customerASuv,
    ]);
  });

  describe.each(exclusionScenarios)(
    '$label exclusion constraint',
    (scenario) => {
      it.each(overlapCases)(
        'handles $label using half-open intervals',
        async (timeCase) => {
          await insertAppointment(
            db,
            appointment({
              startsAt: timeCase.baseStartsAt,
              endsAt: timeCase.baseEndsAt,
              durationMinutes: timeCase.baseDurationMinutes,
            }),
          );

          const candidate = appointment({
            startsAt: timeCase.candidateStartsAt,
            endsAt: timeCase.candidateEndsAt,
            durationMinutes: timeCase.candidateDurationMinutes,
            ...scenario.candidateOverrides,
          });

          if (timeCase.shouldConflict) {
            await expect(insertAppointment(db, candidate)).rejects.toThrow(
              new RegExp(scenario.constraintName),
            );
            return;
          }

          await expect(
            insertAppointment(db, candidate),
          ).resolves.toBeUndefined();
        },
      );
    },
  );

  it.each([
    {
      label: 'vehicle owner',
      constraintName: 'appointments_vehicle_customer_foreign',
      overrides: {
        customerId: seedIds.customers.customerB,
        vehicleId: seedIds.vehicles.customerAHatchback,
      },
    },
    {
      label: 'technician dealership',
      constraintName: 'appointments_technician_dealership_foreign',
      overrides: {
        dealershipId: seedIds.dealerships.riverGate,
        technicianId: seedIds.technicians.northAlex,
        bayId: seedIds.bays.riverOne,
      },
    },
    {
      label: 'bay dealership',
      constraintName: 'appointments_bay_dealership_foreign',
      overrides: {
        dealershipId: seedIds.dealerships.riverGate,
        technicianId: seedIds.technicians.riverCasey,
        bayId: seedIds.bays.northOne,
      },
    },
    {
      label: 'technician qualification',
      constraintName: 'appointments_technician_service_foreign',
      overrides: {
        serviceId: seedIds.services.wheelAlignment,
        technicianId: seedIds.technicians.northAlex,
      },
    },
  ])('rejects invalid composite FK for $label', async (testCase) => {
    await expect(
      insertAppointment(db, appointment(testCase.overrides)),
    ).rejects.toThrow(new RegExp(testCase.constraintName));
  });

  it('denies runtime CREATE TABLE', async () => {
    await expectRuntimeDenied(
      runtimeOrm,
      'create table runtime_forbidden_create (id integer);',
    );
  });

  it('denies runtime DROP TABLE', async () => {
    await expectRuntimeDenied(runtimeOrm, 'drop table customers;');
  });

  it('denies runtime TRUNCATE TABLE', async () => {
    await expectRuntimeDenied(runtimeOrm, 'truncate table customers;');
  });

  it('denies runtime password hash writes', async () => {
    await expectRuntimeDenied(
      runtimeOrm,
      'update users set password_hash = ? where id = ?;',
      ['forbidden', '00000000-0000-4000-8000-000000000000'],
    );
  });

  it('allows runtime row locks on dealerships and vehicles', async () => {
    await runtimeOrm.em.fork().transactional(async (tx) => {
      const dealershipRows = await tx.execute<{ id: string }[]>(
        'select id from dealerships where id = ? for update;',
        [seedIds.dealerships.northLoop],
      );
      const vehicleRows = await tx.execute<{ id: string }[]>(
        'select id from vehicles where id = ? for update;',
        [seedIds.vehicles.customerAHatchback],
      );

      expect(dealershipRows).toEqual([{ id: seedIds.dealerships.northLoop }]);
      expect(vehicleRows).toEqual([
        { id: seedIds.vehicles.customerAHatchback },
      ]);
    });
  });
});
