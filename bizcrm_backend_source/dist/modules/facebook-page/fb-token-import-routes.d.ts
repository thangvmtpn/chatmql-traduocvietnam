/**
 * fb-token-import-routes.ts — Manual token import flow for Facebook Pages.
 *
 * Supports a "paste your access token" workflow for environments where
 * the standard OAuth popup flow is blocked (e.g. missing Facebook App ID/Secret).
 *
 * Endpoints:
 *   GET  /facebook-page/token-import/status   — is this feature enabled?
 *   POST /facebook-page/token-import/pages    — given a user token, list pages
 *   POST /facebook-page/token-import/confirm  — connect selected pages
 */
import type { FastifyInstance } from 'fastify';
export declare function fbTokenImportRoutes(app: FastifyInstance): Promise<void>;
