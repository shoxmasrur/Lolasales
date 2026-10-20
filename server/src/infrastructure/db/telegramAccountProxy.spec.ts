import { mapTelegramAccount } from '@/infrastructure/db/mappers';
import { encrypt } from '@/shared/crypto';

/**
 * Qo'lda ishga tushiriladi: npm run test:proxy-mapper
 *
 * Bitta narsa tekshiriladi: proksisiz qator `proxy: null` beradi,
 * to'liq qator esa parolni ochib beradi. Adashsa akkaunt jim turib
 * to'g'ridan-to'g'ri, ya'ni server IP'sidan ulanib ketardi — aynan
 * shundan qochyapmiz, shuning uchun alohida test.
 *
 * `.env` dagi ENCRYPTION_KEY kerak (shifrlash uchun).
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(kutilgan);
  if (a === b) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${b})`);
  }
}

const NOW = new Date('2026-08-08T10:00:00Z');

function row(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'a1', label: 'Sinov', phone: '+998901112233', api_id: 1,
    api_hash_enc: encrypt('hash'), session_enc: null,
    status: 'connected', daily_limit: 30, sent_today: 0,
    lookup_limit: 50, lookups_today: 0, counter_date: null,
    spam_status: 'clean', is_enabled: true, created_at: NOW, updated_at: NOW,
    ...patch,
  };
}

// ── 1. Proksisiz qator ──────────────────────────────────────────────────
eq('proksisiz qator', mapTelegramAccount(row() as never).proxy, null);

// ── 2. To'liq proksi, parol ochiladi ────────────────────────────────────
eq(
  'to\'liq proksi',
  mapTelegramAccount(row({
    proxy_host: '185.22.10.7',
    proxy_port: 1080,
    proxy_username: 'user',
    proxy_password_enc: encrypt('pass'),
  }) as never).proxy,
  { host: '185.22.10.7', port: 1080, username: 'user', password: 'pass' },
);

// ── 3. Loginsiz proksi ──────────────────────────────────────────────────
eq(
  'loginsiz proksi',
  mapTelegramAccount(row({ proxy_host: '185.22.10.7', proxy_port: 1080 }) as never).proxy,
  { host: '185.22.10.7', port: 1080, username: null, password: null },
);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
