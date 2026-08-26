export interface AiCdpConfig {
    analysis: {
        messageCount: number;
        confidenceThreshold: number;
        customPrompt: string;
    };
    outputs: {
        lifecycle: {
            enabled: boolean;
            allowDowngrade: boolean;
        };
        leadScore: {
            enabled: boolean;
        };
        sentiment: {
            enabled: boolean;
        };
        intent: {
            enabled: boolean;
        };
        tags: {
            enabled: boolean;
            allowedTags: string[];
        };
        profile: {
            enabled: boolean;
            fields: string[];
        };
        customProperties: {
            enabled: boolean;
            propertyIds: string[];
        };
    };
    audit: {
        enabled: boolean;
    };
}
export interface AiCdpInput {
    orgId: string;
    contactId: string;
    conversationId: string;
    provider: string;
    apiKey: string;
    model?: string;
    config?: Partial<AiCdpConfig>;
}
export declare function runAiCdp(input: AiCdpInput): Promise<{
    applied: Record<string, any>;
    skipped: Record<string, string>;
    confidence: number;
    processData?: Record<string, any>;
}>;
