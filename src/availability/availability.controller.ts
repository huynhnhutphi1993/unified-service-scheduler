import { EntityManager } from '@mikro-orm/postgresql';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCustomer } from '../auth/decorators/current-customer.decorator.js';
import type { AuthenticatedCustomer } from '../common/contracts.js';
import { AvailabilityService } from './availability.service.js';
import { BookingRequestDto } from './booking-request.dto.js';

@ApiTags('Availability')
@ApiBearerAuth()
@Controller('availability')
export class AvailabilityController {
  constructor(
    private readonly em: EntityManager,
    private readonly availability: AvailabilityService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Check a requested time without reserving resources',
  })
  async check(
    @CurrentCustomer() principal: AuthenticatedCustomer,
    @Query() query: BookingRequestDto,
  ) {
    const result = await this.availability.evaluate(this.em, principal, query);
    return {
      available: result.available,
      startsAt: result.startsAt,
      endsAt: result.endsAt,
      durationMinutes: result.durationMinutes,
      ...(result.reason ? { reason: result.reason } : {}),
    };
  }
}
