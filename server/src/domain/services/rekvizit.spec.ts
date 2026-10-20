import xom from '@/infrastructure/contracts/__fixtures__/companies.json';
import { crmKompaniyalari, rekvizitTanla, type CrmKompaniya } from '@/domain/services/rekvizit';

/**
 * Qo'lda: npm run test:rekvizit --workspace=server
 *
 * Sof test («Birlik»): faqat JSON fixture va sof modul — `shared/config` yo'q.
 * NEGA: talabnomadagi hisob raqami noto'g'ri tanlansa, mijoz pulni boshqa
 * kompaniya hisobiga o'tkazadi. Shubhali holatda tanlamaslik — xavfsiz yo'l.
 */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const k: CrmKompaniya[] = crmKompaniyalari(xom);
const nusxa = (): CrmKompaniya[] => JSON.parse(JSON.stringify(k)) as CrmKompaniya[];

// Fixture'dagi VATAN RESIDENCE: 4 faol hisob, ulardan faqat bittasi asosiy.
const vatan = k.find((x) => x.id === 4)!;
const EXPECTED_VATAN = vatan.hisoblar.find((h) => h.faol && h.asosiy)!.hisob;

const kAsosiysiz = nusxa();
for (const h of kAsosiysiz.find((x) => x.id === 4)!.hisoblar) h.asosiy = false;

const kOkedsiz = nusxa();
kOkedsiz.find((x) => x.id === 11)!.oked = '';

// ── Xaritalash ─────────────────────────────────────────────────────────
check('5 ta kompaniya xaritalandi', k.length, 5);
check('VATAN xaritasi', { ...vatan, hisoblar: vatan.hisoblar.length }, {
  id: 4, nomi: 'VATAN RESIDENCE', turi: 'МЧЖ', inn: '308622786', oked: '41201', obyektlarSoni: 2, hisoblar: 5,
});
check('bank nomi chetdagi bo\'shliqsiz', k.find((x) => x.id === 17)!.hisoblar[0]!.bank, 'Ипак йули АИТ банки М.Улугбек филиали');
check('APELSIN inn null', k.find((x) => x.id === 6)!.inn, null);
// Javob shakli o'zgarsa jim "topilmadi" emas, xato bo'lishi kerak.
let otdi = false;
try { crmKompaniyalari({ data: [] }); } catch { otdi = true; }
check('ro\'yxat bo\'lmasa — xato', otdi, true);

// ── Tanlash ────────────────────────────────────────────────────────────
check('BARAKAT HOUSE', rekvizitTanla(k, '311053474'), {
  ok: true,
  rekvizit: {
    kompaniya: 'BARAKAT HOUSE', turi: 'МЧЖ', inn: '311053474', oked: '41201',
    hisob: '20208000705742909002', mfo: '01158',
    bank: 'Тошкент шаҳар, "КАПИТАЛБАНК" АТ БАНКИНИНГ АМАЛИЁТ БОШКАРМАСИ',
  },
});
check('inn yo\'q', rekvizitTanla(k, null).ok, false);
check('inn bo\'sh satr', rekvizitTanla(k, '  ').ok, false);
check('topilmadi', rekvizitTanla(k, '999').ok, false);
check('INN takrori — obyektlisi olinadi', (rekvizitTanla(k, '311776397') as any).rekvizit.hisob, '20208000507178159001');
check('ko\'p faol, asosiysi bitta → asosiysi', (rekvizitTanla(k, '308622786') as any).rekvizit?.hisob ?? null, EXPECTED_VATAN);
check('EXPECTED_VATAN — prod qiymati', EXPECTED_VATAN, '20208000205409155001');
check('ko\'p faol, asosiysi yo\'q → noaniq', rekvizitTanla(kAsosiysiz, '308622786'), {
  ok: false, sabab: 'VATAN RESIDENCE: 4 ta faol hisob, asosiysi aniq emas',
});
check('oked bo\'sh → to\'liq emas', rekvizitTanla(kOkedsiz, '311053474'), {
  ok: false, sabab: "BARAKAT HOUSE: rekvizit to'liq emas (oked)",
});

// INN takrori, ikkalasida ham obyekt bor → qaysi biri ekanini taxmin qilmaymiz.
const kIkkiObyektli = nusxa();
kIkkiObyektli.find((x) => x.id === 50)!.obyektlarSoni = 3;
check('INN takrori, ikkisi ham obyektli → noaniq', rekvizitTanla(kIkkiObyektli, '311776397'), {
  ok: false, sabab: 'XONSAROY TOWER BUILD: bir nechta kompaniya yozuvi, aniq emas',
});

// Faol hisob umuman yo'q.
const kFaolsiz = nusxa();
for (const h of kFaolsiz.find((x) => x.id === 11)!.hisoblar) h.faol = false;
check('faol hisob yo\'q → to\'liq emas', rekvizitTanla(kFaolsiz, '311053474'), {
  ok: false, sabab: "BARAKAT HOUSE: rekvizit to'liq emas (hisob)",
});

// Faol bitta, lekin MFO bo'sh.
const kMfosiz = nusxa();
kMfosiz.find((x) => x.id === 11)!.hisoblar.find((h) => h.faol)!.mfo = '';
check('mfo bo\'sh → to\'liq emas', rekvizitTanla(kMfosiz, '311053474'), {
  ok: false, sabab: "BARAKAT HOUSE: rekvizit to'liq emas (mfo)",
});

// Format: bo'sh bo'lmasa ham, buzuq qiymat hujjatga tushmasligi kerak.
const kHisobBuzuq = nusxa();
kHisobBuzuq.find((x) => x.id === 11)!.hisoblar.find((h) => h.faol)!.hisob = '2020800070574290900';
check('hisob 19 xona → to\'liq emas', rekvizitTanla(kHisobBuzuq, '311053474'), {
  ok: false, sabab: "BARAKAT HOUSE: rekvizit to'liq emas (hisob)",
});
const kMfoBuzuq = nusxa();
kMfoBuzuq.find((x) => x.id === 11)!.hisoblar.find((h) => h.faol)!.mfo = '1158';
check('mfo 4 xona → to\'liq emas', rekvizitTanla(kMfoBuzuq, '311053474'), {
  ok: false, sabab: "BARAKAT HOUSE: rekvizit to'liq emas (mfo)",
});
const kOkedBuzuq = nusxa();
kOkedBuzuq.find((x) => x.id === 11)!.oked = '4120A';
check('oked harfli → to\'liq emas', rekvizitTanla(kOkedBuzuq, '311053474'), {
  ok: false, sabab: "BARAKAT HOUSE: rekvizit to'liq emas (oked)",
});
const kInnBuzuq = nusxa();
kInnBuzuq.find((x) => x.id === 11)!.inn = '31105347';
check('inn 8 xona → to\'liq emas', rekvizitTanla(kInnBuzuq, '31105347'), {
  ok: false, sabab: "BARAKAT HOUSE: rekvizit to'liq emas (inn)",
});

if (failed > 0) {
  console.log(`\n${failed} ta sinov yiqildi`);
  process.exit(1);
}
console.log("\nHammasi o'tdi");
