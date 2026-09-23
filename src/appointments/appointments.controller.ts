import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { BookingRequestDto } from '../availability/booking-request.dto.js';
import type {
  AppointmentView,
  AuthenticatedCustomer,
} from '../common/contracts.js';
import { CurrentCustomer } from '../auth/decorators/current-customer.decorator.js';
import { AppointmentsService } from './appointments.service.js';
import { AppointmentResponseDto } from './dto/appointment-response.dto.js';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto.js';

@ApiTags('Appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: '1 to 128 visible ASCII characters.',
    schema: {
      maxLength: 128,
      minLength: 1,
      pattern: '^[\\x21-\\x7E]{1,128}$',
      type: 'string',
    },
  })
  @ApiCreatedResponse({
    description: 'Appointment created.',
    type: AppointmentResponseDto,
  })
  @ApiOkResponse({
    description: 'Idempotent replay.',
    type: AppointmentResponseDto,
  })
  async create(
    @CurrentCustomer() principal: AuthenticatedCustomer,
    @Body() request: BookingRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AppointmentView> {
    const result = await this.appointmentsService.createAppointment(
      principal,
      request,
      idempotencyKey,
    );
    response.status(result.created ? 201 : 200);
    return result.appointment;
  }

  @Get(':id')
  @ApiOkResponse({
    description: 'Appointment details.',
    type: AppointmentResponseDto,
  })
  get(
    @CurrentCustomer() principal: AuthenticatedCustomer,
    @Param('id', new ParseUUIDPipe()) appointmentId: string,
  ): Promise<AppointmentView> {
    return this.appointmentsService.getAppointment(principal, appointmentId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOkResponse({
    description: 'Appointment after cancellation.',
    type: AppointmentResponseDto,
  })
  cancel(
    @CurrentCustomer() principal: AuthenticatedCustomer,
    @Param('id', new ParseUUIDPipe()) appointmentId: string,
    @Body() request: CancelAppointmentDto,
  ): Promise<AppointmentView> {
    return this.appointmentsService.cancelAppointment(
      principal,
      appointmentId,
      request.reason,
    );
  }
}
