import type { Contract } from '@/domain/entities/Contract';
import { kechikkanSumma, kechikishYopildi } from '@/domain/entities/Contract';

/**
 * Qo'lda ishga tushiriladi: npm run test:minimal-qarz --workspace=server
 *
 * Minimal qarzdorlik chegarasi. Prodda chiqqan muammo: agent kechikkan
 * to'lovi 800-1000 so'm bo'lgan mijozga ham yozardi. Bunday summa
 * yaxlitlash qoldig'i — mijoz uni qarz deb qabul qilmaydi, xabar esa
 * keraksiz bezovtalik va akkaunt uchun ortiqcha xavf.
 */
const shartnoma = (over: Partial<Contract> = {}): Contract =>
  ({
    id: 's1',
    debtFirst: 0,
    debtMonthly: 0,
    daysOverdue: 0,
    ...over,
  }) as Contract;

let failed = 0;
const check = (nom: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${nom}${ok || !izoh ? '' : `  ${izoh}`}`);
};

// ─── kechikkanSumma ────────────────────────────────────────────────────
check(
  'summa shartnomalar bo\'yicha qo\'shiladi',
  kechikkanSumma([shartnoma({ debtMonthly: 900 }), shartnoma({ id: 's2', debtMonthly: 1_800 })]) === 2_700,
);
check('bo\'sh ro\'yxat — nol', kechikkanSumma([]) === 0);

// ─── Chegara ishlaydi ──────────────────────────────────────────────────
check(
  '800 so\'m, chegara 100 000 — yopilgan (mijozga yozilmaydi)',
  kechikishYopildi([shartnoma({ debtMonthly: 800, daysOverdue: 30 })], 100_000),
);
check(
  'AYNAN chegaraga teng — yopilgan (solishtirish <=)',
  kechikishYopildi([shartnoma({ debtMonthly: 100_000, daysOverdue: 30 })], 100_000),
);
check(
  'chegaradan bir so\'m katta — yopilgan EMAS',
  !kechikishYopildi([shartnoma({ debtMonthly: 100_001, daysOverdue: 30 })], 100_000),
);

// ─── debtFirst va debtMonthly IKKALASI ham qo'shiladi ──────────────────
// `debtTotal` bilan emas, aynan shu ikki ustun bilan solishtiriladi
// (Excel importida uchtasi alohida o'qiladi va kelishmay qolishi mumkin).
// Bittasi yolg'iz chegaradan kichik bo'lsa ham, ikkalasi qo'shilganda
// chegaradan oshib ketishi kerak.
check(
  'debtFirst 60 000 + debtMonthly 60 000, chegara 100 000 — yopilgan EMAS',
  !kechikishYopildi([shartnoma({ debtFirst: 60_000, debtMonthly: 60_000, daysOverdue: 30 })], 100_000),
);

// ─── Qaror MIJOZ bo'yicha, shartnoma bo'yicha emas ─────────────────────
check(
  'uchta 900 lik shartnoma (jami 2700), chegara 1000 — yopilgan EMAS',
  !kechikishYopildi(
    [
      shartnoma({ id: 's1', debtMonthly: 900 }),
      shartnoma({ id: 's2', debtMonthly: 900 }),
      shartnoma({ id: 's3', debtMonthly: 900 }),
    ],
    1_000,
  ),
);
check(
  'bittasi toza, ikkinchisida 12 mln — yopilgan EMAS',
  !kechikishYopildi([shartnoma(), shartnoma({ id: 's2', debtMonthly: 12_000_000 })], 100_000),
);

// ─── minDebt: 0 — eski xatti-harakat ───────────────────────────────────
check('chegara 0, summa 0 — yopilgan', kechikishYopildi([shartnoma()], 0));
check(
  'chegara 0, summa 1 so\'m — yopilgan EMAS',
  !kechikishYopildi([shartnoma({ debtMonthly: 1 })], 0),
);

// ─── Ataylab o'zgartirilgan xatti-harakat ──────────────────────────────
// Ilgari `hasDebt` da `|| daysOverdue > 0` bor edi. U OLIB TASHLANDI:
// 800 so'm kechikkan mijozda `daysOverdue` ham 30 bo'ladi, ya'ni bu shart
// chegarani AYNAN u kerak bo'lgan holatda bekor qilardi.
check(
  'summa nol, lekin kechikish kuni bor — endi YOPILGAN',
  kechikishYopildi([shartnoma({ debtMonthly: 0, daysOverdue: 12 })], 0),
);

// ─── Bo'sh ro'yxat ─────────────────────────────────────────────────────
check(
  'shartnoma ro\'yxati bo\'sh — "yo\'q" deb AYTILMAYDI',
  !kechikishYopildi([], 100_000),
);

// ─── Sukut vs da'vo: ikkalasi BOSHQA-BOSHQA chaqiruv (kod review, Finding 1) ──
// 99 000 so'm — chegaradan (100 000) kichik, demak SUKUT uchun "yopilgan":
// bu mijozga hozircha yozmaslik mumkin (`SilenceWatcher`, darvoza).
check(
  '99 000 so\'m, threshold=minDebt(100 000) — SUKUT uchun yopilgan',
  kechikishYopildi([shartnoma({ debtMonthly: 99_000, daysOverdue: 20 })], 100_000),
);
// Xuddi shu 99 000 so'm DA'VO yo'lida (threshold = 0, literal) yopilgan
// EMAS: mijoz hali 99 000 so'm qarzdor, "kechikkan to'lovingiz yo'q"
// deyish uni darhol rad ettiradi. minDebt SUKUTGA ruxsat beradi, DA'VOGA
// emas — shu ikkalasini adashtirmaslik ushbu testning maqsadi.
check(
  '99 000 so\'m, threshold=0 (da\'vo) — YOPILMAGAN, mijozga "qarzim yo\'q" deb AYTILMAYDI',
  !kechikishYopildi([shartnoma({ debtMonthly: 99_000, daysOverdue: 20 })], 0),
);
// Ikkala yo'lda ham FARQ yo'q holat: summa AYNAN 0 bo'lsa, ikkalasi ham
// "yopilgan" deydi — chunki da'vo ham, sukut ham haqiqatga mos keladi.
check(
  'summa 0 — SUKUT (minDebt=100 000) va DA\'VO (0) ikkalasida ham yopilgan',
  kechikishYopildi([shartnoma()], 100_000) && kechikishYopildi([shartnoma()], 0),
);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
