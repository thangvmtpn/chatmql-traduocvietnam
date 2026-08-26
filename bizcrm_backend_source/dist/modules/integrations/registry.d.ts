export interface Integration {
    name: string;
    /** Called once at boot. Wire subscribers, start workers, warm caches here. */
    init: () => Promise<void> | void;
}
export declare function registerIntegration(integration: Integration): void;
/** Initialize all registered integrations. One failing init must not block the others. */
export declare function initIntegrations(): Promise<void>;
