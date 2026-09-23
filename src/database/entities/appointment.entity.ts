import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'node:crypto';

export type AppointmentStatus = 'CONFIRMED' | 'CANCELLED';

@Entity({ tableName: 'appointments' })
export class Appointment {
  @PrimaryKey({ fieldName: 'id', type: 'uuid', columnType: 'uuid' })
  id: string = randomUUID();

  @Property({ fieldName: 'customer_id', type: 'uuid', columnType: 'uuid' })
  customerId!: string;

  @Property({ fieldName: 'vehicle_id', type: 'uuid', columnType: 'uuid' })
  vehicleId!: string;

  @Property({ fieldName: 'dealership_id', type: 'uuid', columnType: 'uuid' })
  dealershipId!: string;

  @Property({ fieldName: 'service_id', type: 'uuid', columnType: 'uuid' })
  serviceId!: string;

  @Property({ fieldName: 'technician_id', type: 'uuid', columnType: 'uuid' })
  technicianId!: string;

  @Property({ fieldName: 'bay_id', type: 'uuid', columnType: 'uuid' })
  bayId!: string;

  @Property({
    fieldName: 'starts_at',
    type: 'Date',
    columnType: 'timestamptz(3)',
  })
  startsAt!: Date;

  @Property({
    fieldName: 'ends_at',
    type: 'Date',
    columnType: 'timestamptz(3)',
  })
  endsAt!: Date;

  @Property({
    fieldName: 'duration_minutes',
    type: 'number',
    columnType: 'integer',
  })
  durationMinutes!: number;

  @Property({ fieldName: 'status', type: 'string', columnType: 'text' })
  status: AppointmentStatus = 'CONFIRMED';

  @Property({
    fieldName: 'created_at',
    type: 'Date',
    columnType: 'timestamptz(3)',
  })
  createdAt: Date = new Date();

  @Property({
    fieldName: 'cancelled_at',
    type: 'Date',
    columnType: 'timestamptz(3)',
    nullable: true,
  })
  cancelledAt: Date | null = null;

  @Property({
    fieldName: 'cancellation_reason',
    type: 'text',
    columnType: 'text',
    nullable: true,
  })
  cancellationReason: string | null = null;

  @Property({ fieldName: 'idempotency_key', type: 'text', columnType: 'text' })
  idempotencyKey!: string;

  @Property({ fieldName: 'request_hash', type: 'text', columnType: 'text' })
  requestHash!: string;
}
