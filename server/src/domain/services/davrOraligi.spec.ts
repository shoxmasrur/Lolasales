import { presetRange, type PresetKey } from '@/domain/services/davrOraligi';

/**
 * Qo'lda ishga tushiriladi: npm run test:davr-oraligi --workspace=server
 *
 * Oraliqlar interfeysda tanlanadi, lekin mantiq shu yerda: sana chegarasi
 * bitta kunga surilsa, oy boshidagi yoki oxiridagi to'lov noto'g'ri davrga
 * tushib qoladi va operator raqamlarni solishtirib chalkashadi.
 *
 * Sana UTC bo'yicha kesiladi — server ham `date_paid` ni (vaqtsiz `DATE`)
 * shunday taqqoslaydi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${izoh}`}`);
};

const eq = (name: string, key: PresetKey, today: string, from: string, to: string): void => {
  const r = presetRange(key, new Date(today));
  check(`${name}: ${r.from} → ${r.to}`, r.from === from && r.to === to, `kutilgan ${from} → ${to}`);
};

// Oy o'rtasi — oddiy holat.
eq('bugun', 'today', '2026-08-10T12:00:00Z', '2026-08-10', '2026-08-10');
eq('shu oy', 'this_month', '2026-08-10T12:00:00Z', '2026-08-01', '2026-08-10');
eq('chorak', 'quarter', '2026-08-10T12:00:00Z', '2026-06-01', '2026-08-10');
eq('6 oy', 'half_year', '2026-08-10T12:00:00Z', '2026-03-01', '2026-08-10');
eq('yil', 'year', '2026-08-10T12:00:00Z', '2026-01-01', '2026-08-10');

// O'tgan oy TO'LIQ olinadi — "bugungacha" deb kesilsa, tugagan oy uchun
// chala raqam chiqardi.
eq("o'tgan oy", 'last_month', '2026-08-10T12:00:00Z', '2026-07-01', '2026-07-31');
eq("o'tgan oy (fevral)", 'last_month', '2026-03-15T12:00:00Z', '2026-02-01', '2026-02-28');
eq("o'tgan oy (kabisa)", 'last_month', '2024-03-15T12:00:00Z', '2024-02-01', '2024-02-29');

// Yil chegarasi — oy ayirishda eng ko'p adashiladigan joy.
eq("yanvarda o'tgan oy", 'last_month', '2026-01-15T12:00:00Z', '2025-12-01', '2025-12-31');
eq('yanvarda chorak', 'quarter', '2026-01-15T12:00:00Z', '2025-11-01', '2026-01-15');
eq('yanvarda 6 oy', 'half_year', '2026-01-15T12:00:00Z', '2025-08-01', '2026-01-15');

// Oyning oxirgi kuni — 31-sanada oy ayirish "toshib ketishi" mumkin
// (masalan 31-mart − 1 oy = 3-mart). Biz doim OY BOSHINI olamiz,
// shuning uchun bunday xato bo'lmasligi kerak.
eq('31-mart, chorak', 'quarter', '2026-03-31T12:00:00Z', '2026-01-01', '2026-03-31');
eq("31-mart, o'tgan oy", 'last_month', '2026-03-31T12:00:00Z', '2026-02-01', '2026-02-28');

// Kun chegarasi: UTC bo'yicha 23:59 hali o'sha kun.
eq('kech soatda bugun', 'today', '2026-08-10T23:59:00Z', '2026-08-10', '2026-08-10');

// Har bir oraliqda boshlanish tugashdan keyin bo'lib qolmasligi kerak.
const keys: PresetKey[] = ['today', 'this_month', 'last_month', 'quarter', 'half_year', 'year', 'custom'];
for (const key of keys) {
  const r = presetRange(key, new Date('2026-08-10T12:00:00Z'));
  check(`${key}: boshlanish tugashdan keyin emas`, r.from <= r.to, `${r.from} → ${r.to}`);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
