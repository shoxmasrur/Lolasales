import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bitishSanasi, mapOrderShow } from '@/infrastructure/contracts/contractMapper';
import { computeDebt } from '@/domain/services/contractDebt';

/**
 * Qo'lda ishga tushiriladi: npm run test:contract-mapper --workspace=server
 *
 * Fixture — real `order/show` javobi, shaxsiy ma'lumotlari almashtirilgan.
 * API javob shaklini o'zgartirsa test shu yerda yiqiladi va noto'g'ri
 * raqam bazaga tushmaydi.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(path.join(here, '__fixtures__/orderShow.json'), 'utf8'));

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${name}` +
      (ok ? '' : ` → ${JSON.stringify(actual)} (kutilgan: ${JSON.stringify(expected)})`),
  );
};

const c = mapOrderShow(raw);
if (!c) {
  console.log('✗ mapper null qaytardi');
  process.exit(1);
}

check('orderId', c.orderId, 37719);
check('contractNo', c.contractNo, '5582MSO25F3');
check('mijoz ismi lotin harflarda', c.clientName, "Testov Testoy Test o'g'li");
// Ism ALOHIDA ham uzatiladi: to'liq satrdan qaytadan ajratish taxminga
// aylanadi va "Familiya Ism Ota o'g'li" da familiyani ism deb olardi.
check('mijozning aniq ismi', c.clientFirstName, 'Testoy');
check('telefonlar E.164 ga keltirildi', c.phones, ['+998901112233', '+998934445566']);
check('obyekt nomi blok orqali topildi', c.objectName, 'MUHABBAT SHAHRI');
// Talabnoma uchun: obyekt manzili va rekvizitni tanlash kaliti (INN)
// o'sha obyekt tugunidan olinadi.
check(
  'obyekt manzili blok orqali topildi',
  c.objectAddress,
  'Тошкент шаҳар,Яшнобод тумани, “Амир Темур” МФЙ, Паркент кўчаси, №327 b',
);
check('kompaniya INN obyekt rekvizitidan', c.companyInn, '311053474');
{
  const nusxa = JSON.parse(JSON.stringify(raw));
  const obj = nusxa.data.order_apartments[0].apartment.block.building.object;
  delete obj.address;
  delete obj.company_details;
  const m = mapOrderShow(nusxa);
  check("manzil yo'q — null", m?.objectAddress, null);
  check("INN yo'q — null", m?.companyInn, null);
}
check('uy raqami', c.apartment?.number, '14Б-38');
check('qavat', c.apartment?.floor, 6);
check('xonalar soni', c.apartment?.rooms, 2);
check('blok nomi', c.apartment?.block, 'Блок 14');
check('maydon', c.apartment?.area, 54.9);

// ─── Bitish muddati: xonadon → blok → bino → obyekt ─────────────────────
// Fixture'da xonadonniki to'la (2029-12-31), binoniki null, obyektniki
// 2028-03-31 — ya'ni birinchi pog'ona ustun turishi shu yerda ko'rinadi.
check('bitish muddati xonadondan olindi', c.completionDate, '2029-12-31');
const pogona = (apartment: Record<string, unknown>): string | null => bitishSanasi({ apartment });
check(
  "xonadonda yo'q — blokdan",
  pogona({
    completion_date: null,
    block: { completion_date: '2028-06-30', building: { completion_date: '2028-09-30', object: { build_date: '2028-03-31' } } },
  }),
  '2028-06-30',
);
check(
  "blokda ham yo'q — binodan",
  pogona({ completion_date: null, block: { building: { completion_date: '2028-09-30', object: { build_date: '2028-03-31' } } } }),
  '2028-09-30',
);
check(
  'faqat obyektda — build_date olinadi',
  pogona({ block: { building: { completion_date: null, object: { build_date: '2028-03-31' } } } }),
  '2028-03-31',
);
check("hech qayerda yo'q — null", pogona({ block: { building: { object: {} } } }), null);
check('vaqtli satr kunga qisqaradi', pogona({ completion_date: '2029-12-31 00:00:00' }), '2029-12-31');
check("order_apartments yo'q — null", bitishSanasi(undefined), null);
check('holat', c.status, 'sold');
check('oylar soni', c.months, 49);
check('shartnoma narxi', c.transactionPrice, 833876100);
check("boshlang'ich to'lov", c.initialPayment, 100065132);
check("oylik to'lov grafikdan olindi", c.monthlyPayment, 8339000);
check("to'langan jami grafikdan hisoblandi", c.totalPaid, 149421132);
check('umumiy qoldiq (ichki maydon)', c.remainingTotal, 684454968);
check('grafik uzunligi', c.schedule.length, 50);
check("to'lov tarixi uzunligi", c.history.length, 8);

const first = c.schedule[0];
const firstEvent = c.history[0];
if (!first || !firstEvent) {
  console.log("✗ grafik yoki to'lov tarixi bo'sh");
  process.exit(1);
}

check('birinchi qator turi', first.type, 'initial_payment');
check('sana YYYY-MM-DD ga qisqartirildi', first.datePayment, '2025-11-17');
check("to'langan sana", first.datePaid, '2025-11-28');
check('tarix sanasi', firstEvent.datePaid, '2025-11-16');
check("tarix to'lov turi", firstEvent.paymentType, 'transfer');
// Hodisa AYNAN shu maydon bo'yicha farqlanadi (`tolovKaliti`). API uni
// bermay qo'ysa yoki nomini o'zgartirsa, bir to'lov ikki marta bazaga
// tushishi mumkin — shuning uchun alohida tekshiriladi.
check('barqaror kalit — uuid', firstEvent.uuid, 'b79ff57f-f7ca-415c-9aa7-bf6ef36bef16');
check('external_id faqat havola sifatida saqlanadi', firstEvent.externalId, 'test-182612');

// Fixture'da uch qator kechikkan: 2026-05-25 (qisman, 678 000 qoldi),
// 2026-06-25 va 2026-07-25 (butunlay to'lanmagan).
//
// MUHIM: API'ning `total_debt` i 684 454 968, ya'ni haqiqiy kechikkan
// summadan ~39 baravar katta. Ikkalasini adashtirish mijozga bir necha
// baravar oshirilgan raqam aytilishiga olib kelardi.
//
// Ularning har bir qatordagi `is_expired` bayrog'i esa uchalasida ham
// `false` — bu maydonga tayanib bo'lmaydi, shuning uchun kechikish
// sanani solishtirib aniqlanadi.
const debt = computeDebt(c.schedule, '2026-08-06');
check('kechikkan jami', debt.overdueTotal, 17_356_000);
check('kechikkan oylik qismi', debt.overdueMonthly, 17_356_000);
check("kechikkan boshlang'ich qismi", debt.overdueFirst, 0);
check('kechikish kuni', debt.daysOverdue, 73);
check('qoldirilgan oylar', debt.missedMonths, 3);
check("keyingi to'lov sanasi", debt.nextPaymentDate, '2026-08-25');
check('umumiy qoldiqdan farq qiladi', debt.overdueTotal !== c.remainingTotal, true);

// Hisoblagichlar uchun to'lov (2370ORZ26KE da uchragan): oylik emas.
// Notanish tur esa avvalgidek `other` bo'lib qoladi.
{
  const d = raw.data ?? raw;
  const namuna = d.payments[0];
  const qoshimcha = (id: number, type: string) => ({
    ...namuna, id, type, amount: 3_870_000, amount_paid: 0, status: 'waiting',
    date_payment: '2026-06-01 00:00:00', date_paid: null,
  });
  const yangi = { ...d, payments: [...d.payments, qoshimcha(900001, 'for_electrocity'), qoshimcha(900002, 'notanish_tur')] };
  const m = mapOrderShow(raw.data ? { ...raw, data: yangi } : yangi);
  check('for_electrocity → meter', m?.schedule.find((p) => p.externalId === 900001)?.type, 'meter');
  check('notanish tur → other', m?.schedule.find((p) => p.externalId === 900002)?.type, 'other');
  check('hisoblagich oylik to\'lov summasini o\'zgartirmaydi', m?.monthlyPayment, c.monthlyPayment);
  const q = computeDebt(m?.schedule ?? [], '2026-08-06');
  check('hisoblagich alohida sanaladi', q.overdueMeter, 3_870_000);
  // `other` qatori avvalgidek oylikka qo'shiladi: 17 356 000 + 3 870 000.
  check('oylik kechikishga hisoblagich qo\'shilmadi', q.overdueMonthly, 17_356_000 + 3_870_000);
}

check("noto'g'ri kirishda null", mapOrderShow({ data: null }), null);
check("bo'sh obyektda null", mapOrderShow({}), null);
check('shartnoma raqamisiz null', mapOrderShow({ data: { id: 1 } }), null);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
