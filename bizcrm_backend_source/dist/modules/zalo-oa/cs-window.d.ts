import type { FastifyInstance } from 'fastify';
export interface CsWindowState {
    applicable: boolean;
    platform: number | null;
    lastUserAt: string | null;
    daysSince: number | null;
    withinWindow: boolean;
    expiresAt: string | null;
}
export declare function getCsWindow(conversationId: string): Promise<CsWindowState>;
export declare function csWindowRoutes(app: FastifyInstance): Promise<void>;
