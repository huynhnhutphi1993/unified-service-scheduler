import argon2 from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

let dummyPasswordHash: Promise<string> | undefined;

export function isAcceptableLoginPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

export function isAcceptableSeedPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 15 && value.length <= 128;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword('dummy-password-for-login-timing-only');
  return dummyPasswordHash;
}
