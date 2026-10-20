import {
  ALOQA_KALITLARI,
  JAVOBSIZ_KUN,
  aloqaSharti,
} from '@/domain/entities/aloqaHolati';

/**
 * Qo'lda ishga tushiriladi: npm run test:aloqa-holati --workspace=server
 *
 * Bazaga chiqmaydi — funksiya SQL MATNINI qaytaradi, uni tekshiramiz.
 *
 * NEGA BU TEST KERAK: bu ikki shart operatorga "kimga qo'ng'iroq
 * qilish kerak" deb ko'rsatadi. Eng jimgina xato — `deleted_at IS NULL`
 * ni unutish: o'chirilgan suhbat qatorni ushlab qolardi va savatdagi
 * mijoz jonli ro'yxatda paydo bo'lardi. Ikkinchisi — chegarani
 * konstantadan emas, qo'lda yozib qo'yish: `JAVOBSIZ_KUN` o'zgarganda
 * shartlardan biri eski qiymatda qolib ketardi.
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

// ── 1. Kalitlar ro'yxati — zod sxemasi ham shundan quriladi ───────────
eq('kalitlar', [...ALOQA_KALITLARI], ['javobsiz', 'oqilmagan']);
// Har kalitning O'Z sharti bo'lishi shart. Yangi kalit qo'shilib, shart
// yozilmasa, `Record<AloqaHolati, string>` tufayli kod umuman
// kompilyatsiya bo'lmaydi — bu test esa shartlar ADASHMAGANINI
// tekshiradi: ikkalasi bir xil matn bo'lib qolsa filtr jimgina
// noto'g'ri ishlardi.
{
  const shartlar = ALOQA_KALITLARI.map((k) => aloqaSharti(k));
  eq('har kalitda shart bor', shartlar.every((x) => x.length > 0), true);
  eq('shartlar bir-biridan farq qiladi', new Set(shartlar).size, ALOQA_KALITLARI.length);
}

// ── 2. "Javob bermagan" sharti ────────────────────────────────────────
// MUHIM: suhbat bir nechta bo'lishi mumkin (har biri boshqa Telegram
// hisob uchun). Agar birorta suhbatda ham javob bo'lsa, butun mijoz
// "jim qolgan" emas — uni boshqa kanal orqali sinab ko'rish kerak.
{
  const s = aloqaSharti('javobsiz');
  eq('birorta suhbatda ham javob yo\'q', s.includes('NOT EXISTS'), true);
  eq('javob belgisi tekshiriladi', s.includes('cv.last_inbound_at IS NOT NULL'), true);
  // "Xabar ketgani tekshiriladi": chegara MIJOZ bo'yicha, ya'ni
  // "mijozga umuman xabar ketganmi" (IS NOT NULL) — pastdagi 5-blokda
  // aynan shu tekshiruv chegara bilan birga sinaladi.
  eq('mijozga xabar ketgani tekshiriladi', s.includes('cv.last_outbound_at IS NOT NULL'), true);
  // O'qilganlik bu shartga umuman aloqador emas: mijoz o'qimay turib
  // ham javob bermagan bo'ladi, o'qib ham.
  eq('read_at ishlatilmaydi', s.includes('read_at'), false);
}

// ── 3. "O'qigani tasdiqlanmagan" sharti ───────────────────────────────
// MUHIM: soft-deleted xabarlar hisobga olinmaydi.
{
  const s = aloqaSharti('oqilmagan');
  eq('bitta ham o\'qilgani yo\'q', s.includes('NOT EXISTS'), true);
  eq('chiquvchi xabar bo\'yicha', s.includes("m.direction = 'out'"), true);
  eq('o\'qilgan belgisi bo\'yicha', s.includes('m.read_at IS NOT NULL'), true);
  eq('mijozga xabar ketgani ham tekshiriladi', s.includes('cv.last_outbound_at IS NOT NULL'), true);
  eq('o\'chirilgan xabarlar hisobga olinmaydi', s.includes('m.deleted_at IS NULL'), true);
  // Javob bergan-bermagani bu yerda MUHIM EMAS: mijoz javob yozgan
  // bo'lsa ham "o'qildi" xabarnomasi kelmagan bo'lishi mumkin.
  eq('last_inbound_at ishlatilmaydi', s.includes('last_inbound_at'), false);
}

// ── 4. Ikkalasi ham savatni chetlab o'tadi ────────────────────────────
for (const key of ['javobsiz', 'oqilmagan'] as const) {
  eq(`${key}: o'chirilgan suhbat hisobga olinmaydi`, aloqaSharti(key).includes('cv.deleted_at IS NULL'), true);
}

// ── 5. Chegara konstantadan quriladi ──────────────────────────────────
for (const key of ['javobsiz', 'oqilmagan'] as const) {
  eq(
    `${key}: chegara JAVOBSIZ_KUN dan`,
    aloqaSharti(key).includes(`INTERVAL '${JAVOBSIZ_KUN} days'`),
    true,
  );
}
eq('sukut chegarasi — 3 kun', JAVOBSIZ_KUN, 3);

// ── 6. Ko'rikdan keyingi qo'shimcha tekshiruvlar ───────────────────────
//
// NEGA KERAK: 1-topilma "3 kunlik jimlik" ni bitta suhbat qatoridan
// MIJOZNING BUTUN suhbatlar to'plamiga ko'chirdi. Eski test bu holatni
// ushlay olmasdi — `NOT EXISTS` so'zi qolgani uchun eski (qator
// bo'yicha) shart ham, yangi (mijoz bo'yicha) shart ham bir xil o'tib
// ketardi. Quyidagi uchta tekshiruv aynan shu regressiyani ushlaydi:
//
//   • MIJOZ BO'YICHA EKANI: `cv.client_id = c.id` shartda BIR MARTADAN
//     KO'P uchraydi — agar kimdir shartni yana bitta qatorga qaytarib
//     qo'ysa (masalan bitta `EXISTS` ichiga hammasini yig'ib), bu son
//     kamayib qoladi.
//   • QAVS VA `AND`: 4-topilma qavsga o'rab qo'shadi
//     (`PgClientRepository.ts`), bu FAQAT shart yuqori darajada
//     `OR`siz va qavslari muvozanatli bo'lsagina xavfsiz. Bu yerda shu
//     ikkala shartni tekshiramiz — ular buzilsa, qavs endi
//     xato natija berishi mumkin bo'lib qoladi.
//   • YANGI CHEGARA SHAKLI: eski shart `last_outbound_at < …` bitta
//     qatorda tekshirilardi; yangisi `NOT EXISTS` ichida
//     `last_outbound_at >= …` bilan "hech bir suhbatda yaqinda xabar
//     ketmagan"ni tekshiradi. Eski shakl qaytib kelsa (masalan kimdir
//     "qulayroq" deb orqaga o'zgartirsa), bu yerda ushlanadi.
for (const key of ['javobsiz', 'oqilmagan'] as const) {
  const s = aloqaSharti(key);

  const clientIdCount = s.split('cv.client_id = c.id').length - 1;
  eq(`${key}: mijoz bo'yicha (cv.client_id = c.id bir martadan ko'p)`, clientIdCount > 1, true);

  const openParens = (s.match(/\(/g) ?? []).length;
  const closeParens = (s.match(/\)/g) ?? []).length;
  eq(`${key}: qavslar muvozanatli`, openParens === closeParens, true);
  eq(`${key}: yuqori darajada OR yo'q`, s.includes(' OR '), false);

  eq(`${key}: yaqindagi xabar NOT EXISTS ichida >= bilan tekshiriladi`, s.includes('cv.last_outbound_at >='), true);
  eq(
    `${key}: eski (qator bo'yicha) shakl qolmagan`,
    s.includes(`cv.last_outbound_at < now() - INTERVAL '${JAVOBSIZ_KUN} days'`),
    false,
  );
}

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
