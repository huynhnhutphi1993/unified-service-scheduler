import { createHash } from 'node:crypto';
import { ApplicationError } from '../common/application-error.js';
import type { BookingRequest } from '../common/contracts.js';
import type { Appointment } from '../database/entities/index.js';

const IDEMPOTENCY_KEY = /^[\x21-\x7E]{1,128}$/;

export function normalizeIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) {
    throw new ApplicationError(
      400,
      'VALIDATION_ERROR',
      'Idempotency-Key must be 1 to 128 visible ASCII characters.',
    );
  }

  return value;
}

export function calculateAppointmentRequestHash(
  customerId: string,
  request: BookingRequest,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        customerId,
        request.vehicleId,
        request.dealershipId,
        request.serviceId,
        request.startsAt,
      ]),
    )
    .digest('hex');
}

export function assertSameIdempotentRequest(
  appointment: Appointment,
  requestHash: string,
): void {
  if (appointment.requestHash !== requestHash) {
    throw new ApplicationError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'Idempotency-Key was already used for a different appointment request.',
    );
  }
}
