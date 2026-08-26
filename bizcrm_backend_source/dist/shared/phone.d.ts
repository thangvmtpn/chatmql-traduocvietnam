export declare class PhoneFormatError extends Error {
    input: string;
    constructor(input: string, msg: string);
}
export declare function normalizePhone(input: string): string;
export declare function tryNormalizePhone(input: string | null | undefined): string | null;
