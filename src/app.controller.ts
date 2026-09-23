import { Controller, Get } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator.js';
import { ApplicationError } from './common/application-error.js';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly em: EntityManager) {}

  @Public()
  @Get('health')
  async health(): Promise<{ status: string }> {
    try {
      await this.em.execute('select 1');
      return { status: 'ok' };
    } catch {
      throw new ApplicationError(
        503,
        'SERVICE_UNAVAILABLE',
        'The database is unavailable.',
      );
    }
  }
}
