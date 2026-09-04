import { type ToolsConfig } from './tools-config-service.js';
export type AiBotInput = {
    name?: string;
    avatarEmoji?: string | null;
    description?: string | null;
    enabled?: boolean;
    provider?: string | null;
    model?: string | null;
    personaPrompt?: string | null;
    playbookPrompt?: string | null;
    toolsJson?: unknown | null;
    channelAccountIds?: string[];
};
export declare function listBots(orgId: string): Promise<{
    id: string;
    orgId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    provider: string | null;
    model: string | null;
    enabled: boolean;
    description: string | null;
    avatarEmoji: string | null;
    personaPrompt: string | null;
    playbookPrompt: string | null;
    toolsJson: import("@prisma/client/runtime/library").JsonValue | null;
    channelAccountIds: import("@prisma/client/runtime/library").JsonValue;
}[]>;
export declare function getBot(orgId: string, id: string): Promise<{
    id: string;
    orgId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    provider: string | null;
    model: string | null;
    enabled: boolean;
    description: string | null;
    avatarEmoji: string | null;
    personaPrompt: string | null;
    playbookPrompt: string | null;
    toolsJson: import("@prisma/client/runtime/library").JsonValue | null;
    channelAccountIds: import("@prisma/client/runtime/library").JsonValue;
} | null>;
export declare function createBot(orgId: string, input: AiBotInput): Promise<{
    id: string;
    orgId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    provider: string | null;
    model: string | null;
    enabled: boolean;
    description: string | null;
    avatarEmoji: string | null;
    personaPrompt: string | null;
    playbookPrompt: string | null;
    toolsJson: import("@prisma/client/runtime/library").JsonValue | null;
    channelAccountIds: import("@prisma/client/runtime/library").JsonValue;
}>;
export declare function updateBot(orgId: string, id: string, input: AiBotInput): Promise<{
    id: string;
    orgId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    provider: string | null;
    model: string | null;
    enabled: boolean;
    description: string | null;
    avatarEmoji: string | null;
    personaPrompt: string | null;
    playbookPrompt: string | null;
    toolsJson: import("@prisma/client/runtime/library").JsonValue | null;
    channelAccountIds: import("@prisma/client/runtime/library").JsonValue;
}>;
export declare function deleteBot(orgId: string, id: string): Promise<{
    deleted: boolean;
}>;
/** Resolved bot shape the harness consumes (only override-relevant fields). */
export type ResolvedBot = {
    id: string;
    name: string;
    provider: string | null;
    model: string | null;
    personaPrompt: string | null;
    playbookPrompt: string | null;
    /** Parsed per-bot tools config, or null → use org tools config. */
    toolsConfig: ToolsConfig | null;
};
/** Bot serving a conversation (via its channel account), or null. */
export declare function resolveBotForConversation(orgId: string, conversationId: string): Promise<ResolvedBot | null>;
/** Bot by id (used by the simulator's per-bot demo chat). */
export declare function resolveBotById(orgId: string, botId: string): Promise<ResolvedBot | null>;
