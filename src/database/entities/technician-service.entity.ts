import { Entity, PrimaryKey } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'technician_services' })
export class TechnicianService {
  @PrimaryKey({ fieldName: 'technician_id', type: 'uuid', columnType: 'uuid' })
  technicianId!: string;

  @PrimaryKey({ fieldName: 'service_id', type: 'uuid', columnType: 'uuid' })
  serviceId!: string;
}
