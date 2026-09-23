import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentCustomer } from '../auth/decorators/current-customer.decorator.js';
import type { AuthenticatedCustomer } from '../common/contracts.js';
import { CatalogService } from './catalog.service.js';
import type { CatalogResponse } from './catalog.types.js';

@ApiTags('Catalog')
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  getCatalog(
    @CurrentCustomer() principal: AuthenticatedCustomer,
  ): Promise<CatalogResponse> {
    return this.catalogService.getCatalog(principal);
  }
}
