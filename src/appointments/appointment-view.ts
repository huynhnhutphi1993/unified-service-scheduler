import type { AppointmentView } from '../common/contracts.js';
import type { Appointment } from '../database/entities/index.js';

export function toAppointmentView(appointment: Appointment): AppointmentView {
  return {
    id: appointment.id,
    customerId: appointment.customerId,
    vehicleId: appointment.vehicleId,
    dealershipId: appointment.dealershipId,
    serviceId: appointment.serviceId,
    technicianId: appointment.technicianId,
    bayId: appointment.bayId,
    startsAt: dateToIso(appointment.startsAt),
    endsAt: dateToIso(appointment.endsAt),
    durationMinutes: appointment.durationMinutes,
    status: appointment.status,
    createdAt: dateToIso(appointment.createdAt),
    cancelledAt: nullableDateToIso(appointment.cancelledAt),
    cancellationReason: appointment.cancellationReason,
  };
}

function nullableDateToIso(value: Date | string | null): string | null {
  return value === null ? null : dateToIso(value);
}

function dateToIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
