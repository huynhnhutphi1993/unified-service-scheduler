import { DateTime } from 'luxon';
import { evaluateServiceWindow } from './service-window.js';
import {
  isOffsetTimestamp,
  normalizeBookingRequest,
} from './booking-request.dto.js';

const now = new Date('2026-01-01T00:00:00Z');
const weekdayHours = Array.from({ length: 5 }, (_, index) => ({
  dayOfWeek: index + 1,
  opensAt: '08:00',
  closesAt: '17:00',
}));

describe('timestamp contract', () => {
  it.each([
    '2026-02-30T09:00:00Z',
    '2026-10-01T09:00:00',
    '2026-10-01T24:00:00Z',
    '2026-10-01T09:00:00.1234Z',
    '2026-13-01T09:00:00Z',
  ])('rejects invalid timestamp %s', (value) => {
    expect(isOffsetTimestamp(value)).toBe(false);
  });

  it('normalizes different offsets representing the same instant identically', () => {
    const base = {
      dealershipId: 'A',
      serviceId: 'B',
      vehicleId: 'C',
      startsAt: '2026-10-01T09:00:00+07:00',
    };
    expect(normalizeBookingRequest(base)).toEqual(
      normalizeBookingRequest({ ...base, startsAt: '2026-10-01T02:00:00Z' }),
    );
  });
});

describe('service window', () => {
  it('allows opening boundary and a service ending exactly at closing', () => {
    expect(
      evaluateServiceWindow(
        '2026-10-01T08:00:00+07:00',
        60,
        'Asia/Ho_Chi_Minh',
        weekdayHours,
        now,
      ).reason,
    ).toBeUndefined();
    expect(
      evaluateServiceWindow(
        '2026-10-01T16:00:00+07:00',
        60,
        'Asia/Ho_Chi_Minh',
        weekdayHours,
        now,
      ).endsAt,
    ).toBe('2026-10-01T10:00:00.000Z');
  });

  it('checks the full duration, local weekday, and strict future boundary', () => {
    expect(
      evaluateServiceWindow(
        '2026-10-01T16:01:00+07:00',
        60,
        'Asia/Ho_Chi_Minh',
        weekdayHours,
        now,
      ).reason,
    ).toBe('OUTSIDE_OPENING_HOURS');
    expect(
      evaluateServiceWindow(
        '2026-10-03T09:00:00+07:00',
        60,
        'Asia/Ho_Chi_Minh',
        weekdayHours,
        now,
      ).reason,
    ).toBe('OUTSIDE_OPENING_HOURS');
    expect(
      evaluateServiceWindow(now.toISOString(), 60, 'UTC', weekdayHours, now)
        .reason,
    ).toBe('START_NOT_FUTURE');
  });

  it('uses dealership timezone rather than the input offset for opening hours', () => {
    expect(
      evaluateServiceWindow(
        '2026-10-01T01:00:00Z',
        60,
        'Asia/Ho_Chi_Minh',
        weekdayHours,
        now,
      ).reason,
    ).toBeUndefined();
    expect(
      evaluateServiceWindow(
        '2026-10-01T01:00:00Z',
        60,
        'Europe/London',
        weekdayHours,
        now,
      ).reason,
    ).toBe('OUTSIDE_OPENING_HOURS');
  });

  it('adds elapsed minutes correctly across daylight saving transitions', () => {
    const sunday = [{ dayOfWeek: 7, opensAt: '00:00', closesAt: '05:00' }];
    const spring = evaluateServiceWindow(
      '2026-03-29T00:30:00Z',
      120,
      'Europe/London',
      sunday,
      now,
    );
    expect(spring.reason).toBeUndefined();
    expect(
      DateTime.fromISO(spring.endsAt)
        .setZone('Europe/London')
        .toFormat('HH:mm'),
    ).toBe('03:30');
    const autumn = evaluateServiceWindow(
      '2026-10-25T00:30:00Z',
      120,
      'Europe/London',
      sunday,
      now,
    );
    expect(autumn.reason).toBeUndefined();
    expect(
      DateTime.fromISO(autumn.endsAt).toMillis() -
        DateTime.fromISO(autumn.startsAt).toMillis(),
    ).toBe(120 * 60_000);
  });

  it('fails safely for nonexistent or ambiguous opening boundaries', () => {
    const sunday = [{ dayOfWeek: 7, opensAt: '01:30', closesAt: '05:00' }];
    expect(() =>
      evaluateServiceWindow(
        '2026-03-29T02:00:00Z',
        60,
        'Europe/London',
        sunday,
        now,
      ),
    ).toThrow();
    expect(() =>
      evaluateServiceWindow(
        '2026-10-25T02:00:00Z',
        60,
        'Europe/London',
        sunday,
        now,
      ),
    ).toThrow();
  });
});
