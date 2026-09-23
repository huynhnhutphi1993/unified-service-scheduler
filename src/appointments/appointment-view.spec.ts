import { toAppointmentView } from './appointment-view.js';
import type { Appointment } from '../database/entities/index.js';

describe('toAppointmentView', () => {
  it('serializes appointment dates as ISO strings', () => {
    const appointment = {
      id: '00000000-0000-4000-8000-000000000001',
      customerId: '00000000-0000-4000-8000-000000000002',
      vehicleId: '00000000-0000-4000-8000-000000000003',
      dealershipId: '00000000-0000-4000-8000-000000000004',
      serviceId: '00000000-0000-4000-8000-000000000005',
      technicianId: '00000000-0000-4000-8000-000000000006',
      bayId: '00000000-0000-4000-8000-000000000007',
      startsAt: new Date('2030-01-01T02:00:00.000Z'),
      endsAt: new Date('2030-01-01T03:00:00.000Z'),
      durationMinutes: 60,
      status: 'CANCELLED',
      createdAt: new Date('2029-12-01T00:00:00.000Z'),
      cancelledAt: new Date('2029-12-02T00:00:00.000Z'),
      cancellationReason: 'Changed plans',
      idempotencyKey: 'create-1',
      requestHash: 'hash',
    } satisfies Appointment;

    expect(toAppointmentView(appointment)).toEqual({
      id: appointment.id,
      customerId: appointment.customerId,
      vehicleId: appointment.vehicleId,
      dealershipId: appointment.dealershipId,
      serviceId: appointment.serviceId,
      technicianId: appointment.technicianId,
      bayId: appointment.bayId,
      startsAt: '2030-01-01T02:00:00.000Z',
      endsAt: '2030-01-01T03:00:00.000Z',
      durationMinutes: 60,
      status: 'CANCELLED',
      createdAt: '2029-12-01T00:00:00.000Z',
      cancelledAt: '2029-12-02T00:00:00.000Z',
      cancellationReason: 'Changed plans',
    });
  });
});
