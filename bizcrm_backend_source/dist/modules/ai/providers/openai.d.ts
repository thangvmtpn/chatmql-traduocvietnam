export type OpenaiResult = {
    text: string;
    tokensIn: number;
    tokensOut: number;
};
export declare function generateWithOpenai(baseUrl: string, apiKey: string, model: string, system: string, userPrompt: string, options?: {
    jsonMode?: boolean;
    maxTokens?: number;
}): Promise<OpenaiResult>;
export type OpenaiMessage = {
    role: 'system' | 'user';
    content: string;
} | {
    role: 'assistant';
    content: string | null;
    tool_calls?: OpenaiToolCall[];
} | {
    role: 'tool';
    tool_call_id: string;
    content: string;
};
export type OpenaiToolCall = {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
};
export type OpenaiToolDef = {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
};
export type OpenaiToolStep = {
    content: string | null;
    toolCalls: Array<{
        id: string;
        name: string;
        arguments: string;
    }>;
    tokensIn: number;
    tokensOut: number;
    finishReason: string | null;
};
export declare function generateWithOpenaiMessages(baseUrl: string, apiKey: string, model: string, messages: OpenaiMessage[], tools: OpenaiToolDef[] | undefined, options?: {
    maxTokens?: number;
    toolChoice?: 'auto' | 'required';
}): Promise<OpenaiToolStep>;
