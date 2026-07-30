// Pure normalization of Facebook Messenger message events. Kept dependency-free
// so it can be unit-tested without the DB / queue import chain of fb-webhook.ts.
//
// Key job: encode media into the SAME `content` JSON shape the chat frontend
// already parses for Zalo (parseImageUrls/parseVideoInfo/parseFileInfo read the
// `content` string, NOT `attachments`). Without this, FB images/video/files
// would never render in the inbox.

export interface FbAttachment {
  type?: string;
  payload?: { url?: string; coordinates?: { lat?: number; long?: number } };
}

export interface FbMessage {
  mid?: string;
  text?: string;
  is_echo?: boolean;
  attachments?: FbAttachment[];
}

export interface NormalizedContent {
  contentType: string;
  content: string;
  attachments: any[];
}

/** Best-effort file extension from a URL path (before any query string). */
export function fileExtFromUrl(url: string): string {
  const path = url.split('?')[0];
  const m = path.match(/\.([a-z0-9]{1,6})$/i);
  return m ? m[1].toLowerCase() : '';
}

export function mapContentType(msg?: FbMessage): NormalizedContent {
  const raw = msg?.attachments ?? [];
  const first = raw[0];
  if (first?.type) {
    const url = first.payload?.url ?? '';
    switch (first.type) {
      case 'image':
        return { contentType: 'image', content: JSON.stringify({ href: url, thumb: url, hdUrl: url }), attachments: raw };
      case 'video':
        return { contentType: 'video', content: JSON.stringify({ href: url }), attachments: raw };
      case 'audio':
        return { contentType: 'voice', content: JSON.stringify({ href: url }), attachments: raw };
      case 'file': {
        const ext = fileExtFromUrl(url);
        return {
          contentType: 'file',
          content: JSON.stringify({ title: ext ? `Tệp đính kèm.${ext}` : 'Tệp đính kèm', href: url, fileExt: ext || 'file', fileSize: '0' }),
          attachments: raw,
        };
      }
      case 'location': {
        const c = first.payload?.coordinates;
        // Render as a clickable Google Maps link (no dedicated FB location UI).
        const mapUrl = c?.lat != null && c?.long != null ? `https://www.google.com/maps?q=${c.lat},${c.long}` : url;
        return { contentType: 'link', content: JSON.stringify({ href: mapUrl, title: '📍 Vị trí' }), attachments: raw };
      }
    }
  }
  return { contentType: 'text', content: msg?.text ?? '', attachments: [] };
}
