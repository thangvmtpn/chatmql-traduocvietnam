/**
 * product-price.ts — single source of truth for rendering a product's price as a
 * human/AI-facing string. Shared by the AI harness (tools-runtime + auto-reply)
 * so the two never drift on how range/description/contact prices are phrased.
 */
const vnd = (n) => n.toLocaleString('vi-VN');
/**
 * Vietnamese price label used to ground AI replies and quote customers.
 * - fixed:       "100.000 VND"
 * - range:       "500.000 – 1.500.000 VND" (or "Từ X" if only the lower bound set)
 * - free:        "Miễn phí"
 * - contact:     "Liên hệ báo giá"
 * - description: "Theo mô tả bên dưới" (the description text carries the detail)
 */
export function formatProductPrice(p) {
    switch (p.priceType) {
        case 'free':
            return 'Miễn phí';
        case 'contact':
            return 'Liên hệ báo giá';
        case 'description':
            return 'Theo mô tả bên dưới';
        case 'range':
            if (p.price != null && p.priceMax != null)
                return `${vnd(p.price)} – ${vnd(p.priceMax)} ${p.currency}`;
            if (p.price != null)
                return `Từ ${vnd(p.price)} ${p.currency}`;
            return 'Liên hệ báo giá';
        case 'fixed':
        default:
            return p.price != null ? `${vnd(p.price)} ${p.currency}` : 'Liên hệ báo giá';
    }
}
//# sourceMappingURL=product-price.js.map