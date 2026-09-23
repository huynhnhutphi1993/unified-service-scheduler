import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { isTemporaryDatabaseFailure } from './database-failure.js';

const HTTP_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMIT_EXCEEDED',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = HTTP_CODES[status] ?? 'REQUEST_REJECTED';
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        if ('code' in body && typeof body.code === 'string') code = body.code;
        if ('message' in body && typeof body.message === 'string')
          message = body.message;
      } else if (typeof body === 'string') message = body;
    } else if (isTemporaryDatabaseFailure(exception)) {
      status = 503;
      code = 'SERVICE_UNAVAILABLE';
      message = 'The database could not complete this request.';
    } else if (
      exception &&
      typeof exception === 'object' &&
      'type' in exception
    ) {
      if (exception.type === 'entity.too.large') {
        status = 413;
        code = 'PAYLOAD_TOO_LARGE';
        message = 'Request body exceeds 16 KiB.';
      } else if (exception.type === 'entity.parse.failed') {
        status = 400;
        code = 'VALIDATION_ERROR';
        message = 'Request body must be valid JSON.';
      }
    }
    const requestId: string = response.locals.requestId;
    response.locals.businessCode = code;
    if (status >= 500) {
      // Exception messages/stacks may contain SQL, credentials or request values.
      this.logger.error({
        event: 'request_error',
        requestId,
        code,
        method: request.method,
      });
    }
    response.status(status).json({ code, message, requestId });
  }
}
