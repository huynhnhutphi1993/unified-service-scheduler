import { EntityManager as PostgreSqlEntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedCustomer } from '../common/contracts.js';
import {
  Dealership,
  OpeningHours,
  Service,
  Vehicle,
} from '../database/entities/index.js';
import type {
  CatalogDealership,
  CatalogOpeningHours,
  CatalogResponse,
} from './catalog.types.js';

@Injectable()
export class CatalogService {
  constructor(private readonly em: PostgreSqlEntityManager) {}

  async getCatalog(principal: AuthenticatedCustomer): Promise<CatalogResponse> {
    const dealerships = await this.em.find(
      Dealership,
      {},
      { orderBy: { name: 'ASC' } },
    );
    const openingHours = await this.em.find(
      OpeningHours,
      {},
      { orderBy: { dealershipId: 'ASC', dayOfWeek: 'ASC' } },
    );
    const services = await this.em.find(
      Service,
      {},
      { orderBy: { name: 'ASC' } },
    );
    const vehicles = await this.em.find(
      Vehicle,
      { customerId: principal.customerId },
      { orderBy: { registration: 'ASC' } },
    );
    const openingHoursByDealership = this.groupOpeningHours(openingHours);

    return {
      dealerships: dealerships.map((dealership): CatalogDealership => ({
        id: dealership.id,
        name: dealership.name,
        timeZone: dealership.timeZone,
        openingHours: openingHoursByDealership.get(dealership.id) ?? [],
      })),
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
      })),
      vehicles: vehicles.map((vehicle) => ({
        id: vehicle.id,
        registration: vehicle.registration,
      })),
    };
  }

  private groupOpeningHours(
    openingHours: readonly OpeningHours[],
  ): Map<string, CatalogOpeningHours[]> {
    const grouped = new Map<string, CatalogOpeningHours[]>();

    for (const hours of openingHours) {
      const dealershipHours = grouped.get(hours.dealershipId) ?? [];
      dealershipHours.push({
        dayOfWeek: hours.dayOfWeek,
        opensAt: hours.opensAt,
        closesAt: hours.closesAt,
      });
      grouped.set(hours.dealershipId, dealershipHours);
    }

    return grouped;
  }
}
