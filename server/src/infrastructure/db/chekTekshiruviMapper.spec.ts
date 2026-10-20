import { chekJavobiHolati, operatorJimligiBoshi, type PaymentCheck } from '@/domain/entities/PaymentCheck';
import { mapPaymentCheck } from '@/infrastructure/db/mappers';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-mapper --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — `mappers.ts`
 * `shared/crypto` orqali `shared/config` ni tortadi; bazaga chiqmaydi).
 *
 * 105-migratsiya `payment_checks` ga `kind` va chek ustunlarini qo'shdi.
 * Ikki narsa qo'riqlanadi:
 *   • eski (`crm_watch`) qator avvalgidek o'qiladi, chek qatorida
 *     `watch_until` NULL bo'lsa 1970-yil emas, `null` chiqadi;
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
  contract_id: null,
  message_id: 'm1',
  since_date: new Date('2026-09-17T00:00:00Z'),
  baseline_paid: '0',
  found_amount: null,
  found_type: null,
  checked_at: null,
  created_at: new Date('2026-09-17T08:00:00Z'),
};

// ─── 1. Eski CRM kuzatuvi qatori ─────────────────────────────────────────
{
  const c = mapPaymentCheck({
    ...asos,
    status: 'watching',
    watch_until: new Date('2026-09-18T08:00:00Z'),
  } as never);
  check('kind ustuni yo\'q qator crm_watch bo\'ladi', c.kind === 'crm_watch', c.kind);
  check('crm_watch: receiptSource null', c.receiptSource === null, String(c.receiptSource));
  check('crm_watch: watchUntil sana', c.watchUntil?.toISOString() === '2026-09-18T08:00:00.000Z', String(c.watchUntil));
  check('crm_watch: yangi maydonlar null', c.acknowledgedAt === null && c.thanksSentAt === null && c.confirmedBy === null && c.confirmedAt === null);
}

// ─── 2. Chek tekshiruvi qatori ───────────────────────────────────────────
{
  const c = mapPaymentCheck({
    ...asos,
    kind: 'receipt_review',
    status: 'confirmed_by_operator',
    receipt_source: 'tolov',
    watch_until: null,
    acknowledged_at: new Date('2026-09-17T08:01:00Z'),
    thanks_sent_at: null,
    confirmed_by: 'operator@xonsaroy.uz',
    confirmed_at: new Date('2026-09-17T10:00:00Z'),
  } as never);
  check('receipt_review o\'qiladi', c.kind === 'receipt_review' && c.status === 'confirmed_by_operator');
  check('manba o\'qiladi', c.receiptSource === 'tolov', String(c.receiptSource));
  check('watch_until NULL → null (1970 emas)', c.watchUntil === null, String(c.watchUntil));
  check('javob vaqti o\'qiladi', c.acknowledgedAt?.toISOString() === '2026-09-17T08:01:00.000Z');
  check('tasdiqlagan operator o\'qiladi', c.confirmedBy === 'operator@xonsaroy.uz' && c.confirmedAt instanceof Date);
}

// ─── 3. Agent qaysi chek qoidasini oladi ─────────────────────────────────
/** Tekshiruv (`created_at` 08:00) hali muddat ichida bo'ladigan "hozir". */
const YAQIN = new Date('2026-09-17T09:00:00Z');
const chek = (over: Partial<PaymentCheck>): PaymentCheck =>
  ({
    ...mapPaymentCheck({ ...asos, kind: 'receipt_review', status: 'reviewing', receipt_source: 'tolov', watch_until: null } as never),
    ...over,
  });

check('ochiq tolov, javob yo\'q → new', chekJavobiHolati(chek({}), YAQIN) === 'new');
check('ochiq tolov, javob berilgan → acknowledged', chekJavobiHolati(chek({ acknowledgedAt: new Date() }), YAQIN) === 'acknowledged');
check('aniqlanmagan → null', chekJavobiHolati(chek({ receiptSource: 'aniqlanmagan' }), YAQIN) === null);
check('tasdiqlangan → null', chekJavobiHolati(chek({ status: 'confirmed_by_operator' }), YAQIN) === null);
check('crm_watch → null', chekJavobiHolati(chek({ kind: 'crm_watch', status: 'watching', receiptSource: null }), YAQIN) === null);
check('tekshiruv yo\'q → null', chekJavobiHolati(null, YAQIN) === null);

// ─── 4. Jimlik oynasi — 7 kun ────────────────────────────────────────────
{
  const boshi = operatorJimligiBoshi(new Date('2026-09-17T10:00:00Z'));
  check('7 kun orqaga', boshi.toISOString() === '2026-09-10T10:00:00.000Z', boshi.toISOString());
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
