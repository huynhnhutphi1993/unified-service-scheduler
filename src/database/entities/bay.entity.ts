import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'node:crypto';

@Entity({ tableName: 'bays' })
export class Bay {
  @PrimaryKey({ fieldName: 'id', type: 'uuid', columnType: 'uuid' })
  id: string = randomUUID();

  @Property({ fieldName: 'dealership_id', type: 'uuid', columnType: 'uuid' })
  dealershipId!: string;

  @Property({ fieldName: 'name', type: 'text', columnType: 'text' })
  name!: string;
}
