export interface TemplateInput {
    name: string;
    isDefault?: boolean;
    sellerName?: string | null;
    sellerTaxCode?: string | null;
    sellerAddress?: string | null;
    sellerPhone?: string | null;
    sellerEmail?: string | null;
    logoUrl?: string | null;
    bankInfo?: string | null;
    signerName?: string | null;
    signerTitle?: string | null;
    termsText?: string | null;
    footerNote?: string | null;
    numberPrefix?: string;
    defaultTaxRate?: number;
    defaultValidDays?: number;
    accentColor?: string | null;
}
export declare class TemplateNotFoundError extends Error {
    readonly code = "NOT_FOUND";
    constructor();
}
export declare function listTemplates(orgId: string): Promise<{
    [x: string]: any;
}[]>;
export declare function getTemplate(orgId: string, id: string): Promise<{
    [x: string]: any;
}>;
export declare function createTemplate(orgId: string, input: TemplateInput): Promise<{
    [x: string]: any;
}>;
export declare function updateTemplate(orgId: string, id: string, input: TemplateInput): Promise<{
    [x: string]: any;
}>;
export declare function deleteTemplate(orgId: string, id: string): Promise<void>;
