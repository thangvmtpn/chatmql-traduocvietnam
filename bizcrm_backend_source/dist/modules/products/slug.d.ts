export declare function slugify(input: string): string;
type SlugModel = 'product' | 'productCategory' | 'knowledgeCategory';
/** Generate a slug unique within the org for the given model (appends -2, -3…). */
export declare function uniqueSlug(orgId: string, name: string, model: SlugModel, excludeId?: string): Promise<string>;
export {};
