import { ApiProperty } from '@nestjs/swagger';
import type { AppointmentView } from '../../common/contracts.js';

export class AppointmentResponseDto implements AppointmentView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ format: 'uuid' })
  dealershipId!: string;

  @ApiProperty({ format: 'uuid' })
  serviceId!: string;

  @ApiProperty({ format: 'uuid' })
  technicianId!: string;

  @ApiProperty({ format: 'uuid' })
  bayId!: string;

  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ example: 45 })
  durationMinutes!: number;

  @ApiProperty({ enum: ['CONFIRMED', 'CANCELLED'] })
  status!: 'CONFIRMED' | 'CANCELLED';

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  cancelledAt!: string | null;

  @ApiProperty({ nullable: true, type: String })
  cancellationReason!: string | null;
}
