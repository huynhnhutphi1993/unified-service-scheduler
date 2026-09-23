import { IsolationLevel, LockMode } from '@mikro-orm/core';
import type { EntityManager as PostgreSqlEntityManager } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import { ApplicationError } from '../../src/common/application-error.js';
import type {
  AuthenticatedCustomer,
  AvailabilityDecision,
  BookingRequest,
} from '../../src/common/contracts.js';
import {
  Appointment,
  Dealership,
  User,
} from '../../src/database/entities/index.js';
import { seedIds } from '../../src/database/seed-data.js';
import { AvailabilityService } from '../../src/availability/availability.service.js';
import { AppointmentsService } from '../../src/appointments/appointments.service.js';
import { seedAccounts } from '../../src/auth/scripts/seed-accounts.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

const PASSWORDS = {
  customerA: 'customer-a-password',
  customerB: 'customer-b-password',
};

const CUSTOMER_A = {
  userId: '90000000-0000-4000-8000-000000000001',
  customerId: seedIds.customers.customerA,
};

const CUSTOMER_B = {
  userId: '90000000-0000-4000-8000-000000000002',
  customerId: seedIds.customers.customerB,
};

const OIL_CHANGE = {
  dealershipId: seedIds.dealerships.northLoop,
  serviceId: seedIds.services.oilChange,
  vehicleId: seedIds.vehicles.customerAHatchback,
  startsAt: '2030-01-07T10:00:00Z',
};

const WHEEL_ALIGNMENT_A = {
  dealershipId: seedIds.dealerships.northLoop,
  serviceId: seedIds.services.wheelAlignment,
  vehicleId: seedIds.vehicles.customerAHatchback,
  startsAt: '2030-01-07T10:00:00Z',
};

const WHEEL_ALIGNMENT_B = {
  dealershipId: seedIds.dealerships.northLoop,
  serviceId: seedIds.services.wheelAlignment,
  vehicleId: seedIds.vehicles.customerBEstate,
  startsAt: '2030-01-07T10:00:00Z',
};

describe.sequential('appointments integration', () => {
  let database: TestDatabase;
  let service: AppointmentsService;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  beforeEach(async () => {
    await database.reset();
    await seedAccounts(database.orm.em.fork(), PASSWORDS);
    service = new AppointmentsService(
      database.orm.em.fork(),
      new AvailabilityService(),
    );
  });

  afterAll(async () => {
    await database.close();
  });

  it('creates, replays, cancels, and replays the current cancelled state', async () => {
    const created = await service.createAppointment(
      CUSTOMER_A,
      OIL_CHANGE,
      'create-1',
    );

    expect(created.created).toBe(true);
    expect(created.appointment).toMatchObject({
      customerId: CUSTOMER_A.customerId,
      dealershipId: OIL_CHANGE.dealershipId,
      vehicleId: OIL_CHANGE.vehicleId,
      serviceId: OIL_CHANGE.serviceId,
      durationMinutes: 45,
      status: 'CONFIRMED',
    });

    const replay = await service.createAppointment(
      CUSTOMER_A,
      OIL_CHANGE,
      'create-1',
    );
    expect(replay).toMatchObject({
      created: false,
      appointment: { id: created.appointment.id, status: 'CONFIRMED' },
    });

    const cancelled = await service.cancelAppointment(
      CUSTOMER_A,
      created.appointment.id,
      'No longer needed',
    );
    expect(cancelled).toMatchObject({
      id: created.appointment.id,
      status: 'CANCELLED',
      cancellationReason: 'No longer needed',
    });
    expect(cancelled.cancelledAt).toEqual(expect.any(String));

    const replayAfterCancel = await service.createAppointment(
      CUSTOMER_A,
      OIL_CHANGE,
      'create-1',
    );
    expect(replayAfterCancel).toMatchObject({
      created: false,
      appointment: { id: created.appointment.id, status: 'CANCELLED' },
    });

    expect(await database.orm.em.fork().count(Appointment, {})).toBe(1);
  });

  it('rejects idempotency key reuse with a different normalized payload', async () => {
    await service.createAppointment(CUSTOMER_A, OIL_CHANGE, 'create-2');

    await expectApplicationError(
      service.createAppointment(
        CUSTOMER_A,
        { ...OIL_CHANGE, startsAt: '2030-01-07T11:00:00Z' },
        'create-2',
      ),
      409,
      'IDEMPOTENCY_CONFLICT',
    );
  });

  it('preserves seeded accounts on rerun', async () => {
    const em = database.orm.em.fork();
    const original = await em.findOneOrFail(User, { username: 'customer.a' });
    const originalHash = original.passwordHash;
    const originalCustomerId = original.customerId;

    await seedAccounts(em, {
      customerA: 'different-password',
      customerB: 'different-password',
    });
    await em.refresh(original);

    expect(original.passwordHash).toBe(originalHash);
    expect(original.customerId).toBe(originalCustomerId);
  });

  it('maps future and opening-hour validation to 422 availability codes', async () => {
    await expectApplicationError(
      service.createAppointment(
        CUSTOMER_A,
        { ...OIL_CHANGE, startsAt: '2000-01-03T10:00:00Z' },
        'past-start',
      ),
      422,
      'START_NOT_FUTURE',
    );

    await expectApplicationError(
      service.createAppointment(
        CUSTOMER_A,
        { ...OIL_CHANGE, startsAt: '2030-01-07T20:00:00Z' },
        'outside-hours',
      ),
      422,
      'OUTSIDE_OPENING_HOURS',
    );
  });

  it('maps capacity failures to 409 using the specific availability reason', async () => {
    await service.createAppointment(CUSTOMER_A, WHEEL_ALIGNMENT_A, 'wheel-a');

    await expectApplicationError(
      service.createAppointment(CUSTOMER_B, WHEEL_ALIGNMENT_B, 'wheel-b'),
      409,
      'NO_AVAILABLE_TECHNICIAN',
    );
  });

  it('returns already-cancelled appointments but rejects late active cancellations', async () => {
    const created = await service.createAppointment(
      CUSTOMER_A,
      OIL_CHANGE,
      'cancel-once',
    );
    const cancelled = await service.cancelAppointment(
      CUSTOMER_A,
      created.appointment.id,
    );
    const replay = await service.cancelAppointment(
      CUSTOMER_A,
      created.appointment.id,
    );

    expect(replay).toEqual(cancelled);

    const em = database.orm.em.fork();
    const lateAppointment = em.create(Appointment, {
      customerId: CUSTOMER_A.customerId,
      vehicleId: seedIds.vehicles.customerASuv,
      dealershipId: seedIds.dealerships.northLoop,
      serviceId: seedIds.services.oilChange,
      technicianId: seedIds.technicians.northAlex,
      bayId: seedIds.bays.northOne,
      startsAt: new Date('2020-01-06T10:00:00.000Z'),
      endsAt: new Date('2020-01-06T10:45:00.000Z'),
      durationMinutes: 45,
      status: 'CONFIRMED',
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      cancelledAt: null,
      cancellationReason: null,
      idempotencyKey: 'late-cancel',
      requestHash: 'a'.repeat(64),
    });
    em.persist(lateAppointment);
    await em.flush();

    await expectApplicationError(
      service.cancelAppointment(CUSTOMER_A, lateAppointment.id),
      409,
      'CANCELLATION_TOO_LATE',
    );
  });

  it('rejects cancellation when a lock wait crosses the scheduled start according to DB time', async () => {
    const appointment = await insertRelativeConfirmedAppointment(database, {
      customerId: CUSTOMER_A.customerId,
      vehicleId: seedIds.vehicles.customerASuv,
      dealershipId: seedIds.dealerships.northLoop,
      serviceId: seedIds.services.oilChange,
      technicianId: seedIds.technicians.northAlex,
      bayId: seedIds.bays.northOne,
      idempotencyKey: 'cross-start-cancel',
      startsInMs: 1_200,
    });

    let resolveLockReady!: () => void;
    const lockReady = new Promise<void>((resolve) => {
      resolveLockReady = resolve;
    });
    const locker = database.orm.em.fork().transactional(
      async (tx) => {
        await tx.findOneOrFail(
          Dealership,
          { id: seedIds.dealerships.northLoop },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        resolveLockReady();
        await tx.execute(
          `
            select pg_sleep(
              greatest(0, extract(epoch from (?::timestamptz - clock_timestamp())) + 0.5)
            )
          `,
          [appointment.startsAt.toISOString()],
        );
      },
      { clear: true, isolationLevel: IsolationLevel.READ_COMMITTED },
    );

    await lockReady;
    await expectApplicationError(
      service.cancelAppointment(CUSTOMER_A, appointment.id),
      409,
      'CANCELLATION_TOO_LATE',
    );
    await locker;

    const fresh = await database.orm.em.fork().findOneOrFail(Appointment, {
      id: appointment.id,
    });
    expect(fresh.status).toBe('CONFIRMED');
    expect(fresh.cancelledAt).toBeNull();
  });

  it('replays an already-cancelled appointment after its scheduled start', async () => {
    const appointment = await insertPastCancelledAppointment(database, {
      customerId: CUSTOMER_A.customerId,
      vehicleId: seedIds.vehicles.customerASuv,
      dealershipId: seedIds.dealerships.northLoop,
      serviceId: seedIds.services.oilChange,
      technicianId: seedIds.technicians.northAlex,
      bayId: seedIds.bays.northOne,
      idempotencyKey: 'cancelled-after-start',
      cancellationReason: 'Already cancelled',
    });

    const replay = await service.cancelAppointment(
      CUSTOMER_A,
      appointment.id,
      'Replace reason',
    );

    expect(replay).toMatchObject({
      id: appointment.id,
      status: 'CANCELLED',
      cancellationReason: 'Already cancelled',
    });
    expect(replay.cancelledAt).toBe(appointment.cancelledAt.toISOString());
  });

  it('rolls back appointment creation after flush and leaves the idempotency key reusable', async () => {
    const failingService = serviceFailingAfterCreateFlush(database);

    await expectApplicationError(
      failingService.createAppointment(
        CUSTOMER_A,
        OIL_CHANGE,
        'flush-rollback',
      ),
      500,
      'INTERNAL_ERROR',
    );
    expect(
      await database.orm.em.fork().count(Appointment, {
        customerId: CUSTOMER_A.customerId,
        idempotencyKey: 'flush-rollback',
      }),
    ).toBe(0);

    const created = await service.createAppointment(
      CUSTOMER_A,
      OIL_CHANGE,
      'flush-rollback',
    );
    expect(created.created).toBe(true);
  });

  it('rolls back cancellation when an error follows the guarded update', async () => {
    const created = await service.createAppointment(
      CUSTOMER_A,
      OIL_CHANGE,
      'cancel-rollback',
    );
    const failingService = serviceFailingAfterCancelUpdate(database);

    await expectApplicationError(
      failingService.cancelAppointment(
        CUSTOMER_A,
        created.appointment.id,
        'Rollback',
      ),
      500,
      'INTERNAL_ERROR',
    );

    const fresh = await database.orm.em.fork().findOneOrFail(Appointment, {
      id: created.appointment.id,
    });
    expect(fresh.status).toBe('CONFIRMED');
    expect(fresh.cancelledAt).toBeNull();
    expect(fresh.cancellationReason).toBeNull();
  });

  it('recovers named idempotency unique collisions across different vehicles and dealers', async () => {
    const availability = new BarrierAvailabilityService(2);
    const northService = new AppointmentsService(
      database.orm.em.fork(),
      availability,
    );
    const riverService = new AppointmentsService(
      database.orm.em.fork(),
      availability,
    );
    const northRequest = {
      dealershipId: seedIds.dealerships.northLoop,
      serviceId: seedIds.services.oilChange,
      vehicleId: seedIds.vehicles.customerAHatchback,
      startsAt: '2030-01-08T10:00:00Z',
    };
    const riverRequest = {
      dealershipId: seedIds.dealerships.riverGate,
      serviceId: seedIds.services.oilChange,
      vehicleId: seedIds.vehicles.customerASuv,
      startsAt: '2030-01-08T10:00:00Z',
    };

    const results = await Promise.allSettled([
      northService.createAppointment(CUSTOMER_A, northRequest, 'same-key-race'),
      riverService.createAppointment(CUSTOMER_A, riverRequest, 'same-key-race'),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expectApplicationErrorValue(
      rejected[0]!.reason,
      409,
      'IDEMPOTENCY_CONFLICT',
    );
    expect(
      await database.orm.em.fork().count(Appointment, {
        customerId: CUSTOMER_A.customerId,
        idempotencyKey: 'same-key-race',
      }),
    ).toBe(1);
  });
});

class BarrierAvailabilityService extends AvailabilityService {
  private arrivals = 0;
  private readonly releasePromise: Promise<void>;
  private release: (() => void) | null = null;

  constructor(private readonly expectedArrivals: number) {
    super();
    this.releasePromise = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  override async evaluate(
    em: PostgreSqlEntityManager,
    principal: AuthenticatedCustomer,
    input: BookingRequest,
  ): Promise<AvailabilityDecision> {
    this.arrivals += 1;
    if (this.arrivals === this.expectedArrivals) {
      this.release?.();
    }

    await this.releasePromise;
    return super.evaluate(em, principal, input);
  }
}

function serviceFailingAfterCreateFlush(
  database: TestDatabase,
): AppointmentsService {
  return serviceWithTransactionPatch(database, (tx) => {
    const originalFlush = tx.flush.bind(tx);
    tx.flush = (async () => {
      await originalFlush();
      throw new Error('forced rollback after create flush');
    }) as typeof tx.flush;
  });
}

function serviceFailingAfterCancelUpdate(
  database: TestDatabase,
): AppointmentsService {
  return serviceWithTransactionPatch(database, (tx) => {
    const originalExecute = tx.execute.bind(tx) as ExecuteForTest;
    tx.execute = (async (
      query: ExecuteQueryForTest,
      params?: readonly unknown[] | Record<string, unknown>,
      methodOrOptions?: unknown,
    ) => {
      const result = await originalExecute(query, params, methodOrOptions);
      if (
        typeof query === 'string' &&
        query.includes('update appointments') &&
        query.includes("set status = 'CANCELLED'")
      ) {
        throw new Error('forced rollback after cancel update');
      }

      return result;
    }) as typeof tx.execute;
  });
}

type ExecuteQueryForTest = Parameters<PostgreSqlEntityManager['execute']>[0];
type ExecuteForTest = (
  query: ExecuteQueryForTest,
  params?: readonly unknown[] | Record<string, unknown>,
  methodOrOptions?: unknown,
) => Promise<unknown>;

function serviceWithTransactionPatch(
  database: TestDatabase,
  patch: (tx: PostgreSqlEntityManager) => void,
): AppointmentsService {
  const em = database.orm.em.fork();
  const originalTransactional = em.transactional.bind(em);
  em.transactional = (async (
    callback: (tx: PostgreSqlEntityManager) => unknown,
    options?: Parameters<PostgreSqlEntityManager['transactional']>[1],
  ) =>
    originalTransactional(async (tx) => {
      patch(tx);
      return callback(tx);
    }, options)) as typeof em.transactional;

  return new AppointmentsService(em, new AvailabilityService());
}

async function insertRelativeConfirmedAppointment(
  database: TestDatabase,
  input: TimedAppointmentInput & { startsInMs: number },
): Promise<{ id: string; startsAt: Date }> {
  const id = randomUUID();
  const durationMinutes = input.durationMinutes ?? 45;
  const rows = await database.orm.em
    .fork()
    .execute<{ id: string; startsAt: Date }[]>(
      `
      insert into appointments (
        id, customer_id, vehicle_id, dealership_id, service_id, technician_id, bay_id,
        starts_at, ends_at, duration_minutes, status, created_at, cancelled_at,
        cancellation_reason, idempotency_key, request_hash
      )
      values (
        ?, ?, ?, ?, ?, ?, ?,
        clock_timestamp() + (?::int * interval '1 millisecond'),
        clock_timestamp() + (?::int * interval '1 millisecond'),
        ?, 'CONFIRMED', clock_timestamp(), null, null, ?, ?
      )
      returning id, starts_at as "startsAt"
    `,
      [
        id,
        input.customerId,
        input.vehicleId,
        input.dealershipId,
        input.serviceId,
        input.technicianId,
        input.bayId,
        input.startsInMs,
        input.startsInMs + durationMinutes * 60_000,
        durationMinutes,
        input.idempotencyKey,
        input.requestHash ?? 'b'.repeat(64),
      ],
    );

  const row = rows[0]!;
  return { id: row.id, startsAt: new Date(row.startsAt) };
}

async function insertPastCancelledAppointment(
  database: TestDatabase,
  input: TimedAppointmentInput & { cancellationReason: string },
): Promise<{ id: string; cancelledAt: Date }> {
  const id = randomUUID();
  const durationMinutes = input.durationMinutes ?? 45;
  const rows = await database.orm.em
    .fork()
    .execute<{ id: string; cancelledAt: Date }[]>(
      `
      insert into appointments (
        id, customer_id, vehicle_id, dealership_id, service_id, technician_id, bay_id,
        starts_at, ends_at, duration_minutes, status, created_at, cancelled_at,
        cancellation_reason, idempotency_key, request_hash
      )
      values (
        ?, ?, ?, ?, ?, ?, ?,
        clock_timestamp() - interval '2 hours',
        clock_timestamp() - interval '2 hours' + (?::int * interval '1 minute'),
        ?, 'CANCELLED', clock_timestamp() - interval '3 hours',
        clock_timestamp() - interval '1 hour', ?, ?, ?
      )
      returning id, cancelled_at as "cancelledAt"
    `,
      [
        id,
        input.customerId,
        input.vehicleId,
        input.dealershipId,
        input.serviceId,
        input.technicianId,
        input.bayId,
        durationMinutes,
        durationMinutes,
        input.cancellationReason,
        input.idempotencyKey,
        input.requestHash ?? 'c'.repeat(64),
      ],
    );

  const row = rows[0]!;
  return { id: row.id, cancelledAt: new Date(row.cancelledAt) };
}

interface TimedAppointmentInput {
  customerId: string;
  vehicleId: string;
  dealershipId: string;
  serviceId: string;
  technicianId: string;
  bayId: string;
  idempotencyKey: string;
  requestHash?: string;
  durationMinutes?: number;
}

async function expectApplicationError(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expectApplicationErrorValue(error, status, code);
    return;
  }

  throw new Error(`Expected ${code} ApplicationError.`);
}

function expectApplicationErrorValue(
  error: unknown,
  status: number,
  code: string,
): void {
  expect(error).toBeInstanceOf(ApplicationError);
  expect((error as ApplicationError).getStatus()).toBe(status);
  expect((error as ApplicationError).getResponse()).toMatchObject({ code });
}
