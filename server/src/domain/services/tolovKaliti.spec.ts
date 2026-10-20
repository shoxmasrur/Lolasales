import { tolovKaliti, yetimKalitlar, type TolovKaliti } from '@/domain/services/tolovKaliti';

/**
 * Qo'lda: npm run test:tolov-kaliti --workspace=server
 *
 * MUAMMO (19-avgust, produksiya): Saydullayev Xayitboy aka bitta
 * 5 091 000 so'mlik to'lov uchun IKKI marta rahmat oldi va uning
 * 823 710 so'mlik qoldig'i "yopilgan" deb hisoblandi. Ertasi kuni u
 * "bugun tulayman" deganda agent uni to'xtatdi.
 *
 * SABAB: to'lov hodisasi `external_id` bo'yicha farqlanardi, u esa
 * BARQAROR EMAS. To'lov birinchi ko'ringanda `external_id` — xonpay
 * tranzaksiya kaliti (`8569a71b-…`), bank ko'chirmasi kelgach o'sha
 * yozuvning `external_id` si bank kalitiga almashadi
 * (`6472625597_34430_18.08.2026_…`). Kalit o'zgargani uchun
 * `ON CONFLICT` ishlamay, o'sha pul ikkinchi qator bo'lib qo'shilgan.
 *
 * CRM javobida yozuvning O'Z `uuid` si bor va u o'zgarmaydi — 8 ta
 * shartnomaning 444 ta to'lov yozuvi tekshirildi: `uuid` siz yoki
 * takrorlangan `uuid` bitta ham yo'q. Kalit shundan olinadi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${izoh}`}`);
};

/** Saydullayev akaning to'lovi — real qiymatlar. */
const BIRINCHI_KUN: TolovKaliti = {
  uuid: '674ea4ad-6e0b-42b8-9492-988e5ac9e863',
  externalId: '8569a71b-f685-4c4a-be3f-b714202427e6',
};
const IKKINCHI_KUN: TolovKaliti = {
  uuid: '674ea4ad-6e0b-42b8-9492-988e5ac9e863',
  externalId: '6472625597_34430_18.08.2026_20208000305742909002_22696000905500044001_509100000_-',
};

// ─── Kalitning o'zi ────────────────────────────────────────────────────

check(
  "bir kun o'tib external_id almashsa ham kalit o'zgarmaydi",
  tolovKaliti(BIRINCHI_KUN) === tolovKaliti(IKKINCHI_KUN),
  `${tolovKaliti(BIRINCHI_KUN)} ≠ ${tolovKaliti(IKKINCHI_KUN)}`,
);

check(
  "kalit — yozuvning o'z uuid'i",
  tolovKaliti(IKKINCHI_KUN) === '674ea4ad-6e0b-42b8-9492-988e5ac9e863',
  String(tolovKaliti(IKKINCHI_KUN)),
);

// `uuid` bo'lmagan javob hali uchramadi, lekin kalitsiz qolgandan ko'ra
// eski xatti-harakat yaxshi: hech bo'lmasa yozuv bazaga tushadi.
check(
  "uuid bo'lmasa external_id ga qaytiladi",
  tolovKaliti({ uuid: null, externalId: 'bank-1' }) === 'bank-1',
  String(tolovKaliti({ uuid: null, externalId: 'bank-1' })),
);

check(
  "ikkalasi ham yo'q — kalit yo'q, yozuv o'tkazib yuboriladi",
  tolovKaliti({ uuid: null, externalId: null }) === null,
  String(tolovKaliti({ uuid: null, externalId: null })),
);

check(
  "bo'sh satr kalit sifatida qabul qilinmaydi",
  tolovKaliti({ uuid: '', externalId: '  ' }) === null,
  String(tolovKaliti({ uuid: '', externalId: '  ' })),
);

// ─── Yetim qatorlar ────────────────────────────────────────────────────
//
// Kalit `uuid` ga ko'chgach ham bazada eski `external_id` bo'yicha
// yozilgan qatorlar qoladi. Ular CRM ro'yxatida yo'q — o'chirilishi
// kerak, aks holda pul ikki marta sanalaveradi.

check(
  "CRM'da yo'q qator yetim deb topiladi",
  yetimKalitlar(
    ['8569a71b-f685-4c4a-be3f-b714202427e6', '674ea4ad-6e0b-42b8-9492-988e5ac9e863'],
    ['674ea4ad-6e0b-42b8-9492-988e5ac9e863'],
  ).join(',') === '8569a71b-f685-4c4a-be3f-b714202427e6',
  yetimKalitlar(
    ['8569a71b-f685-4c4a-be3f-b714202427e6', '674ea4ad-6e0b-42b8-9492-988e5ac9e863'],
    ['674ea4ad-6e0b-42b8-9492-988e5ac9e863'],
  ).join(','),
);

check(
  "hammasi joyida bo'lsa hech narsa o'chirilmaydi",
  yetimKalitlar(['a', 'b'], ['b', 'a']).length === 0,
  yetimKalitlar(['a', 'b'], ['b', 'a']).join(','),
);

// HIMOYA: API javobida `payment_histories` umuman kelmasa `mapHistory`
// bo'sh ro'yxat qaytaradi. O'sha payt "hammasi yetim" deb butun to'lov
// tarixini o'chirib yuborish — bir shartnomani emas, hamma shartnomani
// buzadigan xato. Bo'sh ro'yxat "o'chirishga asos" emas.
check(
  "kelgan ro'yxat bo'sh bo'lsa tarix saqlanadi",
  yetimKalitlar(['a', 'b'], []).length === 0,
  yetimKalitlar(['a', 'b'], []).join(','),
);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
