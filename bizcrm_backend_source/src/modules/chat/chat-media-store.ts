/**
 * chat-media-store.ts — persist OUTBOUND chat media (images/files the operator
 * sends) to served static storage so it renders in the CRM timeline.
 *
 * For channels like Facebook we upload the raw bytes straight to the platform
 * (no public URL needed), but the CRM still needs a URL to display what was
 * sent — that's what this returns. The URL is absolute (built from
 * PUBLIC_API_URL) so it resolves from the frontend's separate origin.
 */
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const CHAT_MEDIA_DIR = path.resolve(__dirname, '../../../uploads/chat-media')
mkdir(CHAT_MEDIA_DIR, { recursive: true }).catch(() => {})

/** Backend's own public origin — used to build absolute media URLs the FE can load. */
function publicApiBase(): string {
  return (process.env.PUBLIC_API_URL || 'http://localhost:4520').replace(/\/$/, '')
}

/** Write an outbound media buffer to served storage; returns an absolute URL. */
export async function saveChatMedia(buffer: Buffer, filename: string): Promise<string> {
  const ext = (path.extname(filename || '') || '.bin').toLowerCase()
  const name = `${randomUUID()}${ext}`
  await writeFile(path.join(CHAT_MEDIA_DIR, name), buffer)
  return `${publicApiBase()}/uploads/chat-media/${name}`
}
