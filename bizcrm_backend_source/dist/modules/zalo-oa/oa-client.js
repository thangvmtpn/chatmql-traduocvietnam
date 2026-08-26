// Thin HTTP wrapper around Zalo Official Account + ZNS APIs.
// Uses native fetch (Node 20+). All methods throw OaApiError when Zalo returns
// a non-zero `error` field. One OaClient instance per access token.
const OA_BASE = 'https://openapi.zalo.me';
const ZNS_BASE = 'https://business.openapi.zalo.me';
const OAUTH_BASE = 'https://oauth.zaloapp.com';
export class OaApiError extends Error {
    code;
    raw;
    constructor(code, msg, raw) {
        super(`Zalo OA error ${code}: ${msg}`);
        this.code = code;
        this.raw = raw;
        this.name = 'OaApiError';
    }
}
export class OaClient {
    accessToken;
    constructor(accessToken) {
        this.accessToken = accessToken;
    }
    // ─── OA messaging (consultation / free-form within 7-day window) ───
    async sendText(uid, text, quote) {
        const message = { text };
        if (quote)
            message.quote = { msg_id: quote.msgId, text: quote.text };
        const data = await this.postOa('/v3.0/oa/message/cs', {
            recipient: { user_id: uid },
            message,
        });
        return { messageId: String(data.message_id ?? '') };
    }
    async sendImage(uid, attachmentId, text) {
        const data = await this.postOa('/v3.0/oa/message/cs', {
            recipient: { user_id: uid },
            message: {
                text,
                attachment: { type: 'template', payload: { template_type: 'media', elements: [{ media_type: 'image', attachment_id: attachmentId }] } },
            },
        });
        return { messageId: String(data.message_id ?? '') };
    }
    async sendFile(uid, fileToken) {
        const data = await this.postOa('/v3.0/oa/message/cs', {
            recipient: { user_id: uid },
            message: {
                attachment: { type: 'file', payload: { token: fileToken } },
            },
        });
        return { messageId: String(data.message_id ?? '') };
    }
    // ─── OA profile / OA info ───
    async getFollowerProfile(uid) {
        const data = await this.getOa('/v3.0/oa/user/detail', { data: JSON.stringify({ user_id: uid }) });
        const shared = data.shared_info ?? {};
        return {
            displayName: data.display_name,
            avatar: data.avatar,
            phone: shared.phone || undefined,
            gender: shared.gender != null ? String(shared.gender) : undefined,
            address: shared.address || undefined,
            dob: shared.dob || undefined,
        };
    }
    async getOaInfo() {
        const data = await this.getOa('/v2.0/oa/getoa', {});
        return { externalPageId: String(data.oa_id ?? ''), name: String(data.name ?? ''), avatar: data.avatar };
    }
    // ─── ZNS ───
    async listZnsTemplates() {
        const data = await this.getZns('/template/all', {});
        const arr = Array.isArray(data) ? data : (data?.templates ?? []);
        return arr.map((t) => ({
            templateId: String(t.templateId ?? t.template_id),
            templateName: String(t.templateName ?? t.template_name ?? ''),
            status: String(t.status ?? 'ENABLE').toUpperCase(),
            templateType: t.templateType ?? t.template_type,
            params: Array.isArray(t.listParams ?? t.params) ? (t.listParams ?? t.params) : [],
            previewUrl: t.previewUrl ?? t.preview_url,
        }));
    }
    async getTemplateDetail(templateId) {
        const data = await this.getZns('/template/info/v2', { template_id: templateId });
        return {
            templateId,
            templateName: String(data.templateName ?? ''),
            status: String(data.status ?? 'ENABLE').toUpperCase(),
            templateType: data.templateType,
            params: Array.isArray(data.listParams) ? data.listParams : [],
            previewUrl: data.previewUrl,
        };
    }
    async sendZns(p) {
        const body = {
            phone: p.phone,
            template_id: p.templateId,
            template_data: p.templateData,
            tracking_id: p.trackingId,
            mode: p.mode ?? 'production',
        };
        const data = await this.postZns('/message/template', body);
        return { msgId: String(data.msg_id ?? ''), sentTime: Number(data.sent_time ?? Date.now()) };
    }
    // ─── HTTP helpers ───
    async getOa(path, params) {
        const qs = new URLSearchParams(params).toString();
        const url = `${OA_BASE}${path}${qs ? `?${qs}` : ''}`;
        return this.request('GET', url);
    }
    async postOa(path, body) {
        return this.request('POST', `${OA_BASE}${path}`, body);
    }
    async getZns(path, params) {
        const qs = new URLSearchParams(params).toString();
        const url = `${ZNS_BASE}${path}${qs ? `?${qs}` : ''}`;
        return this.request('GET', url);
    }
    async postZns(path, body) {
        return this.request('POST', `${ZNS_BASE}${path}`, body);
    }
    async request(method, url, body) {
        const headers = { access_token: this.accessToken };
        if (body !== undefined)
            headers['Content-Type'] = 'application/json';
        const res = await fetch(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        let json = null;
        try {
            json = await res.json();
        }
        catch { /* fall through */ }
        if (!res.ok) {
            throw new OaApiError(res.status, `HTTP ${res.status}`, json);
        }
        if (json && typeof json.error !== 'undefined' && json.error !== 0 && json.error !== '0') {
            throw new OaApiError(json.error, String(json.message ?? 'unknown'), json);
        }
        return json?.data ?? json;
    }
}
// ─── OAuth (static helpers — do not require an OaClient) ───
export async function exchangeCodeForToken(opts) {
    const params = new URLSearchParams({
        code: opts.code,
        app_id: opts.appId,
        grant_type: 'authorization_code',
        code_verifier: opts.codeVerifier,
    });
    const res = await fetch(`${OAUTH_BASE}/v4/oa/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: opts.appSecret },
        body: params.toString(),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
        throw new OaApiError(json?.error ?? res.status, json?.error_description ?? 'OAuth exchange failed', json);
    }
    return {
        accessToken: String(json.access_token),
        refreshToken: String(json.refresh_token),
        expiresIn: Number(json.expires_in ?? 3600),
    };
}
export async function refreshAccessToken(opts) {
    const params = new URLSearchParams({
        refresh_token: opts.refreshToken,
        app_id: opts.appId,
        grant_type: 'refresh_token',
    });
    const res = await fetch(`${OAUTH_BASE}/v4/oa/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: opts.appSecret },
        body: params.toString(),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
        throw new OaApiError(json?.error ?? res.status, json?.error_description ?? 'OAuth refresh failed', json);
    }
    return {
        accessToken: String(json.access_token),
        refreshToken: String(json.refresh_token ?? opts.refreshToken),
        expiresIn: Number(json.expires_in ?? 3600),
    };
}
export function buildAuthorizeUrl(opts) {
    const params = new URLSearchParams({
        app_id: opts.appId,
        redirect_uri: opts.redirectUri,
        state: opts.state,
        code_challenge: opts.codeChallenge,
        code_challenge_method: 'S256',
    });
    return `${OAUTH_BASE}/v4/oa/permission?${params.toString()}`;
}
//# sourceMappingURL=oa-client.js.map