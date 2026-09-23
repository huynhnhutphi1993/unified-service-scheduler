import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { createRuntimeMikroOrmConfig } from './mikro-orm-config.factory.js';

@Module({
  imports: [MikroOrmModule.forRoot(createRuntimeMikroOrmConfig())],
})
export class DatabaseModule {}
