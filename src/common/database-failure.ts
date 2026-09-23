const TEMPORARY_FAILURES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '08P01',
  '40P01',
  '53300',
  '55P03',
  '57014',
  '57P01',
  '57P02',
  '57P03',
  '57P05',
]);

export function isTemporaryDatabaseFailure(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    const entry = current as Record<string, unknown>;
    if (typeof entry.code === 'string' && TEMPORARY_FAILURES.has(entry.code))
      return true;
    current = entry.driverException ?? entry.cause ?? entry.originalError;
  }
  return false;
}
