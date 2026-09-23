export const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const username = value.trim().toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : null;
}
