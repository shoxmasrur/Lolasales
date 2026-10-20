import {
  premiumBosqichi,
  premiumEslatmasi,
  premiumKunQoldi,
  premiumTugashi,
  premiumXabari,
} from '@/domain/services/premium';

/** Qo'lda ishga tushiriladi: npm run test:premium --workspace=server */

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

// ─── premiumTugashi ───────────────────────────────────────────────────────
check('1 yil', premiumTugashi('2026-10-09', 12), '2027-10-09');
check('1 oy', premiumTugashi('2026-10-09', 1), '2026-11-09');
check('yil chegarasidan o\'tadi', premiumTugashi('2026-11-15', 3), '2027-02-15');
// 31-yanvar + 1 oy: fevralda 31-kun yo'q — oyning oxirgi kuni.
check('oy oxiri qisqa oyga', premiumTugashi('2027-01-31', 1), '2027-02-28');
check('kabisa yili', premiumTugashi('2028-01-31', 1), '2028-02-29');
check('29-fevral + 1 yil', premiumTugashi('2028-02-29', 12), '2029-02-28');
check('2 yil', premiumTugashi('2026-10-09', 24), '2028-10-09');

// ─── premiumKunQoldi ──────────────────────────────────────────────────────
check('30 kun qoldi', premiumKunQoldi('2026-11-08', '2026-10-09'), 30);
check('bugun tugaydi', premiumKunQoldi('2026-10-09', '2026-10-09'), 0);
check('o\'tib ketgan', premiumKunQoldi('2026-10-01', '2026-10-09'), -8);

// ─── premiumBosqichi ──────────────────────────────────────────────────────
check('31 kun — hali erta', premiumBosqichi(31), null);
check('30 kun', premiumBosqichi(30), 30);
check('8 kun — hali 30 bosqichi', premiumBosqichi(8), 30);
check('7 kun', premiumBosqichi(7), 7);
check('2 kun — hali 7 bosqichi', premiumBosqichi(2), 7);
check('1 kun', premiumBosqichi(1), 1);
check('0 kun — tugadi', premiumBosqichi(0), 0);
check('manfiy — tugagan', premiumBosqichi(-5), 0);

// ─── premiumEslatmasi ─────────────────────────────────────────────────────
const bugun = '2026-10-09';
check('premium yo\'q', premiumEslatmasi(null, null, bugun), null);
check('uzoq sana', premiumEslatmasi('2027-10-09', null, bugun), null);
check('30 kun, hali eslatilmagan', premiumEslatmasi('2026-11-08', null, bugun), 30);
check('30 bosqichi allaqachon ketgan', premiumEslatmasi('2026-11-08', 30, bugun), null);
// Server 30-kuni o'chiq bo'lgan: 25 kun qolganda ham birinchi eslatma ketadi.
check('o\'tkazib yuborilgan 30', premiumEslatmasi('2026-11-03', null, bugun), 30);
check('7 kun, 30 ketgan', premiumEslatmasi('2026-10-16', 30, bugun), 7);
check('7 ketgan, 5 kun qoldi', premiumEslatmasi('2026-10-14', 7, bugun), null);
check('1 kun, 7 ketgan', premiumEslatmasi('2026-10-10', 7, bugun), 1);
check('tugadi, 1 ketgan', premiumEslatmasi('2026-10-09', 1, bugun), 0);
check('tugagani aytilgan — takrorlanmaydi', premiumEslatmasi('2026-10-01', 0, bugun), null);
// Premium belgisi birinchi marta kech qo'yilgan: bosqichlar sakrab o'tiladi.
check('birdan 3 kun qolgan', premiumEslatmasi('2026-10-12', null, bugun), 7);

// ─── premiumXabari ────────────────────────────────────────────────────────
check(
  'tugayapti',
  premiumXabari({ label: 'Dildora', phone: '+998901234567', premiumUntil: '2026-11-08' }, bugun, null),
  [
    '⭐ Telegram Premium tugayapti',
    '',
    'Akkaunt: Dildora (+998 90 123 45 67)',
    'Tugash sanasi: 08.11.2026',
    '30 kun qoldi',
    '',
    'Uzaytirgach, panelda Telegram sahifasidan sanani yangilang.',
  ].join('\n'),
);
check(
  'tugadi, panel manzili bilan',
  premiumXabari({ label: 'Dildora', phone: '+998901234567', premiumUntil: '2026-10-09' }, bugun, 'https://panel.test'),
  [
    '⭐ Telegram Premium tugadi',
    '',
    'Akkaunt: Dildora (+998 90 123 45 67)',
    'Tugash sanasi: 09.10.2026',
    'Bugun tugaydi',
    '',
    'Uzaytirgach, sanani yangilang: https://panel.test/telegram',
  ].join('\n'),
);
check(
  'o\'tib ketgan',
  premiumXabari({ label: 'A', phone: '+998901234567', premiumUntil: '2026-10-06' }, bugun, null).split('\n')[4],
  '3 kun oldin tugagan',
);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
