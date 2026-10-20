import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { IMediaStorage, StoredMedia } from '@/domain/services/IMediaStorage';
import { config } from '@/shared/config';
import { AppError } from '@/shared/errors';

/**
 * Mahalliy diskda saqlash. S3/MinIO ga o'tilsa faqat shu klass almashadi.
 *
 * Bazada faqat NISBIY yo'l saqlanadi va o'qishda u ildizdan chiqib
 * ketmasligi tekshiriladi (path traversal himoyasi).
 */
export class LocalMediaStorage implements IMediaStorage {
  constructor(private readonly root: string = config.MEDIA_DIR) {}

  async save(data: Buffer, fileName: string): Promise<StoredMedia> {
    const now = new Date();
    const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const safeName = `${crypto.randomUUID()}-${sanitizeName(fileName)}`;
    const relative = path.posix.join(folder, safeName);
    const absolute = this.absolute(relative);

    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, data);

    return { path: relative, sizeBytes: data.byteLength };
  }

  async read(relative: string): Promise<Buffer> {
    return fs.readFile(this.absolute(relative));
  }

  async exists(relative: string): Promise<boolean> {
    try {
      await fs.access(this.absolute(relative));
      return true;
    } catch {
      return false;
    }
  }

  /** Yo'l saqlash ildizidan tashqariga chiqmasligini kafolatlaydi. */
  private absolute(relative: string): string {
    const resolvedRoot = path.resolve(this.root);
    const target = path.resolve(resolvedRoot, relative);
    if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
      throw new AppError('Fayl yo\'li noto\'g\'ri', 400, 'INVALID_PATH');
    }
    return target;
  }
}

function sanitizeName(name: string): string {
  const cleaned = path.basename(name).replace(/[^\w.-]/g, '_');
  return cleaned.slice(-80) || 'file';
}
