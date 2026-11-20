import { defaultRulesText } from '@/infrastructure/ai/prompt/defaultRulesText';
import { STANDART_BOLIMLAR, STANDART_MISOL_BOLIMLARI } from '@/infrastructure/ai/prompt/knowledgeBase';
import { CLIENT_TYPES_LIST } from '@/domain/entities/AgentMemory';

/**
 * Qo'lda ishga tushiriladi: npm run test:sotuv-qoidalari --workspace=server
 *
 * Standart qoidalar — sotuv qoidalari. Debitordan faqat uslub olingan:
 * qarzga oid so'z, misol yoki raqam qaytib kelmasligi kerak. Kurs faktlari
 * (narx, sana, nom) qoidalarda yozilmaydi — ular kontekstdan keladi.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  (kutilgan: ${String(expected)}, keldi: ${String(actual)})`}`);
};

const t = defaultRulesText();
const past = t.toLowerCase();

// ─── Brief: qarz so'zlari, e'tirozlar, karta raqami ──────────────────────
for (const soz of ['qarz', 'kechik', 'undir', 'shartnoma', 'talabnoma', "va'da"]) {
  check(`"${soz}" yo'q`, past.includes(soz), false);
}
check('etirozlar bo\'limi', t.includes('## ') && /qimmat/i.test(t), true);
check('karta raqami misoli yo\'q', /\d{4} ?\d{4} ?\d{4} ?\d{4}/.test(t), false);

// ─── Debitorga oid boshqa izlar ──────────────────────────────────────────
for (const soz of ['xon saroy', 'xonsaroy', 'debitor', 'investor', 'eskrou', 'kvartira', 'xonadon', 'crm', 'paymentclaim']) {
  check(`"${soz}" yo'q`, past.includes(soz), false);
}
// Kurs narxi qoidaga yozilmaydi: "1 500 000 so'm" kabi raqam bo'lmasin.
check('aniq summa yo\'q', /\d[\d ]{2,}\s*so'm/i.test(t), false);
// Sana ham: "15-noyabr", "12.11" kabi.
check('aniq sana yo\'q', /\d{1,2}-(yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentyabr|oktyabr|noyabr|dekabr)/i.test(t), false);

// ─── Bo'limlar ro'yxati (brief jadvali) ──────────────────────────────────
const KERAKLI_BULLETS = [
  'real_team_style', 'human_tone', 'style', 'anti_repetition', 'channel_rules', 'media', 'stop_signals',
  'salomlashish', 'ehtiyojni_aniqlash', 'kursni_taqdim_etish', 'murojaat_va_sotish', 'narx_va_tolov', 'yopish', 'chek',
  'prohibitions', 'first_messages', 'client_types',
];
const KERAKLI_MISOLLAR = ['etirozlar', 'dialog_misollari', 'tone_examples'];
const YANGI = new Set([
  'salomlashish', 'ehtiyojni_aniqlash', 'kursni_taqdim_etish', 'murojaat_va_sotish', 'narx_va_tolov', 'yopish', 'chek',
  'first_messages', 'etirozlar', 'dialog_misollari',
]);

const bullets = new Map(STANDART_BOLIMLAR.map((s) => [s.key, s]));
const misollar = new Map(STANDART_MISOL_BOLIMLARI.map((s) => [s.key, s]));

for (const key of KERAKLI_BULLETS) {
  const s = bullets.get(key);
  check(`bo'lim ${key} bor (bullets)`, Boolean(s), true);
  if (s && YANGI.has(key)) check(`${key}: kamida 5 qoida`, s.items.length >= 5, true);
}
for (const key of KERAKLI_MISOLLAR) {
  const s = misollar.get(key);
  check(`bo'lim ${key} bor (examples)`, Boolean(s), true);
  if (s && YANGI.has(key)) check(`${key}: kamida 4 misol`, s.items.length >= 4, true);
}
check('jami bo\'limlar soni', STANDART_BOLIMLAR.length + STANDART_MISOL_BOLIMLARI.length, KERAKLI_BULLETS.length + KERAKLI_MISOLLAR.length);

const kalitlar = [...STANDART_BOLIMLAR, ...STANDART_MISOL_BOLIMLARI].map((s) => s.key);
check('kalitlar takrorlanmaydi', new Set(kalitlar).size, kalitlar.length);

// Eski qarz bo'limlari qaytmasin.
for (const eski of ['kechikish_ssenariylari', 'contract_facts', 'investor_procedures', 'payment_tools', 'promise_acceptance', 'hostile_replies']) {
  check(`eski bo'lim ${eski} yo'q`, kalitlar.includes(eski), false);
}

// Har bo'lim defaultRulesText ga tushadi (prompt ko'rinishidagidek sarlavha bilan).
for (const s of [...STANDART_BOLIMLAR, ...STANDART_MISOL_BOLIMLARI]) {
  check(`matnda "## ${s.title.toUpperCase()}"`, t.includes(`## ${s.title.toUpperCase()}`), true);
}

// ─── E'tirozlar ──────────────────────────────────────────────────────────
const etirozMatni = (misollar.get('etirozlar')?.items ?? []).map((e) => e.situation.toLowerCase()).join('\n');
for (const e of ['qimmat', "o'ylab ko'raman", "vaqtim yo'q", 'foydasi bo\'ladimi', 'keyinroq', 'boshqa joyda arzon']) {
  check(`e'tiroz: "${e}"`, etirozMatni.includes(e), true);
}

// ─── Misollarning to'liqligi va xavfsizligi ──────────────────────────────
for (const s of STANDART_MISOL_BOLIMLARI) {
  const toliq = s.items.every((e) => e.situation.trim() && e.bad.trim() && e.good.trim() && e.why.trim());
  check(`${s.key}: har misolda 4 maydon`, toliq, true);
  // ✓ YAXSHI matni hech qachon to'lovni o'zi tasdiqlamaydi.
  const tasdiq = s.items.some((e) => /qabul qilindi|to'lovingiz tushdi|to'lov tushdi/i.test(e.good));
  check(`${s.key}: YAXSHI da "to'lov qabul qilindi" yo'q`, tasdiq, false);
}

// ─── Chek ko'rib chiqilayotganda havola va'da qilinmaydi (RECEIPT_REVIEW_RULE) ──
const chekMisollari = STANDART_MISOL_BOLIMLARI.flatMap((s) => s.items).filter((e) => /chek/i.test(e.situation));
check('chek misollari bor', chekMisollari.length > 0, true);
check('chek misolida YAXSHI da "havola" yo\'q', chekMisollari.some((e) => /havola/i.test(e.good)), false);
check('CHEK bo\'limida "havola" yo\'q', (bullets.get('chek')?.items ?? []).some((i) => /havola/i.test(i)), false);

// ─── Shartli misollar shartni vaziyatda aytadi ───────────────────────────
const etirozlar = misollar.get('etirozlar')?.items ?? [];
const pulim = etirozlar.filter((e) => /pulim yo'q/i.test(e.situation));
check('"pulim yo\'q": bo\'lib to\'lash bor/yo\'q — ikkala misol', pulim.length, 2);
check('"pulim yo\'q": shart vaziyatda', pulim.every((e) => e.situation.includes("Bo'lib to'lash:")), true);
const vaqtim = etirozlar.find((e) => /vaqtim yo'q/i.test(e.situation));
check('"vaqtim yo\'q": davomiylik sharti vaziyatda', Boolean(vaqtim?.situation.includes('Davomiylik')), true);

// ─── Qayg'u / kasallik — shu navbatda sotilmaydi ─────────────────────────
check('stop_signals: qayg\'uda hamdardlik', (bullets.get('stop_signals')?.items ?? []).some((i) => /hamdardlik/i.test(i) && /kasallik/i.test(i)), true);

// ─── Qat'iy taqiqlar promptdagi qoidalar bilan mos ───────────────────────
check('chekdan keyin "tekshirib chiqamiz"', past.includes('tekshirib chiqamiz'), true);
check('karta raqamini tizim yuboradi (sendCard)', t.includes('sendCard'), true);

// ─── Mijoz turlari ───────────────────────────────────────────────────────
const turlar = (bullets.get('client_types')?.items ?? []).join('\n');
for (const tur of CLIENT_TYPES_LIST) check(`client_types: ${tur}`, turlar.includes(tur), true);
check('mijoz turlari ro\'yxati', CLIENT_TYPES_LIST.join(','), 'tez_qaror,oylaydigan,narxga_sezgir,shubhali');

console.log(failed ? `\n${failed} ta tekshiruv yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
