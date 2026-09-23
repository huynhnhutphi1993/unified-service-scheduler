export interface CatalogOpeningHours {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

export interface CatalogDealership {
  id: string;
  name: string;
  timeZone: string;
  openingHours: CatalogOpeningHours[];
}

export interface CatalogServiceItem {
  id: string;
  name: string;
  durationMinutes: number;
}

export interface CatalogVehicle {
  id: string;
  registration: string;
}

export interface CatalogResponse {
  dealerships: CatalogDealership[];
  services: CatalogServiceItem[];
  vehicles: CatalogVehicle[];
}
