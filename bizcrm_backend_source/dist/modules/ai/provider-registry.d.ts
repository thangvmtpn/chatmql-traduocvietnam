export type ProviderModel = {
    title: string;
    value: string;
};
export type ProviderDef = {
    id: string;
    name: string;
    baseUrl: string;
    models: ProviderModel[];
    supportsCaching: boolean;
    primary: boolean;
};
/** Returns all providers that have at least one model defined. Per-org key
 *  presence is the caller's responsibility (see hasOpenaiKey etc. in getAiConfig). */
export declare function getAvailableProviders(): ProviderDef[];
/** Returns the static config for a provider, or undefined */
export declare function getProviderConfig(providerId: string): ProviderDef | undefined;
