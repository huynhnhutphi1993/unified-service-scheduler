export const JWT_ISSUER = 'unified-service-scheduler';
export const JWT_AUDIENCE = 'scheduler-api';
export const JWT_EXPIRES_IN_SECONDS = 900;

export interface JwtClaims {
  sub?: unknown;
  iat?: unknown;
  exp?: unknown;
  iss?: unknown;
  aud?: unknown;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getJwtSecret(): Buffer {
  const rawSecret = process.env.JWT_SECRET_BASE64;
  if (typeof rawSecret !== 'string' || rawSecret.trim() === '') {
    throw new Error('JWT_SECRET_BASE64 is required.');
  }

  const secret = rawSecret.trim();
  if (!BASE64.test(secret) || secret.length % 4 === 1) {
    throw new Error('JWT_SECRET_BASE64 must be valid base64.');
  }

  const padded = secret.padEnd(
    secret.length + ((4 - (secret.length % 4)) % 4),
    '=',
  );
  const decoded = Buffer.from(padded, 'base64');
  if (decoded.length < 32) {
    throw new Error('JWT_SECRET_BASE64 must decode to at least 32 bytes.');
  }

  return decoded;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
