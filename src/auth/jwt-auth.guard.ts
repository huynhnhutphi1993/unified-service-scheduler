import { ExecutionContext, Injectable, type CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ApplicationError } from '../common/application-error.js';
import type { AuthenticatedCustomer } from '../common/contracts.js';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  override handleRequest<TUser = AuthenticatedCustomer>(
    err: unknown,
    user: TUser | false | null,
  ): TUser {
    if (err || !user) {
      throw new ApplicationError(
        401,
        'UNAUTHENTICATED',
        'Authentication is required.',
      );
    }

    return user;
  }
}
