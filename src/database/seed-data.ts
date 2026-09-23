export const seedIds = {
  customers: {
    customerA: '10000000-0000-4000-8000-000000000001',
    customerB: '10000000-0000-4000-8000-000000000002',
  },
  vehicles: {
    customerAHatchback: '20000000-0000-4000-8000-000000000001',
    customerASuv: '20000000-0000-4000-8000-000000000002',
    customerBEstate: '20000000-0000-4000-8000-000000000003',
  },
  dealerships: {
    northLoop: '30000000-0000-4000-8000-000000000001',
    riverGate: '30000000-0000-4000-8000-000000000002',
  },
  services: {
    oilChange: '40000000-0000-4000-8000-000000000001',
    safetyInspection: '40000000-0000-4000-8000-000000000002',
    wheelAlignment: '40000000-0000-4000-8000-000000000003',
  },
  technicians: {
    northAlex: '50000000-0000-4000-8000-000000000001',
    northBlair: '50000000-0000-4000-8000-000000000002',
    riverCasey: '50000000-0000-4000-8000-000000000003',
  },
  bays: {
    northOne: '60000000-0000-4000-8000-000000000001',
    northTwo: '60000000-0000-4000-8000-000000000002',
    riverOne: '60000000-0000-4000-8000-000000000003',
  },
  openingHours: {
    northMonday: '70000000-0000-4000-8000-000000000001',
    northTuesday: '70000000-0000-4000-8000-000000000002',
    northWednesday: '70000000-0000-4000-8000-000000000003',
    northThursday: '70000000-0000-4000-8000-000000000004',
    northFriday: '70000000-0000-4000-8000-000000000005',
    riverMonday: '70000000-0000-4000-8000-000000000006',
    riverTuesday: '70000000-0000-4000-8000-000000000007',
    riverWednesday: '70000000-0000-4000-8000-000000000008',
    riverThursday: '70000000-0000-4000-8000-000000000009',
    riverFriday: '70000000-0000-4000-8000-000000000010',
  },
} as const;

export const foundationSeedData = {
  customers: [
    { id: seedIds.customers.customerA, name: 'Avery Nguyen' },
    { id: seedIds.customers.customerB, name: 'Jordan Tran' },
  ],
  vehicles: [
    {
      id: seedIds.vehicles.customerAHatchback,
      customerId: seedIds.customers.customerA,
      registration: 'KL-001-A',
    },
    {
      id: seedIds.vehicles.customerASuv,
      customerId: seedIds.customers.customerA,
      registration: 'KL-002-A',
    },
    {
      id: seedIds.vehicles.customerBEstate,
      customerId: seedIds.customers.customerB,
      registration: 'KL-001-B',
    },
  ],
  dealerships: [
    {
      id: seedIds.dealerships.northLoop,
      name: 'North Loop Service',
      timeZone: 'Europe/London',
    },
    {
      id: seedIds.dealerships.riverGate,
      name: 'River Gate Service',
      timeZone: 'Europe/London',
    },
  ],
  openingHours: [
    {
      id: seedIds.openingHours.northMonday,
      dealershipId: seedIds.dealerships.northLoop,
      dayOfWeek: 1,
      opensAt: '08:00',
      closesAt: '17:00',
    },
    {
      id: seedIds.openingHours.northTuesday,
      dealershipId: seedIds.dealerships.northLoop,
      dayOfWeek: 2,
      opensAt: '08:00',
      closesAt: '17:00',
    },
    {
      id: seedIds.openingHours.northWednesday,
      dealershipId: seedIds.dealerships.northLoop,
      dayOfWeek: 3,
      opensAt: '08:00',
      closesAt: '17:00',
    },
    {
      id: seedIds.openingHours.northThursday,
      dealershipId: seedIds.dealerships.northLoop,
      dayOfWeek: 4,
      opensAt: '08:00',
      closesAt: '17:00',
    },
    {
      id: seedIds.openingHours.northFriday,
      dealershipId: seedIds.dealerships.northLoop,
      dayOfWeek: 5,
      opensAt: '08:00',
      closesAt: '17:00',
    },
    {
      id: seedIds.openingHours.riverMonday,
      dealershipId: seedIds.dealerships.riverGate,
      dayOfWeek: 1,
      opensAt: '09:00',
      closesAt: '18:00',
    },
    {
      id: seedIds.openingHours.riverTuesday,
      dealershipId: seedIds.dealerships.riverGate,
      dayOfWeek: 2,
      opensAt: '09:00',
      closesAt: '18:00',
    },
    {
      id: seedIds.openingHours.riverWednesday,
      dealershipId: seedIds.dealerships.riverGate,
      dayOfWeek: 3,
      opensAt: '09:00',
      closesAt: '18:00',
    },
    {
      id: seedIds.openingHours.riverThursday,
      dealershipId: seedIds.dealerships.riverGate,
      dayOfWeek: 4,
      opensAt: '09:00',
      closesAt: '18:00',
    },
    {
      id: seedIds.openingHours.riverFriday,
      dealershipId: seedIds.dealerships.riverGate,
      dayOfWeek: 5,
      opensAt: '09:00',
      closesAt: '18:00',
    },
  ],
  services: [
    {
      id: seedIds.services.oilChange,
      name: 'Oil change',
      durationMinutes: 45,
    },
    {
      id: seedIds.services.safetyInspection,
      name: 'Safety inspection',
      durationMinutes: 60,
    },
    {
      id: seedIds.services.wheelAlignment,
      name: 'Wheel alignment',
      durationMinutes: 90,
    },
  ],
  technicians: [
    {
      id: seedIds.technicians.northAlex,
      dealershipId: seedIds.dealerships.northLoop,
      name: 'Alex Morgan',
    },
    {
      id: seedIds.technicians.northBlair,
      dealershipId: seedIds.dealerships.northLoop,
      name: 'Blair Patel',
    },
    {
      id: seedIds.technicians.riverCasey,
      dealershipId: seedIds.dealerships.riverGate,
      name: 'Casey Brooks',
    },
  ],
  technicianServices: [
    {
      technicianId: seedIds.technicians.northAlex,
      serviceId: seedIds.services.oilChange,
    },
    {
      technicianId: seedIds.technicians.northAlex,
      serviceId: seedIds.services.safetyInspection,
    },
    {
      technicianId: seedIds.technicians.northBlair,
      serviceId: seedIds.services.oilChange,
    },
    {
      technicianId: seedIds.technicians.northBlair,
      serviceId: seedIds.services.safetyInspection,
    },
    {
      technicianId: seedIds.technicians.northBlair,
      serviceId: seedIds.services.wheelAlignment,
    },
    {
      technicianId: seedIds.technicians.riverCasey,
      serviceId: seedIds.services.oilChange,
    },
    {
      technicianId: seedIds.technicians.riverCasey,
      serviceId: seedIds.services.wheelAlignment,
    },
  ],
  bays: [
    {
      id: seedIds.bays.northOne,
      dealershipId: seedIds.dealerships.northLoop,
      name: 'North Bay 1',
    },
    {
      id: seedIds.bays.northTwo,
      dealershipId: seedIds.dealerships.northLoop,
      name: 'North Bay 2',
    },
    {
      id: seedIds.bays.riverOne,
      dealershipId: seedIds.dealerships.riverGate,
      name: 'River Bay 1',
    },
  ],
} as const;
