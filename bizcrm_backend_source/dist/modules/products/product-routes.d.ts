/**
 * product-routes.ts — Product catalog + category CRUD.
 * Read: any authenticated member. Write: owner/admin/manager.
 */
import type { FastifyInstance } from 'fastify';
export declare const PRODUCT_UPLOADS_DIR: string;
export declare function productRoutes(app: FastifyInstance): Promise<void>;
