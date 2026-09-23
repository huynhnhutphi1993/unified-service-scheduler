import { randomUUID } from 'node:crypto';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { ApplicationError } from './application-error.js';
import { HttpErrorFilter } from './http-error.filter.js';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  const logger = new Logger('HTTP');
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = randomUUID();
    const started = performance.now();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    response.once('finish', () => {
      logger.log({
        event: 'http_request',
        requestId,
        method: request.method,
        route:
          (request.route as { path?: string } | undefined)?.path ?? 'unmatched',
        status: response.statusCode,
        code: response.locals.businessCode ?? 'OK',
        durationMs: Math.round((performance.now() - started) * 100) / 100,
      });
    });
    next();
  });
  app.use(helmet());
  app.use((request: Request, _response: Response, next: NextFunction) => {
    if (
      ['POST', 'PUT', 'PATCH'].includes(request.method) &&
      !request.is('application/json')
    ) {
      next(
        new ApplicationError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'Use application/json for request bodies.',
        ),
      );
      return;
    }
    next();
  });
  app.use(json({ limit: '16kb', strict: true }));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
      exceptionFactory: () =>
        new ApplicationError(
          400,
          'VALIDATION_ERROR',
          'Request validation failed.',
        ),
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter());
}
