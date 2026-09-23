import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type StrategyOptions } from 'passport-jwt';
import type { AuthenticatedCustomer } from '../common/contracts.js';
import { AuthService } from './auth.service.js';
import {
  getJwtSecret,
  JWT_AUDIENCE,
  JWT_ISSUER,
  type JwtClaims,
} from './jwt-config.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly authService: AuthService) {
    super({
      algorithms: ['HS256'],
      audience: JWT_AUDIENCE,
      ignoreExpiration: false,
      issuer: JWT_ISSUER,
      jsonWebTokenOptions: { maxAge: '15m' },
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: getJwtSecret(),
    } satisfies StrategyOptions);
  }

  async validate(claims: JwtClaims): Promise<AuthenticatedCustomer> {
    return this.authService.authenticateJwtClaims(claims);
  }
}
