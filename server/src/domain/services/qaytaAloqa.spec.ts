import {
  qaytaAloqaTuri,
  type QaytaAloqaQoidalari,
  type QaytaAloqaSnapshot,
} from '@/domain/services/qaytaAloqa';
import type { RecontactKind } from '@/domain/repositories/IRecontactRepository';

/**
 * Qo'lda ishga tushiriladi: npm run test:qayta-aloqa --workspace=server
 *
 * Qayta aloqa ro'yxatining tasniflagichi (dizayn 2.2). Noto'g'ri "ha"
 * operatorga mijozni bezovta qilishni taklif qiladi — sanasi kelmagan
 * va'da bergan yoki to'lab bo'lgan odamni. Noto'g'ri "yo'q" esa suhbatni
 * hech kim yozmaydigan joyga tashlab qo'yadi. Ikkalasi ham tekshiriladi.
 */
const TZ = 'Asia/Tashkent';
const t = (isoLocal: string): Date => new Date(`${isoLocal}+05:00`);

const QOIDALAR: QaytaAloqaQoidalari = { minDebt: 500_000, silenceNudgeMax: 2, timeZone: TZ };

/** 2026-09-16 — chorshanba. */
const HOZIR = t('2026-09-16T10:00:00');

/** Shanba: yakshanba sanalmaydi — 14, 15, 16 = 3 ish kuni. */
const UCH_ISH_KUNI_OLDIN = t('2026-09-12T11:00:00');

/** Hech qanday turga tegishli bo'lmagan asos — har holat undan bittasini o'zgartiradi. */
function asos(o: Partial<QaytaAloqaSnapshot> = {}): QaytaAloqaSnapshot {
  return {
    lastMessage: { direction: 'out', at: UCH_ISH_KUNI_OLDIN, readAt: null },
    mijozYozgan: false,
    nudgeCount: 0,
    lastPromise: null,
    ochiqVadalar: [],
    overdue: 3_000_000,
    state: 'contacted',
    agentEnabled: true,
    needsHuman: false,
    humanKind: null,
    telegramStatus: 'found',
    doNotContact: false,
    ...o,
  };
}

const oqilgan = { direction: 'out' as const, at: UCH_ISH_KUNI_OLDIN, readAt: t('2026-09-12T12:00:00') };
const kiruvchi = { direction: 'in' as const, at: UCH_ISH_KUNI_OLDIN, readAt: null };

const HOLATLAR: Array<{ nom: string; s: QaytaAloqaSnapshot; hozir?: Date; kutilgan: RecontactKind | null; kunlar?: number }> = [
  // ── Har tur ──
  { nom: 'oqilmagan: oxirgi xabar bizniki, o\'qilmagan', s: asos(), kutilgan: 'oqilmagan', kunlar: 3 },
  {
    nom: 'javobsiz: o\'qilgan, mijoz hech yozmagan, nudge chegarada',
    s: asos({ lastMessage: oqilgan, nudgeCount: 2 }),
    kutilgan: 'javobsiz',
  },
  {
    nom: 'o\'qilgan, nudge hali chegarada emas — sukut kuzatuvchisining ishi → null',
    s: asos({ lastMessage: oqilgan, nudgeCount: 1 }),
    kutilgan: null,
  },
  {
    nom: 'sana_yoq: mijoz yozgan, oxirgi xabar o\'qilgan',
    s: asos({ lastMessage: oqilgan, mijozYozgan: true }),
    kutilgan: 'sana_yoq',
  },
  {
    nom: 'sana_yoq: oxirgi xabar mijozniki',
    s: asos({ lastMessage: kiruvchi, mijozYozgan: true }),
    kutilgan: 'sana_yoq',
  },
  {
    nom: 'vada_buzilgan: oxirgi va\'da broken',
    s: asos({ lastPromise: { date: '2026-09-10', status: 'broken', amount: 1_000_000 } }),
    kutilgan: 'vada_buzilgan',
  },
  {
    nom: 'vada_buzilgan: pending, sanasi o\'tgan',
    s: asos({
      lastPromise: { date: '2026-09-15', status: 'pending', amount: 1_000_000 },
      ochiqVadalar: [{ date: '2026-09-15', status: 'pending', amount: 1_000_000 }],
    }),
    kutilgan: 'vada_buzilgan',
  },
  {
    nom: 'vada_buzilgan: needs_human broken_promise ham tushadi',
    s: asos({
      needsHuman: true,
      humanKind: 'broken_promise',
      lastPromise: { date: '2026-09-10', status: 'broken', amount: 1 },
    }),
    kutilgan: 'vada_buzilgan',
  },
  {
    nom: 'kept va\'da buzilgan emas — boshqa turga o\'tadi',
    s: asos({ lastPromise: { date: '2026-09-10', status: 'kept', amount: 1 } }),
    kutilgan: 'oqilmagan',
  },

  // ── Ustunlik tartibi ──
  {
    nom: 'ustunlik: buzilgan va\'da sana_yoq dan oldin',
    s: asos({
      lastMessage: kiruvchi,
      mijozYozgan: true,
      lastPromise: { date: '2026-09-10', status: 'broken', amount: 1 },
    }),
    kutilgan: 'vada_buzilgan',
  },
  {
    nom: 'ustunlik: sana_yoq javobsiz dan oldin',
    s: asos({ lastMessage: oqilgan, mijozYozgan: true, nudgeCount: 2 }),
    kutilgan: 'sana_yoq',
  },
  {
    nom: 'mijoz yozgan, lekin oxirgi xabarimiz o\'qilmagan → oqilmagan',
    s: asos({ mijozYozgan: true }),
    kutilgan: 'oqilmagan',
  },

  // ── 3 ish kuni chegarasi ──
  {
    nom: 'chegara: dushanba xabari, chorshanba — 2 ish kuni → null',
    s: asos({ lastMessage: { direction: 'out', at: t('2026-09-14T10:00:00'), readAt: null } }),
    kutilgan: null,
    kunlar: 2,
  },
  {
    nom: 'chegara: yakshanba sanalmaydi — shanba→seshanba 3 kalendar kun, 2 ish kuni → null',
    s: asos(),
    hozir: t('2026-09-15T10:00:00'),
    kutilgan: null,
    kunlar: 2,
  },
  {
    nom: 'chegara: yakshanba xabari, chorshanba — 3 ish kuni',
    s: asos({ lastMessage: { direction: 'out', at: t('2026-09-13T10:00:00'), readAt: null } }),
    kutilgan: 'oqilmagan',
    kunlar: 3,
  },

  // ── Faol va'da istisnosi ──
  {
    nom: 'sanasi kelmagan faol va\'da → null (hatto eskisi buzilgan bo\'lsa ham)',
    s: asos({
      lastPromise: { date: '2026-09-20', status: 'pending', amount: 1 },
      ochiqVadalar: [
        { date: '2026-09-20', status: 'pending', amount: 1 },
        { date: '2026-09-01', status: 'partial', amount: 1 },
      ],
    }),
    kutilgan: null,
  },
  {
    nom: 'va\'da sanasi BUGUN — hali faol → null',
    s: asos({
      lastPromise: { date: '2026-09-16', status: 'partial', amount: 1 },
      ochiqVadalar: [{ date: '2026-09-16', status: 'partial', amount: 1 }],
    }),
    kutilgan: null,
  },

  // ── Umumiy shartlar ──
  { nom: 'kechikish yopilgan (overdue = minDebt) → null', s: asos({ overdue: 500_000 }), kutilgan: null },
  { nom: 'kechikish yo\'q → null', s: asos({ overdue: 0 }), kutilgan: null },
  { nom: 'bloklangan → null', s: asos({ telegramStatus: 'blocked' }), kutilgan: null },
  { nom: 'deactivated → null', s: asos({ telegramStatus: 'deactivated' }), kutilgan: null },
  { nom: 'do_not_contact → null', s: asos({ doNotContact: true }), kutilgan: null },
  { nom: 'closed → null', s: asos({ state: 'closed' }), kutilgan: null },
  { nom: 'refused → null', s: asos({ state: 'refused' }), kutilgan: null },
  { nom: 'agent o\'chiq → null', s: asos({ agentEnabled: false }), kutilgan: null },
  { nom: 'needs_human (agent_error) → null', s: asos({ needsHuman: true, humanKind: 'agent_error' }), kutilgan: null },
  { nom: 'xabar yo\'q → null', s: asos({ lastMessage: null }), kutilgan: null, kunlar: 0 },
];

let failed = 0;
for (const h of HOLATLAR) {
  const got = qaytaAloqaTuri(h.s, h.hozir ?? HOZIR, QOIDALAR);
  const ok = got.kind === h.kutilgan && (h.kunlar === undefined || got.silentWorkDays === h.kunlar);
  if (ok) {
    console.log(`✓ ${h.nom}`);
  } else {
    failed += 1;
    console.log(
      `✗ ${h.nom}: kutilgan ${h.kutilgan}/${h.kunlar ?? '-'}, olingan ${got.kind}/${got.silentWorkDays}`,
    );
  }
}

console.log(failed ? `\n${failed} ta holat yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
