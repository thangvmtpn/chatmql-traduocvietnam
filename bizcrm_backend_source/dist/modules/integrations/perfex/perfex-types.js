// Types for the PerfexCRM REST addon (CodeCanyon #25278359).
// Contract reference: plans/2026-05-29-perfexcrm-sync/reports/perfex-rest-api-contract.md
export const PERFEX_CONFIG_DEFAULTS = {
    syncContacts: true,
    syncLeads: false,
    syntheticEmailFallbackDomain: 'noreply.bizcrm.vn',
    debounceSeconds: 15,
};
/** Domain-event `origin` tag for writes made by a (future) Perfex→biz-crm pull — used as a
 *  loop guard so the subscriber ignores its own writes. */
export const PERFEX_ORIGIN = 'perfex-pull';
//# sourceMappingURL=perfex-types.js.map