import { DateTime } from 'luxon';
import { ApplicationError } from '../common/application-error.js';
import type { AvailabilityReason } from '../common/contracts.js';

export interface DailyOpeningHours {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

export function evaluateServiceWindow(
  startsAt: string,
  durationMinutes: number,
  timeZone: string,
  openingHours: DailyOpeningHours[],
  now: Date,
): {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  reason?: AvailabilityReason;
} {
  const start = DateTime.fromISO(startsAt, { setZone: true }).toUTC();
  const end = start.plus({ minutes: durationMinutes });
  const localStart = start.setZone(timeZone);
  if (
    !localStart.isValid ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0
  ) {
    throw new ApplicationError(
      500,
      'INVALID_SCHEDULE_CONFIGURATION',
      'The service schedule is unavailable.',
    );
  }
  const result = {
    startsAt: start.toISO()!,
    endsAt: end.toISO()!,
    durationMinutes,
  };
  if (start.toMillis() <= now.getTime())
    return { ...result, reason: 'START_NOT_FUTURE' };

  const hours = openingHours.find(
    (entry) => entry.dayOfWeek === localStart.weekday,
  );
  if (!hours) return { ...result, reason: 'OUTSIDE_OPENING_HOURS' };
  const opening = localBoundary(localStart, hours.opensAt);
  const closing = localBoundary(localStart, hours.closesAt);
  if (closing.toMillis() <= opening.toMillis()) {
    throw new ApplicationError(
      500,
      'INVALID_SCHEDULE_CONFIGURATION',
      'The service schedule is unavailable.',
    );
  }
  if (
    start.toMillis() < opening.toMillis() ||
    end.toMillis() > closing.toMillis()
  ) {
    return { ...result, reason: 'OUTSIDE_OPENING_HOURS' };
  }
  return result;
}

function localBoundary(day: DateTime, time: string): DateTime {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new ApplicationError(
      500,
      'INVALID_SCHEDULE_CONFIGURATION',
      'The service schedule is unavailable.',
    );
  }
  const [hour, minute] = time.split(':').map(Number);
  const boundary = DateTime.fromObject(
    { year: day.year, month: day.month, day: day.day, hour, minute },
    { zone: day.zoneName! },
  );
  // Luxon adjusts nonexistent local times. Reject that adjustment and ambiguous
  // opening boundaries instead of silently changing the configured business day.
  if (
    !boundary.isValid ||
    boundary.toFormat('HH:mm') !== time ||
    boundary.getPossibleOffsets().length !== 1
  ) {
    throw new ApplicationError(
      500,
      'INVALID_SCHEDULE_CONFIGURATION',
      'The service schedule is unavailable.',
    );
  }
  return boundary;
}
