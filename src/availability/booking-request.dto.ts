import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Validate, ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { DateTime } from 'luxon';
import { ApplicationError } from '../common/application-error.js';
import type { BookingRequest } from '../common/contracts.js';

const OFFSET_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export function isOffsetTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    OFFSET_TIMESTAMP.test(value) &&
    DateTime.fromISO(value, { setZone: true }).isValid
  );
}

@ValidatorConstraint({ name: 'offsetTimestamp', async: false })
export class OffsetTimestampValidator implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isOffsetTimestamp(value);
  }

  defaultMessage(): string {
    return 'startsAt must be a valid ISO timestamp with seconds, an explicit offset and at most millisecond precision';
  }
}

export class BookingRequestDto implements BookingRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dealershipId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  vehicleId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ format: 'date-time', example: '2030-10-01T09:00:00+07:00' })
  @Validate(OffsetTimestampValidator)
  startsAt!: string;
}

export function normalizeBookingRequest(
  request: BookingRequest,
): BookingRequest {
  if (!isOffsetTimestamp(request.startsAt)) {
    throw new ApplicationError(
      400,
      'VALIDATION_ERROR',
      'A valid timestamp with an explicit offset is required.',
    );
  }
  return {
    dealershipId: request.dealershipId.toLowerCase(),
    vehicleId: request.vehicleId.toLowerCase(),
    serviceId: request.serviceId.toLowerCase(),
    startsAt: DateTime.fromISO(request.startsAt, { setZone: true })
      .toUTC()
      .toISO()!,
  };
}
