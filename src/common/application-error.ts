import { HttpException } from '@nestjs/common';

export class ApplicationError extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ code, message }, status);
  }
}
