import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';

@Module({
  imports: [DatabaseModule, AvailabilityModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
