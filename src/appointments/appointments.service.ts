import { Injectable } from '@nestjs/common';
import { IsolationLevel, LockMode } from '@mikro-orm/core';
import { EntityManager as PostgreSqlEntityManager } from '@mikro-orm/postgresql';
import { ApplicationError } from '../common/application-error.js';
import type {
  AppointmentView,
  AuthenticatedCustomer,
  AvailabilityReason,
  BookingRequest,
} from '../common/contracts.js';
import {
  Appointment,
  Dealership,
  Vehicle,
} from '../database/entities/index.js';
import { AvailabilityService } from '../availability/availability.service.js';
import {
  normalizeBookingRequest,
  type BookingRequestDto,
} from '../availability/booking-request.dto.js';
import { toAppointmentView } from './appointment-view.js';
import {
  assertSameIdempotentRequest,
  calculateAppointmentRequestHash,
  normalizeIdempotencyKey,
} from './idempotency.js';
import {
  isIdempotencyUniqueViolation,
  isKnownResourceConflict,
  isTransientDatabaseFailure,
} from './database-errors.js';

export interface CreateAppointmentResult {
  appointment: AppointmentView;
  created: boolean;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly em: PostgreSqlEntityManager,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async createAppointment(
    principal: AuthenticatedCustomer,
    requestDto: BookingRequestDto,
    rawIdempotencyKey: unknown,
  ): Promise<CreateAppointmentResult> {
    const idempotencyKey = normalizeIdempotencyKey(rawIdempotencyKey);
    const request = normalizeBookingRequest(requestDto);
    const requestHash = calculateAppointmentRequestHash(
      principal.customerId,
      request,
    );

    const existing = await this.findReplay(
      this.em,
      principal.customerId,
      idempotencyKey,
    );
    if (existing) {
      assertSameIdempotentRequest(existing, requestHash);
      return { appointment: toAppointmentView(existing), created: false };
    }

    try {
      return await this.em.transactional(
        async (tx) =>
          this.createAppointmentInTransaction(
            tx,
            principal,
            request,
            idempotencyKey,
            requestHash,
          ),
        {
          clear: true,
          isolationLevel: IsolationLevel.READ_COMMITTED,
        },
      );
    } catch (error) {
      return this.handleCreateError(
        error,
        principal.customerId,
        idempotencyKey,
        requestHash,
      );
    }
  }

  async getAppointment(
    principal: AuthenticatedCustomer,
    appointmentId: string,
  ): Promise<AppointmentView> {
    const appointment = await this.em.findOne(Appointment, {
      id: appointmentId.toLowerCase(),
      customerId: principal.customerId,
    });

    if (!appointment) {
      throw new ApplicationError(
        404,
        'APPOINTMENT_NOT_FOUND',
        'Appointment was not found.',
      );
    }

    return toAppointmentView(appointment);
  }

  async cancelAppointment(
    principal: AuthenticatedCustomer,
    appointmentId: string,
    reason?: string,
  ): Promise<AppointmentView> {
    const id = appointmentId.toLowerCase();
    const initialAppointment = await this.em.findOne(Appointment, {
      id,
      customerId: principal.customerId,
    });

    if (!initialAppointment) {
      throw new ApplicationError(
        404,
        'APPOINTMENT_NOT_FOUND',
        'Appointment was not found.',
      );
    }

    try {
      return await this.em.transactional(
        async (tx) =>
          this.cancelAppointmentInTransaction(tx, initialAppointment, reason),
        {
          clear: true,
          isolationLevel: IsolationLevel.READ_COMMITTED,
        },
      );
    } catch (error) {
      throw this.mapDatabaseError(error);
    }
  }

  private async createAppointmentInTransaction(
    tx: PostgreSqlEntityManager,
    principal: AuthenticatedCustomer,
    request: BookingRequest,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<CreateAppointmentResult> {
    await this.lockDealership(tx, request.dealershipId);
    await this.lockVehicle(tx, principal.customerId, request.vehicleId);

    const replay = await this.findReplay(
      tx,
      principal.customerId,
      idempotencyKey,
      true,
    );
    if (replay) {
      assertSameIdempotentRequest(replay, requestHash);
      return { appointment: toAppointmentView(replay), created: false };
    }

    const availability = await this.availabilityService.evaluate(
      tx,
      principal,
      request,
    );
    if (!availability.available) {
      throw availabilityRejection(availability.reason);
    }
    if (!availability.technicianId) {
      throw availabilityRejection('NO_AVAILABLE_TECHNICIAN');
    }
    if (!availability.bayId) {
      throw availabilityRejection('NO_AVAILABLE_BAY');
    }

    const appointment = tx.create(Appointment, {
      customerId: principal.customerId,
      vehicleId: request.vehicleId,
      dealershipId: request.dealershipId,
      serviceId: request.serviceId,
      technicianId: availability.technicianId,
      bayId: availability.bayId,
      startsAt: new Date(availability.startsAt),
      endsAt: new Date(availability.endsAt),
      durationMinutes: availability.durationMinutes,
      status: 'CONFIRMED',
      createdAt: new Date(),
      cancelledAt: null,
      cancellationReason: null,
      idempotencyKey,
      requestHash,
    });

    tx.persist(appointment);

    // Allocation may outlast startsAt. Make the final decision using DB time.
    const [decision] = await tx.execute<{ starts_in_future: boolean }[]>(
      'select ?::timestamptz > clock_timestamp() as starts_in_future',
      [appointment.startsAt],
    );
    if (!decision.starts_in_future) {
      throw availabilityRejection('START_NOT_FUTURE');
    }

    await tx.flush();
    return { appointment: toAppointmentView(appointment), created: true };
  }

  private async cancelAppointmentInTransaction(
    tx: PostgreSqlEntityManager,
    initialAppointment: Appointment,
    reason?: string,
  ): Promise<AppointmentView> {
    await this.lockDealership(tx, initialAppointment.dealershipId);
    await this.lockVehicle(
      tx,
      initialAppointment.customerId,
      initialAppointment.vehicleId,
    );

    const appointment = await tx.findOne(
      Appointment,
      {
        id: initialAppointment.id,
        customerId: initialAppointment.customerId,
      },
      { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
    );

    if (!appointment) {
      throw new ApplicationError(
        404,
        'APPOINTMENT_NOT_FOUND',
        'Appointment was not found.',
      );
    }
    if (appointment.status === 'CANCELLED') {
      return toAppointmentView(appointment);
    }

    const updated = await tx.execute<{ id: string }[]>(
      `
        update appointments
        set status = 'CANCELLED',
            cancelled_at = clock_timestamp(),
            cancellation_reason = ?
        where id = ?
          and customer_id = ?
          and status = 'CONFIRMED'
          and starts_at > clock_timestamp()
        returning id
      `,
      [reason ?? null, appointment.id, appointment.customerId],
    );

    if (updated.length === 0) {
      const refreshed = await tx.findOne(
        Appointment,
        { id: appointment.id, customerId: appointment.customerId },
        { refresh: true },
      );
      if (refreshed?.status === 'CANCELLED') {
        return toAppointmentView(refreshed);
      }

      throw new ApplicationError(
        409,
        'CANCELLATION_TOO_LATE',
        'Appointment cannot be cancelled at or after its scheduled start.',
      );
    }

    const refreshed = await tx.findOne(
      Appointment,
      { id: appointment.id, customerId: appointment.customerId },
      { refresh: true },
    );
    if (!refreshed) {
      throw new ApplicationError(
        404,
        'APPOINTMENT_NOT_FOUND',
        'Appointment was not found.',
      );
    }

    return toAppointmentView(refreshed);
  }

  private async findReplay(
    em: PostgreSqlEntityManager,
    customerId: string,
    idempotencyKey: string,
    lock = false,
  ): Promise<Appointment | null> {
    return em.findOne(
      Appointment,
      { customerId, idempotencyKey },
      lock
        ? { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true }
        : undefined,
    );
  }

  private async lockDealership(
    em: PostgreSqlEntityManager,
    dealershipId: string,
  ): Promise<void> {
    const dealership = await em.findOne(
      Dealership,
      { id: dealershipId },
      { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
    );

    if (!dealership) {
      throw new ApplicationError(
        404,
        'DEALERSHIP_NOT_FOUND',
        'Dealership was not found.',
      );
    }
  }

  private async lockVehicle(
    em: PostgreSqlEntityManager,
    customerId: string,
    vehicleId: string,
  ): Promise<void> {
    const vehicle = await em.findOne(
      Vehicle,
      { id: vehicleId, customerId },
      { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
    );

    if (!vehicle) {
      throw new ApplicationError(
        404,
        'VEHICLE_NOT_FOUND',
        'Vehicle was not found.',
      );
    }
  }

  private async handleCreateError(
    error: unknown,
    customerId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<CreateAppointmentResult> {
    if (error instanceof ApplicationError) {
      throw error;
    }

    if (isIdempotencyUniqueViolation(error)) {
      const replay = await this.findReplay(
        this.em.fork({ clear: true }),
        customerId,
        idempotencyKey,
      );
      if (replay) {
        assertSameIdempotentRequest(replay, requestHash);
        return { appointment: toAppointmentView(replay), created: false };
      }
    }

    throw this.mapDatabaseError(error);
  }

  private mapDatabaseError(error: unknown): ApplicationError {
    if (error instanceof ApplicationError) {
      return error;
    }
    if (isKnownResourceConflict(error)) {
      return new ApplicationError(
        409,
        'RESOURCE_CONFLICT',
        'Requested appointment conflicts with an existing confirmed appointment.',
      );
    }
    if (isTransientDatabaseFailure(error)) {
      return new ApplicationError(
        503,
        'DATABASE_UNAVAILABLE',
        'Database could not complete the request. Please retry later.',
      );
    }

    return new ApplicationError(
      500,
      'INTERNAL_ERROR',
      'Unexpected application error.',
    );
  }
}

function availabilityRejection(
  reason: AvailabilityReason | undefined,
): ApplicationError {
  const code = reason ?? 'NO_AVAILABLE_SLOT';
  const status =
    code === 'START_NOT_FUTURE' || code === 'OUTSIDE_OPENING_HOURS' ? 422 : 409;

  return new ApplicationError(
    status,
    code,
    `Appointment request is not available: ${code}.`,
  );
}
