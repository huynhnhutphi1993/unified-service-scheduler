import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'node:crypto';

@Entity({ tableName: 'dealerships' })
export class Dealership {
  @PrimaryKey({ fieldName: 'id', type: 'uuid', columnType: 'uuid' })
  id: string = randomUUID();

  @Property({ fieldName: 'name', type: 'text', columnType: 'text' })
  name!: string;

  @Property({ fieldName: 'time_zone', type: 'text', columnType: 'text' })
  timeZone!: string;
}
