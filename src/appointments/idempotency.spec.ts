import {
  calculateAppointmentRequestHash,
  normalizeIdempotencyKey,
} from './idempotency.js';

describe('appointment idempotency helpers', () => {
  const request = {
    customerId: '00000000-0000-4000-8000-000000000001',
    booking: {
      dealershipId: '00000000-0000-4000-8000-000000000002',
      vehicleId: '00000000-0000-4000-8000-000000000003',
      serviceId: '00000000-0000-4000-8000-000000000004',
      startsAt: '2030-01-01T02:00:00.000Z',
    },
  };

  it('accepts only visible ASCII idempotency keys', () => {
    expect(normalizeIdempotencyKey('create-1')).toBe('create-1');
    expect(() => normalizeIdempotencyKey('')).toThrow('Idempotency-Key');
    expect(() => normalizeIdempotencyKey('has space')).toThrow(
      'Idempotency-Key',
    );
    expect(() => normalizeIdempotencyKey('x'.repeat(129))).toThrow(
      'Idempotency-Key',
    );
  });

  it('hashes the canonical customer-scoped appointment tuple', () => {
    const first = calculateAppointmentRequestHash(
      request.customerId,
      request.booking,
    );
    const replay = calculateAppointmentRequestHash(request.customerId, {
      ...request.booking,
    });
    const changed = calculateAppointmentRequestHash(request.customerId, {
      ...request.booking,
      startsAt: '2030-01-01T03:00:00.000Z',
    });

    expect(first).toBe(replay);
    expect(first).not.toBe(changed);
  });
});
