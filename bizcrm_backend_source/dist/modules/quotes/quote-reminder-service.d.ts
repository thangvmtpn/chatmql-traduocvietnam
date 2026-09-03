/** Báo giá sắp hết hiệu lực mà khách chưa phản hồi. */
export declare function remindExpiringQuotes(now?: Date): Promise<number>;
/** Đã gửi vài ngày mà khách chưa mở link lần nào. */
export declare function remindUnviewedQuotes(now?: Date): Promise<number>;
