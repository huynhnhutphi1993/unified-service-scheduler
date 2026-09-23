import 'dotenv/config';
import {
  MikroORM,
  type EntityManager as PostgreSqlEntityManager,
} from '@mikro-orm/postgresql';
import { pathToFileURL } from 'node:url';
import { foundationSeedData } from './seed-data.js';
import { createMigrationMikroOrmConfig } from './mikro-orm-config.factory.js';

type Scalar = string | number | null;
type SqlRow = readonly Scalar[];

function valuesPlaceholders(rows: readonly SqlRow[]): string {
  return rows.map((row) => `(${row.map(() => '?').join(', ')})`).join(', ');
}

async function upsertRows(
  em: PostgreSqlEntityManager,
  tableName: string,
  columnNames: readonly string[],
  conflictTarget: readonly string[],
  updateColumns: readonly string[],
  rows: readonly SqlRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const conflict = conflictTarget.join(', ');
  const updates =
    updateColumns.length === 0
      ? 'nothing'
      : `update set ${updateColumns
          .map((columnName) => `${columnName} = excluded.${columnName}`)
          .join(', ')}`;
  const sql = `
    insert into ${tableName} (${columnNames.join(', ')})
    values ${valuesPlaceholders(rows)}
    on conflict (${conflict}) do ${updates};
  `;

  await em.execute(sql, rows.flat());
}

export async function seedFoundation(
  em: PostgreSqlEntityManager,
): Promise<void> {
  await upsertRows(
    em,
    'customers',
    ['id', 'name'],
    ['id'],
    ['name'],
    foundationSeedData.customers.map(({ id, name }) => [id, name]),
  );

  await upsertRows(
    em,
    'dealerships',
    ['id', 'name', 'time_zone'],
    ['id'],
    ['name', 'time_zone'],
    foundationSeedData.dealerships.map(({ id, name, timeZone }) => [
      id,
      name,
      timeZone,
    ]),
  );

  await upsertRows(
    em,
    'services',
    ['id', 'name', 'duration_minutes'],
    ['id'],
    ['name', 'duration_minutes'],
    foundationSeedData.services.map(({ id, name, durationMinutes }) => [
      id,
      name,
      durationMinutes,
    ]),
  );

  await upsertRows(
    em,
    'vehicles',
    ['id', 'customer_id', 'registration'],
    ['id'],
    ['customer_id', 'registration'],
    foundationSeedData.vehicles.map(({ id, customerId, registration }) => [
      id,
      customerId,
      registration,
    ]),
  );

  await upsertRows(
    em,
    'opening_hours',
    ['id', 'dealership_id', 'day_of_week', 'opens_at', 'closes_at'],
    ['id'],
    ['dealership_id', 'day_of_week', 'opens_at', 'closes_at'],
    foundationSeedData.openingHours.map(
      ({ id, dealershipId, dayOfWeek, opensAt, closesAt }) => [
        id,
        dealershipId,
        dayOfWeek,
        opensAt,
        closesAt,
      ],
    ),
  );

  await upsertRows(
    em,
    'technicians',
    ['id', 'dealership_id', 'name'],
    ['id'],
    ['dealership_id', 'name'],
    foundationSeedData.technicians.map(({ id, dealershipId, name }) => [
      id,
      dealershipId,
      name,
    ]),
  );

  await upsertRows(
    em,
    'technician_services',
    ['technician_id', 'service_id'],
    ['technician_id', 'service_id'],
    [],
    foundationSeedData.technicianServices.map(({ technicianId, serviceId }) => [
      technicianId,
      serviceId,
    ]),
  );

  await upsertRows(
    em,
    'bays',
    ['id', 'dealership_id', 'name'],
    ['id'],
    ['dealership_id', 'name'],
    foundationSeedData.bays.map(({ id, dealershipId, name }) => [
      id,
      dealershipId,
      name,
    ]),
  );
}

async function main(): Promise<void> {
  const orm = await MikroORM.init(createMigrationMikroOrmConfig());

  try {
    await seedFoundation(orm.em.fork());
    console.log('Database foundation seed complete.');
  } finally {
    await orm.close(true);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
