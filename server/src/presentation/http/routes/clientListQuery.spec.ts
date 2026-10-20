import { listFiltrlari, listQuery } from '@/presentation/http/routes/clientRoutes';
import { PgClientRepository } from '@/infrastructure/db/repositories/PgClientRepository';
import type { ClientQuery } from '@/domain/repositories/IClientRepository';

/**
 * Qo'lda ishga tushiriladi: npm run test:client-list-query --workspace=server
 *
 * Telegram va shartnoma holati filtrlari bir nechta qiymat oladi
 * (2026-10-13). Ro'yxat, "hammasini belgilash" va eksport shu bitta
 * sxemadan yuradi — bu yerda sxema va undan chiqadigan SQL sharti
 * tekshiriladi. Bazaga chiqmaydi.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const filtr = (query: Record<string, unknown>): ClientQuery => listFiltrlari(listQuery.parse(query));
const yaroqlimi = (query: Record<string, unknown>): boolean => listQuery.safeParse(query).success;

// ─── So'rov satri → filtr ─────────────────────────────────────────────────
check('berilmagan — filtr yo\'q', filtr({}).telegramStatus, undefined);
// Eski bitta qiymatli so'rov (MCP, saqlangan havolalar) ishlashda davom etadi.
check('bitta qiymat — bir elementli ro\'yxat', filtr({ telegramStatus: 'found' }).telegramStatus, ['found']);
// Express takrorlangan parametrni massiv qilib beradi.
check('bir nechta qiymat', filtr({ telegramStatus: ['unknown', 'name_mismatch'] }).telegramStatus, ['unknown', 'name_mismatch']);
check('takror qiymatlar birlashtiriladi', filtr({ telegramStatus: ['found', 'found'] }).telegramStatus, ['found']);
check('bo\'sh satr — filtr yo\'q', filtr({ telegramStatus: '' }).telegramStatus, undefined);
check('noto\'g\'ri holat rad etiladi', yaroqlimi({ telegramStatus: ['found', 'yoq_holat'] }), false);

check('shartnoma: bitta', filtr({ virtualStatus: 'sold' }).virtualStatus, ['sold']);
check('shartnoma: bir nechta', filtr({ virtualStatus: ['sold', 'Проц. отказ'] }).virtualStatus, ['sold', 'Проц. отказ']);
// Vergul ajratuvchi EMAS: CRM'dan kelgan xom holat nomida vergul bo'lishi mumkin.
check('vergulli nom bo\'linmaydi', filtr({ virtualStatus: 'Отказ, возврат' }).virtualStatus, ['Отказ, возврат']);
check('shartnoma: bo\'sh — filtr yo\'q', filtr({ virtualStatus: [] }).virtualStatus, undefined);

// ─── Filtr → SQL sharti ───────────────────────────────────────────────────
const repo = new PgClientRepository() as unknown as {
  buildSearchBase(q: ClientQuery): { base: string; params: unknown[] };
};

{
  const { base, params } = repo.buildSearchBase({ telegramStatus: ['unknown', 'name_mismatch'] });
  check('telegram: ANY sharti', base.includes('c.telegram_status = ANY($1::text[])'), true);
  check('telegram: parametr — ro\'yxat', params, [['unknown', 'name_mismatch']]);
}
{
  const { base, params } = repo.buildSearchBase({});
  check('filtrsiz — telegram sharti yo\'q', base.includes('c.telegram_status = ANY'), false);
  check('filtrsiz — parametr yo\'q', params, []);
}
{
  const bitta = repo.buildSearchBase({ virtualStatus: ['sold'] }).params[0] as string[];
  const ikkita = repo.buildSearchBase({ virtualStatus: ['sold', 'Проц. отказ'] });
  const p = ikkita.params[0] as string[];
  check('shartnoma: bitta shart ichida "yoki"', (ikkita.base.match(/trim\(ct\.virtual_status\) = ANY/g) ?? []).length, 1);
  check('shartnoma: birinchi holatning hamma yozilishi kiradi', bitta.every((v) => p.includes(v)), true);
  check('shartnoma: ikkinchi holat ham kiradi', p.includes('Проц. отказ'), true);
  check('shartnoma: ro\'yxat kengaydi', p.length > bitta.length, true);
}
{
  // Ikki filtr orasida "va": har biri o'z parametri bilan.
  const { base, params } = repo.buildSearchBase({ telegramStatus: ['found'], virtualStatus: ['sold'] });
  check('ikki filtr — ikki parametr', params.length, 2);
  check('ikki filtr AND bilan', base.includes('c.telegram_status = ANY($1::text[])') && base.includes('ANY($2::text[])'), true);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exit(failed ? 1 : 0);
