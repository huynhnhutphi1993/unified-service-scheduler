import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EntityManager as PostgreSqlEntityManager } from '@mikro-orm/postgresql';
import { ApplicationError } from '../common/application-error.js';
import type { AuthenticatedCustomer } from '../common/contracts.js';
import { User } from '../database/entities/index.js';
import type { LoginDto } from './dto/login.dto.js';
import type { LoginResponseDto } from './dto/login-response.dto.js';
import {
  getDummyPasswordHash,
  isAcceptableLoginPassword,
  verifyPassword,
} from './password-hash.js';
import {
  getJwtSecret,
  isUuid,
  JWT_AUDIENCE,
  JWT_EXPIRES_IN_SECONDS,
  JWT_ISSUER,
  type JwtClaims,
} from './jwt-config.js';
import { normalizeUsername } from './username.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly em: PostgreSqlEntityManager,
    private readonly jwtService: JwtService,
  ) {}

  async login(credentials: LoginDto): Promise<LoginResponseDto> {
    const username = normalizeUsername(credentials.username);
    const password = isAcceptableLoginPassword(credentials.password)
      ? credentials.password
      : null;

    if (!username || !password) {
      await this.verifyDummyPassword(credentials.password);
      throw invalidCredentials();
    }

    const user = await this.em.findOne(User, { username });
    const passwordHash = user?.passwordHash ?? (await getDummyPasswordHash());
    const passwordMatches = await verifyPassword(passwordHash, password);

    if (!user || !passwordMatches) {
      throw invalidCredentials();
    }

    return {
      accessToken: await this.jwtService.signAsync(
        {},
        {
          algorithm: 'HS256',
          audience: JWT_AUDIENCE,
          expiresIn: JWT_EXPIRES_IN_SECONDS,
          issuer: JWT_ISSUER,
          secret: getJwtSecret(),
          subject: user.id,
        },
      ),
      tokenType: 'Bearer',
      expiresIn: JWT_EXPIRES_IN_SECONDS,
    };
  }

  async authenticateJwtClaims(
    claims: JwtClaims,
  ): Promise<AuthenticatedCustomer> {
    if (!isUuid(claims.sub) || !hasValidTokenLifetime(claims)) {
      throw new ApplicationError(
        401,
        'UNAUTHENTICATED',
        'Authentication is required.',
      );
    }

    const user = await this.em.findOne(User, { id: claims.sub });
    if (!user) {
      throw new ApplicationError(
        401,
        'UNAUTHENTICATED',
        'Authentication is required.',
      );
    }

    return {
      userId: user.id,
      customerId: user.customerId,
    };
  }

  private async verifyDummyPassword(value: unknown): Promise<void> {
    const password =
      typeof value === 'string' && value.length <= 128 ? value : '';
    await verifyPassword(await getDummyPasswordHash(), password);
  }
}

function invalidCredentials(): ApplicationError {
  return new ApplicationError(
    401,
    'INVALID_CREDENTIALS',
    'Invalid username or password.',
  );
}

function hasValidTokenLifetime(claims: JwtClaims): boolean {
  if (!isNumericDate(claims.iat) || !isNumericDate(claims.exp)) {
    return false;
  }

  return (
    claims.exp > claims.iat && claims.exp - claims.iat <= JWT_EXPIRES_IN_SECONDS
  );
}

function isNumericDate(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
