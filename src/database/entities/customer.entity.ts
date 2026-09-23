import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'node:crypto';

@Entity({ tableName: 'customers' })
export class Customer {
  @PrimaryKey({ fieldName: 'id', type: 'uuid', columnType: 'uuid' })
  id: string = randomUUID();

  @Property({ fieldName: 'name', type: 'text', columnType: 'text' })
  name!: string;
}
