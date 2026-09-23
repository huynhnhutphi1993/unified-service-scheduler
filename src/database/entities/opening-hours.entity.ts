import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'node:crypto';

@Entity({ tableName: 'opening_hours' })
export class OpeningHours {
  @PrimaryKey({ fieldName: 'id', type: 'uuid', columnType: 'uuid' })
  id: string = randomUUID();

  @Property({ fieldName: 'dealership_id', type: 'uuid', columnType: 'uuid' })
  dealershipId!: string;

  @Property({
    fieldName: 'day_of_week',
    type: 'number',
    columnType: 'smallint',
  })
  dayOfWeek!: number;

  @Property({ fieldName: 'opens_at', type: 'string', columnType: 'char(5)' })
  opensAt!: string;

  @Property({ fieldName: 'closes_at', type: 'string', columnType: 'char(5)' })
  closesAt!: string;
}
