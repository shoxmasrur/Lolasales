import { nudgeKerakmi, type NudgeSnapshot } from '@/domain/services/sukut';

/**
 * Qo'lda ishga tushiriladi: npm run test:silence-watcher --workspace=server
 *
 * Kuzatuvchining O'ZI baza va Telegram bilan ishlaydi, shuning uchun
 * QAROR qismi sof funksiyaga ajratilgan. Eng qimmat xato — kuchdagi
 * va'dasi bor mijozga yozib yuborish: u allaqachon kun aytgan va o'sha
 * kun uchun `PromiseWatcher` javobgar, ikkalasi yozsa bu ta'qib bo'ladi.
 */
const TZ = 'Asia/Tashkent';
const t = (isoLocal: string): Date => new Date(`${isoLocal}+05:00`);

const base = (over: Partial<NudgeSnapshot> = {}): NudgeSnapshot => ({
  lastOutboundAt: t('2026-08-17T10:00:00'), // dushanba
  nudgeCount: 0,
  ochiqVadaBor: false,
  kechikishYopilgan: false,
  ...over,
});

const HOZIR = t('2026-08-18T09:00:00'); // seshanba — 1 kun sukut

const HOLATLAR: Array<{ nom: string; snapshot: NudgeSnapshot; hozir?: Date; kutilgan: boolean }> = [
  { nom: '1 kun sukut, boshqa to\'siq yo\'q — yoziladi', snapshot: base(), kutilgan: true },
  {
    nom: 'o\'sha kuni — hali erta',
    snapshot: base(),
    hozir: t('2026-08-17T18:00:00'),
    kutilgan: false,
  },
  {
    nom: 'kuchdagi va\'da bor — PromiseWatcher javobgar, yozilmaydi',
    snapshot: base({ ochiqVadaBor: true }),
    kutilgan: false,
  },
  {
    nom: 'kechikish yopilgan — yozadigan gap yo\'q',
    snapshot: base({ kechikishYopilgan: true }),
    kutilgan: false,
  },
  {
    nom: 'ikki marta yozilgan — chegara tugadi',
    snapshot: base({ nudgeCount: 2 }),
    kutilgan: false,
  },
  {
    nom: 'bir marta yozilgan, yana bir kun o\'tdi — ikkinchisi ketadi',
    snapshot: base({ nudgeCount: 1 }),
    kutilgan: true,
  },
  {
    nom: 'shanba yozilgan, yakshanba — yakshanba sanalmaydi',
    snapshot: base({ lastOutboundAt: t('2026-08-22T10:00:00') }),
    hozir: t('2026-08-23T09:00:00'),
    kutilgan: false,
  },
  {
    nom: 'shanba yozilgan, dushanba — 1 kun to\'ldi',
    snapshot: base({ lastOutboundAt: t('2026-08-22T10:00:00') }),
    hozir: t('2026-08-24T09:00:00'),
    kutilgan: true,
  },
];

let failed = 0;
for (const h of HOLATLAR) {
  const got = nudgeKerakmi(h.snapshot, h.hozir ?? HOZIR, { kunlar: 1, maxUrinish: 2, timeZone: TZ });
  if (got === h.kutilgan) {
    console.log(`✓ ${h.nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${h.nom}: kutilgan ${h.kutilgan}, olingan ${got}`);
  }
}

console.log(failed ? `\n${failed} ta holat yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
