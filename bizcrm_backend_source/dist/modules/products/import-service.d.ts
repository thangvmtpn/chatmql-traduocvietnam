export declare function parseCsv(text: string): string[][];
/** Convert a Google Sheet share/edit URL into a CSV export URL. */
export declare function googleSheetCsvUrl(url: string): string;
export declare function fetchSheetRows(url: string): Promise<string[][]>;
export type ImportResult = {
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
};
export declare function importProducts(orgId: string, rows: string[][], mapping: Record<string, string>, opts?: {
    categoryId?: string;
    specMapping?: Record<string, string>;
}): Promise<ImportResult>;
export declare function importKnowledge(orgId: string, rows: string[][], mapping: Record<string, string>, opts?: {
    categoryId?: string;
    productId?: string;
    format?: string;
}): Promise<ImportResult>;
