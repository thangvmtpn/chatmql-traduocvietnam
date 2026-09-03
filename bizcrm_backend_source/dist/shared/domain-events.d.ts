export type DomainEntityType = 'contact' | 'company';
export type DomainEventType = 'contact.created' | 'contact.updated' | 'contact.deleted' | 'company.created' | 'company.updated' | 'company.deleted' | 'quote.created' | 'quote.updated' | 'quote.deleted' | 'quote.sent' | 'quote.viewed' | 'quote.accepted' | 'quote.rejected' | 'quote.status_changed';
export interface DomainEvent {
    type: DomainEventType;
    orgId: string;
    id: string;
    /** Provenance — e.g. 'perfex-pull'. Lets integrations ignore their own writes (loop guard). */
    origin?: string;
}
/** Emit a domain event. Sync, fire-and-forget; swallows subscriber errors. */
export declare function emitDomainEvent(event: DomainEvent): void;
/** Subscribe to all domain events. Returns an unsubscribe fn. */
export declare function onDomainEvent(handler: (event: DomainEvent) => void): () => void;
