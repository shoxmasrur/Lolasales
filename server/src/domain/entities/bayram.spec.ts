import { bayramKuni, ishKunimi, ishKuniga, type Bayram } from '@/domain/entities/bayram';

/**
 * Qo'lda ishga tushiriladi: npm run test:bayram --workspace=server
 *
 * Bazaga chiqmaydi — ro'yxat qo'lda yasaladi.
 *
 * NEGA BU TEST KERAK: bu modul "bugun to'lov qabul qilinadimi?" degan
 * savolga javob beradi va uch joyda ishlatiladi. Xatosi jimgina bo'ladi:
 * bayramda mijozga xabar ketadi yoki va'da noo'rin "buzildi" bo'lib
 * belgilanadi — ikkalasi ham mijoz bilan munosabatni buzadi, lekin hech
 * qayerda xato ko'rinmaydi.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const k = JSON.stringify(kutilgan);
  if (a === k) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${k})`);
  }
}

const ISH_KUNLARI = [1, 2, 3, 4, 5, 6];

function b(over: Partial<Bayram> = {}): Bayram {
  return {
    id: 'h1',
    name: 'Mustaqillik bayrami',
    startsOn: '2026-08-28',
    endsOn: '2026-09-02',
    yillik: false,
    ...over,
  };
}

// ── 1. Bir kunlik bayram ──────────────────────────────────────────────
{
  const navruz = [b({ id: 'h2', name: 'Navro\'z', startsOn: '2026-03-21', endsOn: '2026-03-21' })];
  eq('o\'sha kun topildi', bayramKuni('2026-03-21', navruz)?.name, 'Navro\'z');
  eq('bir kun oldin yo\'q', bayramKuni('2026-03-20', navruz), null);
  eq('bir kun keyin yo\'q', bayramKuni('2026-03-22', navruz), null);
}

// ── 2. Oraliq: chegaralar ham ichkarida ───────────────────────────────
{
  const list = [b()];
  eq('boshi', bayramKuni('2026-08-28', list)?.id, 'h1');
  eq('o\'rtasi', bayramKuni('2026-08-31', list)?.id, 'h1');
  eq('oxiri', bayramKuni('2026-09-02', list)?.id, 'h1');
  eq('oldingi kun', bayramKuni('2026-08-27', list), null);
  eq('keyingi kun', bayramKuni('2026-09-03', list), null);
}

// ── 3. yillik = true — yil e'tiborga olinmaydi ────────────────────────
{
  const navruz = [b({ name: 'Navro\'z', startsOn: '2026-03-21', endsOn: '2026-03-21', yillik: true })];
  eq('boshqa yilda ham topiladi', bayramKuni('2031-03-21', navruz)?.name, 'Navro\'z');
  eq('o\'tgan yilda ham', bayramKuni('2019-03-21', navruz)?.name, 'Navro\'z');
  eq('boshqa kunda yo\'q', bayramKuni('2031-03-22', navruz), null);
}

// ── 4. yillik = false — faqat o'sha yil ───────────────────────────────
{
  const list = [b({ startsOn: '2026-03-21', endsOn: '2026-03-21', yillik: false })];
  eq('o\'sha yil topildi', bayramKuni('2026-03-21', list)?.id, 'h1');
  eq('boshqa yil TOPILMAYDI', bayramKuni('2031-03-21', list), null);
}

// ── 5. yillik oraliq — boshqa yilda ham butun oraliq ──────────────────
{
  const list = [b({ startsOn: '2026-01-01', endsOn: '2026-01-03', yillik: true })];
  eq('boshqa yil oraliq ichi', bayramKuni('2030-01-02', list)?.id, 'h1');
  eq('boshqa yil oraliqdan tashqari', bayramKuni('2030-01-04', list), null);
}

// ── 6. ishKunimi ──────────────────────────────────────────────────────
{
  const list = [b()];
  // 2026-09-06 — yakshanba
  eq('yakshanba ish kuni emas', ishKunimi('2026-09-06', [], ISH_KUNLARI), false);
  eq('bayram ish kuni emas', ishKunimi('2026-08-31', list, ISH_KUNLARI), false);
  // 2026-09-09 — chorshanba
  eq('oddiy chorshanba — ish kuni', ishKunimi('2026-09-09', list, ISH_KUNLARI), true);
  eq('yakshanba ham ish kuni bo\'lishi mumkin', ishKunimi('2026-09-06', [], [1, 2, 3, 4, 5, 6, 7]), true);
  // Bo'sh `weekdays` — `evaluateWindow` bilan bir xil sukutga (1-6)
  // tushishi kerak, aks holda ikki modul bir sozlamani ikki xil o'qiydi.
  eq('bo\'sh weekdays — chorshanba baribir ish kuni', ishKunimi('2026-09-09', [], []), true);
  eq('bo\'sh weekdays — yakshanba baribir dam olish kuni', ishKunimi('2026-09-06', [], []), false);
}

// ── 7. ishKuniga ──────────────────────────────────────────────────────
{
  const list = [b()];
  eq('ish kunida o\'zini qaytaradi', ishKuniga('2026-09-09', list, ISH_KUNLARI), '2026-09-09');
  // Bayram 28-avgust – 2-sentabr; 3-sentabr payshanba.
  eq('bayram boshida — bayramdan keyin', ishKuniga('2026-08-28', list, ISH_KUNLARI), '2026-09-03');
  eq('bayram oxirida — ertasi kun', ishKuniga('2026-09-02', list, ISH_KUNLARI), '2026-09-03');
  // 2026-09-05 shanba (ish kuni), 2026-09-06 yakshanba → 7-sentabr dushanba.
  eq('yakshanbadan dushanbaga', ishKuniga('2026-09-06', [], ISH_KUNLARI), '2026-09-07');
}

// ── 8. Bayram yakshanbaga tutashsa — ikkalasidan ham o'tadi ───────────
{
  // 2026-09-04 juma, 05 shanba, 06 yakshanba, 07 dushanba.
  const juma = [b({ startsOn: '2026-09-04', endsOn: '2026-09-05' })];
  eq('bayram + yakshanba', ishKuniga('2026-09-04', juma, ISH_KUNLARI), '2026-09-07');
}

// ── 9. Cheksiz aylanish himoyasi ──────────────────────────────────────
{
  // Bo'sh `weekdays` endi 1-6 sukutiga tushadi (yuqoridagi 6-blok), ya'ni
  // shu holat endi hech qachon xato tashlamaydi. 60 kunlik chegarani
  // ishga tushirish uchun butun qidiruv oynasini qamrab oladigan yillik
  // bayram beriladi — shunda HECH bir kun ish kuni bo'la olmaydi.
  const butunYilBayram = [b({ startsOn: '2026-01-01', endsOn: '2026-12-31', yillik: true })];
  let xato = '';
  try {
    ishKuniga('2026-09-09', butunYilBayram, ISH_KUNLARI);
  } catch (err) {
    xato = err instanceof Error ? err.message : String(err);
  }
  eq('butun yil bayram bo\'lsa xato', xato.includes('ish kuni topilmadi'), true);
}

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
