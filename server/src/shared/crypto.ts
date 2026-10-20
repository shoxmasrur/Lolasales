import crypto from 'node:crypto';
import { config } from '@/shared/config';

const ALGO = 'aes-256-gcm';
const key = crypto.createHash('sha256').update(config.ENCRYPTION_KEY).digest();

/**
 * Telegram sessiya satri va api_hash bazada ochiq saqlanmasligi kerak —
 * sessiya satri akkauntga to'liq kirish huquqini beradi.
 */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Shifrlangan qiymat buzilgan');
  }
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
