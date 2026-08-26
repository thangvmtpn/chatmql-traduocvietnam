/**
 * registry.ts — integration registry.
 *
 * Each integration self-registers `{ name, init }`. Boot calls `initIntegrations()` once.
 * Adding an integration = call registerIntegration(...) from its module + one register call
 * in app.ts. Removing one = delete its module + that call. Core code is never touched.
 */
import { logger } from '../../shared/logger.js';
const registered = [];
export function registerIntegration(integration) {
    if (registered.some((i) => i.name === integration.name)) {
        logger.warn({ name: integration.name }, '[integrations] already registered, skipping');
        return;
    }
    registered.push(integration);
}
/** Initialize all registered integrations. One failing init must not block the others. */
export async function initIntegrations() {
    for (const integration of registered) {
        try {
            await integration.init();
            logger.info({ name: integration.name }, '[integrations] initialized');
        }
        catch (err) {
            logger.error({ err, name: integration.name }, '[integrations] init failed');
        }
    }
}
//# sourceMappingURL=registry.js.map