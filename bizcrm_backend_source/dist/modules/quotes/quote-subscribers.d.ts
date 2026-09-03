/** Đăng ký subscriber. Idempotent — gọi 2 lần không tạo listener trùng. */
export declare function registerQuoteSubscribers(): () => void;
