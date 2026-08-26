import { authMiddleware } from '../../auth/auth-middleware.js';
import { syncContactFromCrm, batchSyncContacts, findCrmCustomerByPhone } from './crm-sync-service.js';
export async function crmSyncRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // Sync a single contact's custom properties and appointments from CRM
    app.post('/api/v1/integrations/crm/sync-contact/:contactId', async (request, reply) => {
        const user = request.user;
        const { contactId } = request.params;
        const result = await syncContactFromCrm(contactId, user.orgId);
        if (!result) {
            return reply.status(404).send({ error: 'Không tìm thấy thông tin khách hàng trong CRM' });
        }
        return {
            message: 'Đồng bộ thông tin CRM thành công',
            syncedPropertiesCount: result.syncedPropertiesCount,
            crmCustomer: result.crmKh,
        };
    });
    // Batch sync all contacts in the organization
    app.post('/api/v1/integrations/crm/sync-all', async (request) => {
        const user = request.user;
        const limit = parseInt(request.query.limit || '500', 10);
        const result = await batchSyncContacts(user.orgId, limit);
        return {
            message: `Đã đồng bộ ${result.synced}/${result.total} khách hàng từ CRM`,
            ...result,
        };
    });
    // Quick lookup customer info by phone
    app.get('/api/v1/integrations/crm/customer-lookup', async (request, reply) => {
        const { phone } = request.query;
        if (!phone) {
            return reply.status(400).send({ error: 'phone query parameter required' });
        }
        const customer = await findCrmCustomerByPhone(phone);
        if (!customer) {
            return reply.status(404).send({ error: 'Khách hàng chưa có trong CRM' });
        }
        return { customer };
    });
}
//# sourceMappingURL=crm-sync-routes.js.map