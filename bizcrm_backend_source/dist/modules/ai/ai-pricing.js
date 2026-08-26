const PRICE_PER_MILLION = {
    // Anthropic — cacheRead ≈ in/10, cacheWrite ≈ in×1.25
    'claude-opus-4-5': { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    'claude-sonnet-4-6': { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    'claude-haiku-4-5': { in: 0.8, out: 4, cacheRead: 0.08, cacheWrite: 1 },
    // Gemini
    'gemini-2.5-pro': { in: 1.25, out: 10 },
    'gemini-2.0-pro': { in: 1.25, out: 5 },
    'gemini-2.0-flash': { in: 0.075, out: 0.3 },
    // OpenAI
    'gpt-4o': { in: 2.5, out: 10 },
    'gpt-4o-mini': { in: 0.15, out: 0.6 },
    'gpt-4.1': { in: 2, out: 8, cacheRead: 0.5 },
    'gpt-4.1-mini': { in: 0.4, out: 1.6, cacheRead: 0.1 },
    'gpt-4.1-nano': { in: 0.1, out: 0.4, cacheRead: 0.025 },
    // GPT-5 / o-series (list prices, 2026-06). Reasoning models (gpt-5*, o4-mini)
    // bill hidden reasoning tokens as output — effective output cost runs higher.
    'gpt-5': { in: 5, out: 30 },
    'gpt-5-mini': { in: 0.25, out: 2, cacheRead: 0.025 },
    'gpt-5.4-mini': { in: 0.75, out: 4.5, cacheRead: 0.075 },
    'o4-mini': { in: 1.1, out: 4.4, cacheRead: 0.275 },
    // OpenAI embeddings (output is free — embeddings have no completion tokens)
    'text-embedding-3-small': { in: 0.02, out: 0 },
    'text-embedding-3-large': { in: 0.13, out: 0 },
    // Gemini (2.5 flash list price)
    'gemini-2.5-flash': { in: 0.3, out: 2.5 },
    // MiniMax (international list price, USD)
    'MiniMax-M2.7': { in: 0.3, out: 1.2 },
    'MiniMax-M2': { in: 0.2, out: 0.8 },
    'MiniMax-Text-01': { in: 0.2, out: 1.1 },
};
/**
 * Exact match first, then longest-prefix match so dated/regional variants
 * ("gpt-4.1-mini-2025-04-14", "gemini-2.0-flash-001") still get priced
 * instead of silently costing $0.
 */
function resolvePrice(model) {
    const exact = PRICE_PER_MILLION[model];
    if (exact)
        return exact;
    let bestKey = '';
    for (const key of Object.keys(PRICE_PER_MILLION)) {
        if (model.startsWith(key) && key.length > bestKey.length)
            bestKey = key;
    }
    return bestKey ? PRICE_PER_MILLION[bestKey] : undefined;
}
export function estimateCost(model, raw) {
    const price = resolvePrice(model);
    if (!price)
        return 0;
    // tokensIn from Anthropic API already excludes cache_read tokens;
    // for non-Anthropic providers cacheReadTokens is always 0 so this works uniformly.
    const inCost = (raw.tokensIn * price.in) / 1_000_000;
    const cacheReadCost = ((raw.cacheReadTokens ?? 0) * (price.cacheRead ?? price.in)) / 1_000_000;
    const cacheWriteCost = ((raw.cacheCreationTokens ?? 0) * (price.cacheWrite ?? price.in)) / 1_000_000;
    const outCost = (raw.tokensOut * price.out) / 1_000_000;
    return Math.max(0, inCost + cacheReadCost + cacheWriteCost + outCost);
}
//# sourceMappingURL=ai-pricing.js.map