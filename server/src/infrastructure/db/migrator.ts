import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from '@/infrastructure/db/pool';
import { childLogger } from '@/shared/logger';

const log = childLogger('migrator');
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dev'da bu fayl `server/src/infrastructure/db` da, produksiya bundle'ida esa
 * `server/dist` da turadi — ildizgacha bo'lgan chuqurlik har xil. Shuning uchun
 * qat'iy `../../../` o'rniga `migrations` papkasi yuqoriga qarab qidiriladi.
 */
function resolveMigrationsDir(): string {
  let dir = here;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, 'migrations');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`'migrations' papkasi topilmadi (qidirildi: ${here} va undan yuqorisi)`);
}

const MIGRATIONS_DIR = resolveMigrationsDir();

export async function runMigrations(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log.info({ file }, 'Migratsiya qo\'llandi');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      log.error({ file, err }, 'Migratsiya muvaffaqiyatsiz');
      throw err;
    } finally {
      client.release();
    }
  }

  log.info({ total: files.length }, 'Migratsiyalar tayyor');
}
