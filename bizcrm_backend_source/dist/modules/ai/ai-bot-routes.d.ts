/**
 * ai-bot-routes.ts — CRUD cho AI Bot ("con AI") — mỗi bot một bộ cấu hình
 * (persona, playbook, model, tools, kênh áp dụng). Xem ai-bot-service.ts.
 *
 * Route GHI đọc quyền động `ai.update` qua `userHasPermission` — giống eCDP.
 * Route ĐỌC mở cho mọi user đã đăng nhập trong tổ chức.
 */
import type { FastifyInstance } from 'fastify';
export declare function aiBotRoutes(app: FastifyInstance): Promise<void>;
