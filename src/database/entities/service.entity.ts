import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'node:crypto';

@Entity({ tableName: 'services' })
export class Service {
  @PrimaryKey({ fieldName: 'id', type: 'uuid', columnType: 'uuid' })
  id: string = randomUUID();

  @Property({ fieldName: 'name', type: 'text', columnType: 'text' })
  name!: string;

  @Property({
    fieldName: 'duration_minutes',
    type: 'number',
    columnType: 'integer',
  })
  durationMinutes!: number;
}
