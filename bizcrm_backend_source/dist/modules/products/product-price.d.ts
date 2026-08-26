/**
 * product-price.ts — single source of truth for rendering a product's price as a
 * human/AI-facing string. Shared by the AI harness (tools-runtime + auto-reply)
 * so the two never drift on how range/description/contact prices are phrased.
 */
export type PriceInfo = {
    priceType: string;
    price: number | null;
    priceMax: number | null;
    currency: string;
};
/**
 * Vietnamese price label used to ground AI replies and quote customers.
 * - fixed:       "100.000 VND"
 * - range:       "500.000 – 1.500.000 VND" (or "Từ X" if only the lower bound set)
 * - free:        "Miễn phí"
 * - contact:     "Liên hệ báo giá"
 * - description: "Theo mô tả bên dưới" (the description text carries the detail)
 */
export declare function formatProductPrice(p: PriceInfo): string;
