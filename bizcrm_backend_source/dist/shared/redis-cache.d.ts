export declare const redisCache: {
    /** Get cached value. Returns null if miss or expired. */
    get<T = any>(key: string): Promise<T | null>;
    /** Set value with TTL in seconds. */
    set(key: string, data: any, ttlSeconds: number): Promise<void>;
    /** Delete a cached key. */
    del(key: string): Promise<void>;
};
