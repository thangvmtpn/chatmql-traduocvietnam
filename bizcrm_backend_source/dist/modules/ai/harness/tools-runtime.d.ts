import { type ToolName, type ToolsConfig } from '../tools-config-service.js';
import type { OpenaiToolDef } from '../providers/openai.js';
export declare const HANDOFF_TOOL = "request_handoff";
export declare const APPOINTMENT_TOOL = "request_appointment";
export declare const LOG_GAP_TOOL = "log_knowledge_gap";
export declare const CATALOG_OVERVIEW_TOOL = "catalog_overview";
/** Build OpenAI tool defs: enabled search tools + overview + always-on action tools. */
export declare const SEND_IMAGE_TOOL = "send_product_image";
export declare function buildOpenaiTools(tools: ToolsConfig): OpenaiToolDef[];
export declare function isToolName(name: string): name is ToolName;
/** One retrieved hit surfaced for observability (label + relevance score). */
export type ToolHit = {
    label: string;
    score: number | null;
};
/** Tool execution result: the text the model sees + per-hit scores for the trace. */
export type ToolResult = {
    text: string;
    hits: ToolHit[];
};
/**
 * Execute a tool call. Always enforces the tool's guardrail (categoryIds) in code,
 * so the model cannot reach data outside its allowed scope. Returns the text the
 * model sees plus per-hit relevance scores (recorded in the trace so the Master
 * can diagnose retrieval quality). `minScore` overrides the default RAG threshold.
 */
export interface ResolvedProductImage {
    productId: string;
    productName: string;
    imageUrl: string;
}
/**
 * Kết quả tra ảnh. Phân biệt "không có sản phẩm" với "có sản phẩm nhưng ảnh
 * hỏng" — hai tình huống này cần AI nói với khách hai kiểu khác nhau, và nếu
 * gộp làm một thì mô hình hay cãi lại ("search_products vừa thấy sản phẩm mà").
 */
export type ProductImageLookup = {
    status: 'ok';
    image: ResolvedProductImage;
} | {
    status: 'no_image';
    productName: string;
} | {
    status: 'not_found';
};
/**
 * Tra sản phẩm theo tên/mã rồi lấy ảnh ĐÃ DUYỆT đầu tiên.
 *
 * Chỉ nhận sản phẩm status='active' — giống hệt luật của thư viện tài liệu.
 * Trả về null nếu không tìm thấy hoặc sản phẩm chưa có ảnh; khi đó AI được báo
 * lại để nó tự nói với khách thay vì im lặng.
 */
export declare function resolveProductImage(orgId: string, query: string): Promise<ProductImageLookup>;
export declare function executeTool(orgId: string, name: string, args: unknown, tools: ToolsConfig, topK: number, minScore?: number): Promise<ToolResult>;
