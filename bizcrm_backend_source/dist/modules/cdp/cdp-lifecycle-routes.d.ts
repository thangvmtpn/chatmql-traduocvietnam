import type { FastifyInstance } from 'fastify';
import { LIFECYCLE_STAGES, STAGE_LABELS } from './lifecycle-service.js';
export { LIFECYCLE_STAGES, STAGE_LABELS };
export declare function cdpLifecycleRoutes(app: FastifyInstance): Promise<void>;
