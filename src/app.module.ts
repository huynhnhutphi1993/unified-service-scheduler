import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { DatabaseModule } from './database/database.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { AvailabilityModule } from './availability/availability.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    CatalogModule,
    AvailabilityModule,
    AppointmentsModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
