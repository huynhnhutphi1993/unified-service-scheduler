export { Appointment, type AppointmentStatus } from './appointment.entity.js';
export { Bay } from './bay.entity.js';
export { Customer } from './customer.entity.js';
export { Dealership } from './dealership.entity.js';
export { OpeningHours } from './opening-hours.entity.js';
export { Service } from './service.entity.js';
export { Technician } from './technician.entity.js';
export { TechnicianService } from './technician-service.entity.js';
export { User } from './user.entity.js';
export { Vehicle } from './vehicle.entity.js';

import { Appointment } from './appointment.entity.js';
import { Bay } from './bay.entity.js';
import { Customer } from './customer.entity.js';
import { Dealership } from './dealership.entity.js';
import { OpeningHours } from './opening-hours.entity.js';
import { Service } from './service.entity.js';
import { Technician } from './technician.entity.js';
import { TechnicianService } from './technician-service.entity.js';
import { User } from './user.entity.js';
import { Vehicle } from './vehicle.entity.js';

export const databaseEntities = [
  User,
  Customer,
  Vehicle,
  Dealership,
  OpeningHours,
  Service,
  Technician,
  TechnicianService,
  Bay,
  Appointment,
] as const;

export type DatabaseEntity = (typeof databaseEntities)[number];
