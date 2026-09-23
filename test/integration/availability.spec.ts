import { DateTime } from 'luxon';
import { AvailabilityService } from '../../src/availability/availability.service.js';
import { Appointment } from '../../src/database/entities/index.js';
import { seedIds } from '../../src/database/seed-data.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

let db: TestDatabase;
const availability = new AvailabilityService();
const principal = {
  userId: '80000000-0000-4000-8000-000000000001',
  customerId: seedIds.customers.customerA,
};

function request() {
  let start = DateTime.now()
    .setZone('Europe/London')
    .plus({ days: 7 })
    .startOf('day')
    .set({ hour: 10 });
  while (start.weekday > 5) start = start.plus({ days: 1 });
  return {
    dealershipId: seedIds.dealerships.northLoop,
    vehicleId: seedIds.vehicles.customerAHatchback,
    serviceId: seedIds.services.oilChange,
    startsAt: start.toUTC().toISO()!,
  };
}

beforeAll(async () => {
  db = await createTestDatabase();
});
beforeEach(async () => {
  await db.reset();
});
afterAll(async () => {
  await db?.close();
});

it('selects qualified resources deterministically and calculates the service duration', async () => {
  const result = await availability.evaluate(
    db.orm.em.fork(),
    principal,
    request(),
  );
  expect(result).toMatchObject({
    available: true,
    technicianId: seedIds.technicians.northAlex,
    bayId: seedIds.bays.northOne,
    durationMinutes: 45,
  });
  expect(
    new Date(result.endsAt).getTime() - new Date(result.startsAt).getTime(),
  ).toBe(45 * 60_000);
});

it('rejects unknown resources and vehicles belonging to another customer', async () => {
  await expect(
    availability.evaluate(db.orm.em.fork(), principal, {
      ...request(),
      vehicleId: seedIds.vehicles.customerBEstate,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    availability.evaluate(db.orm.em.fork(), principal, {
      ...request(),
      dealershipId: '30000000-0000-4000-8000-000000000099',
    }),
  ).rejects.toMatchObject({ status: 404 });
});

it('distinguishes missing qualifications from a dealer without a free bay', async () => {
  const result = await availability.evaluate(db.orm.em.fork(), principal, {
    ...request(),
    dealershipId: seedIds.dealerships.riverGate,
    serviceId: seedIds.services.safetyInspection,
  });
  expect(result.reason).toBe('NO_QUALIFIED_TECHNICIAN');
  await db.orm.em
    .fork()
    .execute('delete from bays where dealership_id = ?', [
      seedIds.dealerships.northLoop,
    ]);
  expect(
    (await availability.evaluate(db.orm.em.fork(), principal, request()))
      .reason,
  ).toBe('NO_AVAILABLE_BAY');
});

it('reads uncommitted occupancy using the caller transaction and sees rollback release it', async () => {
  const input = request();
  const tx = db.orm.em.fork();
  await tx.begin();
  try {
    const row = tx.create(Appointment, {
      customerId: principal.customerId,
      vehicleId: input.vehicleId,
      dealershipId: input.dealershipId,
      serviceId: input.serviceId,
      technicianId: seedIds.technicians.northAlex,
      bayId: seedIds.bays.northOne,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(new Date(input.startsAt).getTime() + 45 * 60_000),
      durationMinutes: 45,
      status: 'CONFIRMED',
      createdAt: new Date(),
      cancelledAt: null,
      cancellationReason: null,
      idempotencyKey: 'transaction-snapshot',
      requestHash: 'a'.repeat(64),
    });
    tx.persist(row);
    await tx.flush();
    expect((await availability.evaluate(tx, principal, input)).reason).toBe(
      'VEHICLE_CONFLICT',
    );
    const anotherVehicle = await availability.evaluate(tx, principal, {
      ...input,
      vehicleId: seedIds.vehicles.customerASuv,
    });
    expect(anotherVehicle).toMatchObject({
      available: true,
      technicianId: seedIds.technicians.northBlair,
      bayId: seedIds.bays.northTwo,
    });
    await tx.execute(
      "update appointments set status='CANCELLED', cancelled_at=clock_timestamp() where id=?",
      [row.id],
    );
    expect((await availability.evaluate(tx, principal, input)).available).toBe(
      true,
    );
  } finally {
    await tx.rollback();
  }
  expect(
    (await availability.evaluate(db.orm.em.fork(), principal, input)).available,
  ).toBe(true);
});
