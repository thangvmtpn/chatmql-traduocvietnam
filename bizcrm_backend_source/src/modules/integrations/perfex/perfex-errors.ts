// Typed errors for the Perfex client. The flush worker (Phase 03) distinguishes
// these to decide retry vs skip vs fail: ConflictError → do not retry (validation),
// NotFoundError → resource gone, ApiError/network → retryable.

export class PerfexError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** HTTP 409 — validation failure (e.g. duplicate email). Never retry. */
export class PerfexConflictError extends PerfexError {
  constructor(
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message, 409);
  }
}

/** HTTP 404 / status:false "no data" — resource not found. */
export class PerfexNotFoundError extends PerfexError {
  constructor(message = 'No data were found') {
    super(message, 404);
  }
}

/** HTTP 401/403 — bad/missing authtoken. Not retryable. */
export class PerfexAuthError extends PerfexError {
  constructor(message = 'Unauthorized — check Perfex authtoken') {
    super(message, 401);
  }
}

/** Generic API/transport failure (status:false without a known code, network, 5xx). Retryable. */
export class PerfexApiError extends PerfexError {
  constructor(
    message: string,
    httpStatus?: number,
    public readonly retryable = true,
  ) {
    super(message, httpStatus);
  }
}

/** True when the error class/state means a retry could succeed. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof PerfexConflictError) return false;
  if (err instanceof PerfexNotFoundError) return false;
  if (err instanceof PerfexAuthError) return false;
  if (err instanceof PerfexApiError) return err.retryable;
  return true; // unknown (network/timeout) → retryable
}
