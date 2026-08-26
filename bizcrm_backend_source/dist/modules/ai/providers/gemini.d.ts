export type GeminiResult = {
    text: string;
    tokensIn: number;
    tokensOut: number;
};
export declare function generateWithGemini(baseUrl: string, apiKey: string, model: string, system: string, userPrompt: string, options?: {
    jsonMode?: boolean;
    maxTokens?: number;
}): Promise<GeminiResult>;
