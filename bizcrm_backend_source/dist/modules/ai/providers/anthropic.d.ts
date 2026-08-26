export type AnthropicResult = {
    text: string;
    tokensIn: number;
    tokensOut: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
};
export declare function generateWithAnthropic(baseUrl: string, apiKey: string, model: string, system: string, userPrompt: string, options?: {
    enableCaching?: boolean;
    maxTokens?: number;
}): Promise<AnthropicResult>;
