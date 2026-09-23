import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ApplicationError } from '../common/application-error.js';
import type {
  AuthenticatedCustomer,
  AvailabilityDecision,
  BookingRequest,
} from '../common/contracts.js';
import {
  Dealership,
  OpeningHours,
  Service,
  Vehicle,
} from '../database/entities/index.js';
import { normalizeBookingRequest } from './booking-request.dto.js';
import { evaluateServiceWindow } from './service-window.js';

interface ResourceSnapshot {
  vehicle_conflict: boolean;
  has_qualified_technician: boolean;
  technician_id: string | null;
  bay_id: string | null;
}

@Injectable()
export class AvailabilityService {
  async evaluate(
    em: EntityManager,
    principal: AuthenticatedCustomer,
    input: BookingRequest,
  ): Promise<AvailabilityDecision> {
    const request = normalizeBookingRequest(input);
    const [dealership, service, vehicle] = await Promise.all([
      em.findOne(Dealership, { id: request.dealershipId }),
      em.findOne(Service, { id: request.serviceId }),
      em.findOne(Vehicle, {
        id: request.vehicleId,
        customerId: principal.customerId,
      }),
    ]);
    if (!dealership || !service || !vehicle) {
      throw new ApplicationError(
        404,
        'NOT_FOUND',
        'The requested resource was not found.',
      );
    }
    const hours = await em.find(OpeningHours, { dealershipId: dealership.id });
    const [clock] = await em.execute<{ now: Date }[]>(
      'select clock_timestamp() as now',
    );
    const window = evaluateServiceWindow(
      request.startsAt,
      service.durationMinutes,
      dealership.timeZone,
      hours,
      new Date(clock.now),
    );
    if (window.reason) return { ...window, available: false };

    // One statement gives the availability endpoint a coherent resource snapshot.
    // In booking transactions this must run after the dealership/vehicle locks.
    const [resources] = await em.execute<ResourceSnapshot[]>(
      `
      with requested as (
        select ?::uuid as dealership_id, ?::uuid as service_id,
               ?::uuid as vehicle_id, ?::timestamptz as starts_at, ?::timestamptz as ends_at
      ), qualified as (
        select t.id from technicians t
        join technician_services ts on ts.technician_id = t.id
        cross join requested r
        where t.dealership_id = r.dealership_id and ts.service_id = r.service_id
      )
      select
        exists(select 1 from appointments a, requested r
          where a.vehicle_id = r.vehicle_id and a.status = 'CONFIRMED'
            and a.starts_at < r.ends_at and a.ends_at > r.starts_at) as vehicle_conflict,
        exists(select 1 from qualified) as has_qualified_technician,
        (select q.id from qualified q, requested r
          where not exists(select 1 from appointments a
            where a.technician_id = q.id and a.status = 'CONFIRMED'
              and a.starts_at < r.ends_at and a.ends_at > r.starts_at)
          order by q.id limit 1) as technician_id,
        (select b.id from bays b, requested r
          where b.dealership_id = r.dealership_id
            and not exists(select 1 from appointments a
              where a.bay_id = b.id and a.status = 'CONFIRMED'
                and a.starts_at < r.ends_at and a.ends_at > r.starts_at)
          order by b.id limit 1) as bay_id
    `,
      [dealership.id, service.id, vehicle.id, window.startsAt, window.endsAt],
    );

    if (resources.vehicle_conflict)
      return { ...window, available: false, reason: 'VEHICLE_CONFLICT' };
    if (!resources.has_qualified_technician)
      return { ...window, available: false, reason: 'NO_QUALIFIED_TECHNICIAN' };
    if (!resources.technician_id)
      return { ...window, available: false, reason: 'NO_AVAILABLE_TECHNICIAN' };
    if (!resources.bay_id)
      return { ...window, available: false, reason: 'NO_AVAILABLE_BAY' };
    return {
      ...window,
      available: true,
      technicianId: resources.technician_id,
      bayId: resources.bay_id,
    };
  }
}
