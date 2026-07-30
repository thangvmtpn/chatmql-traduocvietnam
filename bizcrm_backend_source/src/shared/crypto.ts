// AES-256-GCM token encryption for Zalo OA access/refresh tokens.
// Key: env TOKEN_ENC_KEY (32 bytes, base64). Generate: openssl rand -base64 32.
// Ciphertext format: v1:<iv_b64>:<tag_b64>:<ct_b64>

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const VERSION = 'v1';

function loadKey(): Buffer {
  const b64 = process.env.TOKEN_ENC_KEY;
  if (!b64) throw new Error('TOKEN_ENC_KEY not set');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== 32) throw new Error('TOKEN_ENC_KEY must decode to 32 bytes');
  return buf;
}

export function encryptToken(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptToken(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Invalid ciphertext format');
  }
  const key = loadKey();
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ct = Buffer.from(parts[3], 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
