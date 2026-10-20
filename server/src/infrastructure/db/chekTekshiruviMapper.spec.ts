import { chekJavobiHolati, type PaymentCheck } from '@/domain/entities/PaymentCheck';
import { mapPaymentCheck } from '@/infrastructure/db/mappers';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-mapper --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — `mappers.ts`
 * `shared/crypto` orqali `shared/config` ni tortadi; bazaga chiqmaydi).
 *
 * Qo'riqlanadi:
 *   • chek qatori (005-migratsiya: `purchase_id`, `confirmed_amount`,
 *     `rejected_reason`) to'g'ri o'qiladi, summa matndan songa o'tadi;
 *   • agent qaysi chek qoidasini olishi (`chekJavobiHolati`) — faqat ochiq
 *     `tolov` tekshiruvida, javobdan oldin `'new'`, keyin `'acknowledged'`.
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

const asos = {
  id: 'pc1',
  conversation_id: 'cv1',
  client_id: 'c1',
  message_id: 'm1',
  kind: 'receipt_review',
  since_date: new Date('2026-09-17T00:00:00Z'),
  created_at: new Date('2026-09-17T08:00:00Z'),
};

// ─── 1. Tasdiqlangan chek qatori ─────────────────────────────────────────
{
  const c = mapPaymentCheck({
    ...asos,
    purchase_id: 'p1',
    status: 'confirmed_by_operator',
    receipt_source: 'tolov',
    acknowledged_at: new Date('2026-09-17T08:01:00Z'),
    confirmed_by: 'operator@lola.uz',
    confirmed_at: new Date('2026-09-17T10:00:00Z'),
    confirmed_amount: '500000',
    rejected_reason: null,
  } as never);
  check('receipt_review o\'qiladi', c.kind === 'receipt_review' && c.status === 'confirmed_by_operator');
  check('xarid o\'qiladi', c.purchaseId === 'p1', String(c.purchaseId));
  check('manba o\'qiladi', c.receiptSource === 'tolov', String(c.receiptSource));
  check('sana YYYY-MM-DD', c.sinceIso === '2026-09-17', c.sinceIso);
  check('javob vaqti o\'qiladi', c.acknowledgedAt?.toISOString() === '2026-09-17T08:01:00.000Z');
  check('tasdiqlagan operator o\'qiladi', c.confirmedBy === 'operator@lola.uz' && c.confirmedAt instanceof Date);
  check('summa son', c.confirmedAmount === 500_000, String(c.confirmedAmount));
  check('sabab null', c.rejectedReason === null);
}

// ─── 2. Rad etilgan / eski qator ─────────────────────────────────────────
{
  const r = mapPaymentCheck({ ...asos, status: 'rejected', receipt_source: 'tolov', rejected_reason: 'Summa ko\'rinmaydi' } as never);
  check('rad etilgan: sabab', r.status === 'rejected' && r.rejectedReason === 'Summa ko\'rinmaydi');
  check('ustunsiz eski qator: purchaseId/summa null', r.purchaseId === null && r.confirmedAmount === null);
}

// ─── 3. Agent qaysi chek qoidasini oladi ─────────────────────────────────
/** Tekshiruv (`created_at` 08:00) hali muddat ichida bo'ladigan "hozir". */
const YAQIN = new Date('2026-09-17T09:00:00Z');
const chek = (over: Partial<PaymentCheck>): PaymentCheck =>
  ({
    ...mapPaymentCheck({ ...asos, status: 'reviewing', receipt_source: 'tolov' } as never),
    ...over,
  });

check('ochiq tolov, javob yo\'q → new', chekJavobiHolati(chek({}), YAQIN) === 'new');
check('ochiq tolov, javob berilgan → acknowledged', chekJavobiHolati(chek({ acknowledgedAt: new Date() }), YAQIN) === 'acknowledged');
check('aniqlanmagan → null', chekJavobiHolati(chek({ receiptSource: 'aniqlanmagan' }), YAQIN) === null);
check('tasdiqlangan → null', chekJavobiHolati(chek({ status: 'confirmed_by_operator' }), YAQIN) === null);
check('rad etilgan → null', chekJavobiHolati(chek({ status: 'rejected' }), YAQIN) === null);
check('tekshiruv yo\'q → null', chekJavobiHolati(null, YAQIN) === null);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
