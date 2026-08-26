export declare class PerfexError extends Error {
    readonly httpStatus?: number | undefined;
    constructor(message: string, httpStatus?: number | undefined);
}
/** HTTP 409 — validation failure (e.g. duplicate email). Never retry. */
export declare class PerfexConflictError extends PerfexError {
    readonly fields?: Record<string, string> | undefined;
    constructor(message: string, fields?: Record<string, string> | undefined);
}
/** HTTP 404 / status:false "no data" — resource not found. */
export declare class PerfexNotFoundError extends PerfexError {
    constructor(message?: string);
}
/** HTTP 401/403 — bad/missing authtoken. Not retryable. */
export declare class PerfexAuthError extends PerfexError {
    constructor(message?: string);
}
/** Generic API/transport failure (status:false without a known code, network, 5xx). Retryable. */
export declare class PerfexApiError extends PerfexError {
    readonly retryable: boolean;
    constructor(message: string, httpStatus?: number, retryable?: boolean);
}
/** True when the error class/state means a retry could succeed. */
export declare function isRetryable(err: unknown): boolean;
