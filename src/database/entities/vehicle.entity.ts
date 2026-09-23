import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'node:crypto';

@Entity({ tableName: 'vehicles' })
export class Vehicle {
  @PrimaryKey({ fieldName: 'id', type: 'uuid', columnType: 'uuid' })
  id: string = randomUUID();

  @Property({ fieldName: 'customer_id', type: 'uuid', columnType: 'uuid' })
  customerId!: string;

  @Property({ fieldName: 'registration', type: 'text', columnType: 'text' })
  registration!: string;
}
