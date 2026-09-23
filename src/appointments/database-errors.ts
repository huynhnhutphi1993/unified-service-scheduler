const IDEMPOTENCY_CONSTRAINT = 'appointments_customer_idempotency_unique';
const EXCLUSION_CONSTRAINTS = new Set([
  'appointments_technician_no_overlap',
  'appointments_bay_no_overlap',
  'appointments_vehicle_no_overlap',
]);
const TRANSIENT_DATABASE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
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

export function isIdempotencyUniqueViolation(error: unknown): boolean {
  return findDatabaseError(error, '23505', IDEMPOTENCY_CONSTRAINT);
}

export function isKnownResourceConflict(error: unknown): boolean {
  const databaseError = getDatabaseError(error);
  return (
    databaseError?.code === '23P01' &&
    typeof databaseError.constraint === 'string' &&
    EXCLUSION_CONSTRAINTS.has(databaseError.constraint)
  );
}

export function isTransientDatabaseFailure(error: unknown): boolean {
  const databaseError = getDatabaseError(error);
  return (
    !!databaseError?.code && TRANSIENT_DATABASE_CODES.has(databaseError.code)
  );
}

function findDatabaseError(
  error: unknown,
  code: string,
  constraint: string,
): boolean {
  const databaseError = getDatabaseError(error);
  return (
    databaseError?.code === code && databaseError.constraint === constraint
  );
}

function getDatabaseError(error: unknown): DatabaseError | null {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as Record<string, unknown>;
    const code = typeof candidate.code === 'string' ? candidate.code : null;
    const constraint =
      typeof candidate.constraint === 'string'
        ? candidate.constraint
        : typeof candidate.constraintName === 'string'
          ? candidate.constraintName
          : null;

    if (code || constraint) {
      return { code, constraint };
    }

    current =
      candidate.driverException ??
      candidate.cause ??
      candidate.previous ??
      candidate.originalError;
  }

  return null;
}

interface DatabaseError {
  code: string | null;
  constraint: string | null;
}
