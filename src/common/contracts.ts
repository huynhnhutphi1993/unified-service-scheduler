export interface AuthenticatedCustomer {
  userId: string;
  customerId: string;
}

export interface BookingRequest {
  dealershipId: string;
  vehicleId: string;
  serviceId: string;
  startsAt: string;
}

export type AvailabilityReason =
  | 'START_NOT_FUTURE'
  | 'OUTSIDE_OPENING_HOURS'
  | 'VEHICLE_CONFLICT'
  | 'NO_QUALIFIED_TECHNICIAN'
  | 'NO_AVAILABLE_TECHNICIAN'
  | 'NO_AVAILABLE_BAY';

export interface AvailabilityDecision {
  available: boolean;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  reason?: AvailabilityReason;
  technicianId?: string;
  bayId?: string;
}

export interface AppointmentView {
  id: string;
  customerId: string;
  vehicleId: string;
  dealershipId: string;
  serviceId: string;
  technicianId: string;
  bayId: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: 'CONFIRMED' | 'CANCELLED';
  createdAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}
