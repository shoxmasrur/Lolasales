import { mapMessage } from '@/infrastructure/db/mappers';

/**
 * Qo'lda ishga tushiriladi: npm run test:xabar-tahriri-mapper --workspace=server
 *
 * Bazaga chiqmaydi — xom qator qo'lda yasaladi.
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

const asos = {
  id: 'm1',
  conversation_id: 'cv1',
  direction: 'out',
  author: 'agent',
  body: 'yangi matn',
  status: 'sent',
  meta: {},
  created_at: new Date('2026-09-10T08:00:00Z'),
};

// 1. Tegilmagan xabar — uchala maydon ham null.
{
  const m = mapMessage({ ...asos } as never);
  check('tegilmagan xabarda editedAt null', m.editedAt === null, `${m.editedAt}`);
  check('tegilmagan xabarda revokedAt null', m.revokedAt === null, `${m.revokedAt}`);
  check('tegilmagan xabarda originalBody null', m.originalBody === null, `${m.originalBody}`);
}

// 2. Tahrirlangan xabar — eski matn va vaqt o'qiladi.
{
  const m = mapMessage({
    ...asos,
    edited_at: new Date('2026-09-10T09:00:00Z'),
    original_body: 'eski matn',
  } as never);
  check('editedAt Date bo\'lib keladi', m.editedAt instanceof Date, `${m.editedAt}`);
  check('originalBody o\'qiladi', m.originalBody === 'eski matn', `${m.originalBody}`);
  check('body joriy matn bo\'lib qoladi', m.body === 'yangi matn', m.body);
}

// 3. O'chirilgan xabar.
{
  const m = mapMessage({ ...asos, revoked_at: new Date('2026-09-10T10:00:00Z') } as never);
  check('revokedAt Date bo\'lib keladi', m.revokedAt instanceof Date, `${m.revokedAt}`);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
