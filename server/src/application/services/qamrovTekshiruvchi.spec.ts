import { HAMMASI, type MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import type { IQamrovRepository } from '@/domain/repositories/IQamrovRepository';
import { QamrovTekshiruvchi } from '@/application/services/QamrovTekshiruvchi';
import { NotFoundError } from '@/shared/errors';

/** Qo'lda: npm run test:qamrov-tekshiruvchi --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const U = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = U(1); const B = U(2); const C = U(3);

const chaqiruvlar: string[] = [];
/** Soxta repo: faqat `korinadi` dagi id'lar qamrovda. */
function soxta(korinadi: string[]): IQamrovRepository {
  const bor = (m: string) => async (_q: MijozQamrovi, id: string): Promise<boolean> => {
    chaqiruvlar.push(`${m}:${id}`);
    return korinadi.includes(id);
  };
  const kes = (m: string) => async (_q: MijozQamrovi, ids: string[]): Promise<string[]> => {
    chaqiruvlar.push(`${m}:${ids.join(',')}`);
    // Ataylab teskari tartibda — xizmat kirish tartibini o'zi tiklashi kerak.
    return ids.filter((i) => korinadi.includes(i)).reverse();
  };
  return {
    mijozQamrovdaMi: bor('mijoz'),
    suhbatQamrovdaMi: bor('suhbat'),
    xabarQamrovdaMi: bor('xabar'),
    shartnomaQamrovdaMi: bor('shartnoma'),
    shartnomaRaqamiQamrovdaMi: bor('raqam'),
    talabnomaQamrovdaMi: bor('talabnoma'),
    qamrovdagiMijozlar: kes('mijozlar'),
    qamrovdagiSuhbatlar: kes('suhbatlar'),
  };
}

async function xato(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'otdi';
  } catch (err) {
    if (err instanceof NotFoundError) return `404:${err.code}`;
    return `boshqa:${String(err)}`;
  }
}

const CH: MijozQamrovi = { cheklangan: true, obyektlar: ['Vatan'] };

async function main(): Promise<void> {
  const t = new QamrovTekshiruvchi(soxta([A]));

  // Cheklanmagan: hech qanday repo chaqiruvi yo'q.
  chaqiruvlar.length = 0;
  const natija = [
    await xato(() => t.mijoz(HAMMASI, B)),
    await xato(() => t.suhbat(HAMMASI, B)),
    await xato(() => t.xabar(HAMMASI, B)),
    await xato(() => t.shartnoma(HAMMASI, B)),
    await xato(() => t.shartnomaRaqami(HAMMASI, 'X1')),
    await xato(() => t.talabnoma(HAMMASI, B)),
  ];
  check('cheklanmagan: hammasi o\'tadi', natija, ['otdi', 'otdi', 'otdi', 'otdi', 'otdi', 'otdi']);
  check('cheklanmagan: kesish o\'zgarmaydi', await t.idlarniKesish(HAMMASI, [C, 'yaroqsiz', A]), [C, 'yaroqsiz', A]);
  check('cheklanmagan: suhbat kesish o\'zgarmaydi', await t.suhbatIdlarniKesish(HAMMASI, [B, A]), [B, A]);
  check('cheklanmagan: repo chaqirilmadi', chaqiruvlar, []);

  // Cheklangan: o'ziniki o'tadi, begona → 404.
  chaqiruvlar.length = 0;
  check('mijoz o\'ziniki', await xato(() => t.mijoz(CH, A)), 'otdi');
  check('mijoz begona', await xato(() => t.mijoz(CH, B)), '404:NOT_FOUND');
  check('suhbat o\'ziniki', await xato(() => t.suhbat(CH, A)), 'otdi');
  check('suhbat begona', await xato(() => t.suhbat(CH, B)), '404:NOT_FOUND');
  check('xabar o\'ziniki', await xato(() => t.xabar(CH, A)), 'otdi');
  check('xabar begona', await xato(() => t.xabar(CH, B)), '404:NOT_FOUND');
  check('shartnoma o\'ziniki', await xato(() => t.shartnoma(CH, A)), 'otdi');
  check('shartnoma begona', await xato(() => t.shartnoma(CH, B)), '404:NOT_FOUND');
  check('talabnoma o\'ziniki', await xato(() => t.talabnoma(CH, A)), 'otdi');
  check('talabnoma begona', await xato(() => t.talabnoma(CH, B)), '404:NOT_FOUND');
  check('repo chaqiruvlari', chaqiruvlar, [
    `mijoz:${A}`, `mijoz:${B}`, `suhbat:${A}`, `suhbat:${B}`, `xabar:${A}`, `xabar:${B}`,
    `shartnoma:${A}`, `shartnoma:${B}`, `talabnoma:${A}`, `talabnoma:${B}`,
  ]);

  // Shartnoma raqami — uuid emas, satr.
  const r = new QamrovTekshiruvchi(soxta(['K-1']));
  check('raqam o\'ziniki', await xato(() => r.shartnomaRaqami(CH, 'K-1')), 'otdi');
  check('raqam begona', await xato(() => r.shartnomaRaqami(CH, 'K-2')), '404:NOT_FOUND');
  chaqiruvlar.length = 0;
  check('raqam bo\'sh → 404, repo chaqirilmaydi', [await xato(() => r.shartnomaRaqami(CH, '  ')), chaqiruvlar], ['404:NOT_FOUND', []]);

  // Yaroqsiz uuid — cheklanganda 404, SQL'ga yetmaydi (::uuid xatosi bo'lmaydi).
  chaqiruvlar.length = 0;
  check('yaroqsiz uuid → 404', await xato(() => t.mijoz(CH, 'abc')), '404:NOT_FOUND');
  check('yaroqsiz uuid: repo chaqirilmadi', chaqiruvlar, []);

  // Kesish: faqat qamrovdagilar, kirish tartibi saqlanadi, yaroqsizlar tashlanadi.
  const k = new QamrovTekshiruvchi(soxta([A, C]));
  chaqiruvlar.length = 0;
  check('idlarniKesish tartib', await k.idlarniKesish(CH, [C, B, 'yaroqsiz', A]), [C, A]);
  check('kesish: yaroqsiz repoga bormaydi', chaqiruvlar, [`mijozlar:${C},${B},${A}`]);
  check('suhbatIdlarniKesish tartib', await k.suhbatIdlarniKesish(CH, [A, B, C]), [A, C]);
  chaqiruvlar.length = 0;
  check('kesish: takror saqlanadi', await k.idlarniKesish(CH, [A, A]), [A, A]);
  check('kesish: takror repoga bir marta', chaqiruvlar, [`mijozlar:${A}`]);
  chaqiruvlar.length = 0;
  check('bo\'sh ro\'yxat → repo chaqirilmaydi', [await k.idlarniKesish(CH, []), chaqiruvlar], [[], []]);
  check('katta harfli uuid ham qabul', await k.idlarniKesish(CH, [A.toUpperCase()]), [A.toUpperCase()]);
}

main()
  .catch((err) => {
    failed += 1;
    console.error(err);
  })
  .finally(() => {
    console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
    process.exitCode = failed ? 1 : 0;
  });
