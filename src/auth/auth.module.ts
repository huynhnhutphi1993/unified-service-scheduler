import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { DatabaseModule } from '../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import {
  getJwtSecret,
  JWT_AUDIENCE,
  JWT_EXPIRES_IN_SECONDS,
  JWT_ISSUER,
} from './jwt-config.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    DatabaseModule,
    PassportModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: {
        algorithm: 'HS256',
        audience: JWT_AUDIENCE,
        expiresIn: JWT_EXPIRES_IN_SECONDS,
        issuer: JWT_ISSUER,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
