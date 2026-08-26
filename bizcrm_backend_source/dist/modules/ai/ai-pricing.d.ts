/**
 * Token pricing tables. USD per 1M tokens, conservative public list prices.
 *
 * Anthropic notes:
 * - input_tokens already EXCLUDES cache_read_input_tokens (don't double-discount).
 * - cache writes (cache_creation_input_tokens) cost ~1.25× base input.
 * - cache reads (cache_read_input_tokens) cost ~10% of base input.
 */
export type GenerateRaw = {
    text: string;
    tokensIn: number;
    tokensOut: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
};
export declare function estimateCost(model: string, raw: GenerateRaw): number;
