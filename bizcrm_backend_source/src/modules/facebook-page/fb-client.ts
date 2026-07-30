// Thin HTTP wrapper around the Meta Graph API for the official Facebook Page
// (Messenger Platform) channel. Mirrors zalo-oa/oa-client.ts. Uses native fetch.
// All methods throw FbApiError when Graph returns an `error` object.
//
// Token model note: Facebook has NO refresh-token grant. The OAuth flow yields a
// short-lived USER token → exchange for a long-lived user token → read per-PAGE
// tokens from /me/accounts. Page tokens derived from a long-lived user token are
// effectively long-lived; when one is revoked/expired (code 190) the user must
// reconnect — there is nothing to refresh.

const GRAPH_BASE = 'https://graph.facebook.com';
const WWW_BASE = 'https://www.facebook.com';

function graphVersion(): string {
  return process.env.FACEBOOK_GRAPH_VERSION || 'v25.0';
}

export type FbAttachmentType = 'image' | 'video' | 'audio' | 'file';

export class FbApiError extends Error {
  constructor(
    public code: number | string,
    msg: string,
    public subcode?: number,
    public raw?: unknown,
  ) {
    super(`Facebook Graph error ${code}${subcode ? `/${subcode}` : ''}: ${msg}`);
    this.name = 'FbApiError';
  }
}

export interface FbTokenResult {
  accessToken: string;
  expiresIn: number; // seconds (0 = no explicit expiry)
}

export interface FbPage {
  id: string;
  name: string;
  accessToken: string;
  avatarUrl?: string;
}

// ─── Per-page client (one instance per page access token) ───────────────

export class FbClient {
  constructor(private pageToken: string) {}

  /** Send a text message to a PSID via the Send API. */
  async sendText(psid: string, text: string): Promise<{ messageId: string }> {
    const data = await this.post('/me/messages', {
      recipient: { id: psid },
      messaging_type: 'RESPONSE',
      message: { text },
    });
    return { messageId: String(data.message_id ?? '') };
  }

  /**
   * Send a media attachment by uploading the raw bytes (multipart). Uploading
   * the buffer directly means we don't need a public URL Facebook can reach, so
   * this works in local dev too (unlike sending by payload.url).
   */
  async sendAttachment(
    psid: string,
    buffer: Uint8Array,
    filename: string,
    mimeType: string,
    type: FbAttachmentType,
  ): Promise<{ messageId: string }> {
    const form = new FormData();
    form.append('messaging_type', 'RESPONSE');
    form.append('recipient', JSON.stringify({ id: psid }));
    form.append('message', JSON.stringify({ attachment: { type, payload: { is_reusable: false } } }));
    // Copy into a fresh ArrayBuffer-backed view — Blob rejects a possibly
    // SharedArrayBuffer-backed Uint8Array under strict lib types.
    form.append('filedata', new Blob([new Uint8Array(buffer)], { type: mimeType || 'application/octet-stream' }), filename);
    // No Content-Type header — fetch derives the multipart boundary from FormData.
    const res = await fetch(`${GRAPH_BASE}/${graphVersion()}/me/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.pageToken}` },
      body: form,
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* fall through */
    }
    if (json?.error) {
      const e = json.error;
      throw new FbApiError(e.code ?? res.status, String(e.message ?? 'unknown'), e.error_subcode, json);
    }
    if (!res.ok) throw new FbApiError(res.status, `HTTP ${res.status}`, undefined, json);
    return { messageId: String(json.message_id ?? '') };
  }

  /** Fetch a customer's public profile (name + avatar) scoped to the page. */
  async getUserProfile(psid: string): Promise<{ name?: string; avatar?: string }> {
    const data = await this.get(`/${encodeURIComponent(psid)}`, { fields: 'name,profile_pic' });
    return { name: data.name, avatar: data.profile_pic };
  }

  private async get(path: string, params: Record<string, string>): Promise<any> {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `${GRAPH_BASE}/${graphVersion()}${path}${qs ? `?${qs}` : ''}`, this.pageToken);
  }

  private async post(path: string, body: unknown): Promise<any> {
    return request('POST', `${GRAPH_BASE}/${graphVersion()}${path}`, this.pageToken, body);
  }
}

// ─── OAuth + page helpers (static — no page token yet) ──────────────────

export function buildAuthorizeUrl(opts: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}): string {
  const params = new URLSearchParams({
    client_id: opts.appId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    scope: opts.scopes.join(','),
    response_type: 'code',
  });
  return `${WWW_BASE}/${graphVersion()}/dialog/oauth?${params.toString()}`;
}

/** Exchange an authorization code for a short-lived USER access token. */
export async function exchangeCodeForToken(opts: {
  code: string;
  redirectUri: string;
  appId: string;
  appSecret: string;
}): Promise<FbTokenResult> {
  const params = new URLSearchParams({
    client_id: opts.appId,
    redirect_uri: opts.redirectUri,
    client_secret: opts.appSecret,
    code: opts.code,
  });
  const data = await request(
    'GET',
    `${GRAPH_BASE}/${graphVersion()}/oauth/access_token?${params.toString()}`,
  );
  return { accessToken: String(data.access_token ?? ''), expiresIn: Number(data.expires_in ?? 0) };
}

/** Exchange a short-lived user token for a long-lived one (~60 days). */
export async function exchangeForLongLivedToken(opts: {
  userToken: string;
  appId: string;
  appSecret: string;
}): Promise<FbTokenResult> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: opts.appId,
    client_secret: opts.appSecret,
    fb_exchange_token: opts.userToken,
  });
  const data = await request(
    'GET',
    `${GRAPH_BASE}/${graphVersion()}/oauth/access_token?${params.toString()}`,
  );
  return { accessToken: String(data.access_token ?? ''), expiresIn: Number(data.expires_in ?? 0) };
}

/** List the pages the user administers, each with its own page access token. */
export async function getPages(userToken: string): Promise<FbPage[]> {
  const data = await request(
    'GET',
    `${GRAPH_BASE}/${graphVersion()}/me/accounts?fields=id,name,access_token,picture{url}`,
    userToken,
  );
  const arr: any[] = Array.isArray(data?.data) ? data.data : [];
  return arr
    .filter((p) => p?.id && p?.access_token)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name ?? ''),
      accessToken: String(p.access_token),
      avatarUrl: p.picture?.data?.url,
    }));
}

/** Subscribe our app to a page's webhook events (messages, postbacks, …). */
export async function subscribePageWebhook(pageId: string, pageToken: string): Promise<void> {
  const params = new URLSearchParams({
    subscribed_fields: 'messages,messaging_postbacks,message_deliveries,message_reads,messaging_optins',
  });
  await request(
    'POST',
    `${GRAPH_BASE}/${graphVersion()}/${encodeURIComponent(pageId)}/subscribed_apps?${params.toString()}`,
    pageToken,
  );
}

// ─── Shared HTTP ────────────────────────────────────────────────────────

async function request(
  method: 'GET' | 'POST',
  url: string,
  token?: string,
  body?: unknown,
): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* fall through */
  }
  if (json?.error) {
    const e = json.error;
    throw new FbApiError(e.code ?? res.status, String(e.message ?? 'unknown'), e.error_subcode, json);
  }
  if (!res.ok) {
    throw new FbApiError(res.status, `HTTP ${res.status}`, undefined, json);
  }
  return json;
}
