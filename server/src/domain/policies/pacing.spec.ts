import { CAP_FACTOR, meanDelayMs, nextDelayMs, spreadMeanMs } from '@/domain/policies/PacingPolicy';
import { minutesOfDay, zonedParts } from '@/shared/datetime';

/**
 * Qo'lda: npm run test:pacing --workspace=server
 *
 * Sof funksiya — tasodifiy generator tashqaridan beriladi, shuning uchun
 * natija aniq tekshiriladi.
 */
const BASE = {
  windowStart: '09:00',
  windowEnd: '19:00', // 600 daqiqa
  minDelaySec: 60,
  maxDelaySec: 180,
};

const MIN = 60 * 1000;
const MAX_FLOOR = 180 * 1000;

let failed = 0;
const check = (name: string, ok: boolean, extra = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${extra}`}`);
};

// ── 1. random = 1/e → namuna aynan o'rtachaga teng ───────────────────────
{
  // ln(1/e) = −1, ya'ni sample = o'rtacha. 600 daqiqa / 30 = 20 daqiqa.
  const ms = nextDelayMs({ ...BASE, dailySends: 30, random: () => 1 / Math.E });
  check('30 ta uchun 20 daqiqa', ms === 20 * 60 * 1000, String(ms));
}

// ── 2. Sig'im ikki barobar → oraliq ikki barobar qisqa ───────────────────
{
  const ms = nextDelayMs({ ...BASE, dailySends: 60, random: () => 1 / Math.E });
  check('60 ta uchun 10 daqiqa', ms === 10 * 60 * 1000, String(ms));
}

// ── 3. Juda kichik random → yuqori chegara ishlaydi ──────────────────────
{
  const mean = meanDelayMs(BASE.windowStart, BASE.windowEnd, 30)!;
  const ms = nextDelayMs({ ...BASE, dailySends: 30, random: () => 0.0001 });

  // −ln(0.0001) ≈ 9.2, ya'ni chegarasiz 3 soatdan oshardi.
  check("3 × o'rtachadan oshmadi", ms === Math.round(CAP_FACTOR * mean), String(ms));
  check('bu 60 daqiqa', ms === 60 * 60 * 1000, String(ms));
}

// ── 4. random 1 ga yaqin → pastki chegara ishlaydi ───────────────────────
{
  const ms = nextDelayMs({ ...BASE, dailySends: 30, random: () => 0.999 });

  // sample ≈ 1.2 soniya — pastki chegarasiz ikkita xabar ketma-ket ketardi.
  check('pastki chegaradan past emas', ms >= MIN, String(ms));
  check("pastki chegara oralig'ida", ms <= MAX_FLOOR, String(ms));
}

// ── 5. Nolga bo'linish yo'q ──────────────────────────────────────────────
{
  const zeroSends = nextDelayMs({ ...BASE, dailySends: 0, random: () => 0.5 });
  check('dailySends = 0 → pastki chegara', zeroSends >= MIN && zeroSends <= MAX_FLOOR, String(zeroSends));

  const zeroWindow = nextDelayMs({
    ...BASE,
    windowStart: '09:00',
    windowEnd: '09:00',
    dailySends: 30,
    random: () => 0.5,
  });
  check('oyna nol → pastki chegara', zeroWindow >= MIN && zeroWindow <= MAX_FLOOR, String(zeroWindow));

  check('meanDelayMs null qaytardi', meanDelayMs('09:00', '09:00', 30) === null);
  check("meanDelayMs sig'im nolda null", meanDelayMs('09:00', '19:00', 0) === null);
}

// ── 6. Haqiqiy tasodif: o'rtacha to'g'ri VA oraliqlar har xil ────────────
{
  const mean = meanDelayMs(BASE.windowStart, BASE.windowEnd, 30)!;
  const samples: number[] = [];
  for (let i = 0; i < 1000; i += 1) {
    samples.push(nextDelayMs({ ...BASE, dailySends: 30 }));
  }

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const ratio = avg / mean;
  // Yuqori chegara o'rtachani ~5% pasaytiradi, pastki chegara ozgina qaytaradi.
  check("o'rtacha kutilgan oraliqda", ratio > 0.85 && ratio < 1.05, ratio.toFixed(3));

  // Bu shart muhim: o'rtachasi to'g'ri, lekin hammasi bir xil bo'lgan
  // realizatsiya ham birinchi shartdan o'tardi.
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  check('oraliqlar har xil (max ≥ 5 × min)', max >= 5 * min, `min=${min} max=${max}`);
}

// ── 7. spreadMeanMs: oynani mijozlar soniga bo'ladi ──────────────────────
{
  // 05:00 UTC = 10:00 Toshkent. Soat ayirmasi loyiha vaqt mintaqasida
  // hisoblanadi, shuning uchun kutilgan qiymat ham shundan chiqariladi.
  const NOW = new Date('2026-08-14T05:00:00Z');

  /** NOW dan `daqiqa` keyingi vaqt, loyiha mintaqasida, HH:mm ko'rinishida. */
  const soatga = (daqiqa: number): string => {
    const p = zonedParts(NOW);
    const jami = minutesOfDay(p.hour, p.minute) + daqiqa;
    const h = String(Math.floor(jami / 60) % 24).padStart(2, '0');
    const m = String(jami % 60).padStart(2, '0');
    return `${h}:${m}`;
  };

  const ikkiSoat = spreadMeanMs(NOW, soatga(120), 6);
  check('2 soat / 6 ta = 20 daqiqa', ikkiSoat === 20 * 60 * 1000, String(ikkiSoat));

  check("o'tib ketgan vaqt null", spreadMeanMs(NOW, soatga(-30), 6) === null);
  check('aynan hozir null', spreadMeanMs(NOW, soatga(0), 6) === null);
  check('count = 0 null', spreadMeanMs(NOW, soatga(120), 0) === null);
  check('count manfiy null', spreadMeanMs(NOW, soatga(120), -3) === null);
}

// ── 8. meanMs berilganda oyna hisobi e'tiborsiz qoladi ───────────────────
{
  // BASE bo'yicha oyna hisobi 20 daqiqa berardi (600 / 30). meanMs esa
  // 5 daqiqa — natija aynan shundan chiqishi kerak.
  const besh = 5 * 60 * 1000;
  const ms = nextDelayMs({ ...BASE, dailySends: 30, meanMs: besh, random: () => 1 / Math.E });
  check("meanMs oyna hisobini almashtirdi", ms === besh, String(ms));

  // Yuqori chegara meanMs dan hisoblanadi.
  const uzun = nextDelayMs({ ...BASE, dailySends: 30, meanMs: besh, random: () => 0.0001 });
  check('meanMs bilan 3 × chegara', uzun === Math.round(CAP_FACTOR * besh), String(uzun));

  // Pastki chegara meanMs bilan ham ishlaydi.
  const qisqa = nextDelayMs({ ...BASE, dailySends: 30, meanMs: 1000, random: () => 0.999 });
  check('meanMs bilan pastki chegara', qisqa >= MIN && qisqa <= MAX_FLOOR, String(qisqa));

  // null → eski yo'l (600 daqiqa / 30 = 20 daqiqa).
  const nol = nextDelayMs({ ...BASE, dailySends: 30, meanMs: null, random: () => 1 / Math.E });
  check('meanMs null → oyna hisobi', nol === 20 * 60 * 1000, String(nol));
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
