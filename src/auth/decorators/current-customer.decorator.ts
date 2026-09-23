import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApplicationError } from '../../common/application-error.js';
import type { AuthenticatedCustomer } from '../../common/contracts.js';

type AuthenticatedRequest = {
  user?: AuthenticatedCustomer;
};

export const CurrentCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedCustomer => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new ApplicationError(
        401,
        'UNAUTHENTICATED',
        'Authentication is required.',
      );
    }

    return request.user;
  },
);
