/**
 * report-routes.ts — Aggregate reports for the platform console.
 * overview KPIs + per-company breakdown + CSV export. Same stats source as org-admin.
 */
import type { FastifyInstance } from 'fastify';
export declare function platformReportRoutes(app: FastifyInstance): Promise<void>;
