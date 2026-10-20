import { vadaKorinishi } from '@/application/services/AgentRunner';
import type { PaymentPromise, PromiseStatus } from '@/domain/entities/PaymentPromise';

/**
 * Qo'lda ishga tushiriladi: npm run test:vada-korinishi --workspace=server
 *
 * Suhbatning ochiq kelishuvi promptga IKKI xil ko'rinishda tushishi
 * mumkin — "buzilgan va'da" (bosim asosi) yoki "ochiq kelishuv"
 * (takrorlamaslik asosi). Ular BIR VAQTDA to'lmasligi shart: ikkalasi
 * ham berilsa, agent bir xabarda ham ayblab, ham "kelishuvimiz kuchda"
 * deb yozardi.
 *
 * Ilgari faqat birinchisi hisoblanardi, ikkinchisi umuman uzatilmasdi:
 * muddati kelmagan ochiq va'da haqida model faqat suhbat tarixidan
 * bilardi. Tarix esa 20 xabar bilan cheklangan — uzun suhbatda va'da
 * undan chiqib ketardi va agent "qachon to'laysiz?" deb qayta so'rardi.
 */
const NOW = new Date('2026-08-18T10:00:00Z');

const vada = (over: { status: PromiseStatus; date: string; paid?: number }): PaymentPromise =>
  ({
    id: 'v1',
    amount: 5_000_000,
    promisedDate: new Date(`${over.date}T00:00:00Z`),
    status: over.status,
    paidAmount: over.paid ?? 0,
  }) as unknown as PaymentPromise;

let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

// ─── Ochiq va'da yo'q ────────────────────────────────────────────────────
const yoq = vadaKorinishi(null, NOW);
check('va\'da yo\'q — ikkalasi ham null', yoq.broken === null && yoq.open === null);

// ─── Muddati kelmagan va'da — OCHIQ, buzilgan emas ──────────────────────
const kelajak = vadaKorinishi(vada({ status: 'pending', date: '2026-09-05' }), NOW);
check(
  'sana kelmagan — ochiq kelishuv sifatida uzatiladi',
  kelajak.broken === null && kelajak.open?.date === '2026-09-05',
  JSON.stringify(kelajak),
);
check('ochiq kelishuvda summa va kelgan qism bor', kelajak.open?.amount === 5_000_000 && kelajak.open?.paid === 0);

// ─── Sanasi o'tgan, pul kelmagan — BUZILGAN ─────────────────────────────
const otgan = vadaKorinishi(vada({ status: 'pending', date: '2026-08-10' }), NOW);
check(
  'sana o\'tgan, pul yo\'q — buzilgan va\'da',
  otgan.broken?.date === '2026-08-10' && otgan.open === null,
  JSON.stringify(otgan),
);

// ─── Qisman to'langan — sanasidan qat'i nazar BUZILGAN emas ─────────────
const qismanOtgan = vadaKorinishi(
  vada({ status: 'partial', date: '2026-08-10', paid: 678_000 }),
  NOW,
);
check(
  'qisman to\'langan va sana o\'tgan — "to\'lamadingiz" DEYILMAYDI',
  qismanOtgan.broken === null && qismanOtgan.open?.paid === 678_000,
  JSON.stringify(qismanOtgan),
);

const qismanKelajak = vadaKorinishi(
  vada({ status: 'partial', date: '2026-09-05', paid: 678_000 }),
  NOW,
);
check(
  'qisman to\'langan, sana kelmagan — ochiq kelishuv',
  qismanKelajak.broken === null && qismanKelajak.open?.date === '2026-09-05',
);

// ─── Bugungi sana hali buzilgan emas ─────────────────────────────────────
const bugun = vadaKorinishi(vada({ status: 'pending', date: '2026-08-18' }), NOW);
check('kelishilgan kunning o\'zida — hali buzilgan emas', bugun.broken === null && bugun.open !== null);

// ─── Invariant: ikkalasi hech qachon birga to'lmaydi ────────────────────
const hammasi = [yoq, kelajak, otgan, qismanOtgan, qismanKelajak, bugun];
check(
  'buzilgan va ochiq BIR VAQTDA to\'lmaydi',
  hammasi.every((k) => !(k.broken && k.open)),
);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
