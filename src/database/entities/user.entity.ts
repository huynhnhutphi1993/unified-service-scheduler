import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'node:crypto';

@Entity({ tableName: 'users' })
export class User {
  @PrimaryKey({ fieldName: 'id', type: 'uuid', columnType: 'uuid' })
  id: string = randomUUID();

  @Property({ fieldName: 'username', type: 'text', columnType: 'text' })
  username!: string;

  @Property({
    fieldName: 'password_hash',
    type: 'text',
    columnType: 'text',
    hidden: true,
  })
  passwordHash!: string;

  @Property({ fieldName: 'customer_id', type: 'uuid', columnType: 'uuid' })
  customerId!: string;
}
