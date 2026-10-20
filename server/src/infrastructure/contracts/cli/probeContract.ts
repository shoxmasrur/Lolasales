import { XonsaroyContractGateway } from '@/infrastructure/contracts/XonsaroyContractGateway';
import { computeDebt } from '@/domain/services/contractDebt';

/**
 * Qo'lda: npm run probe-contract --workspace=server -- 5582MSO25F3
 *
 * Real API'ga bitta so'rov yuborib, kelgan ma'lumotni ko'rsatadi.
 * Bazaga hech narsa yozmaydi.
 */
const contractNo = process.argv[2];

if (!contractNo) {
  console.error('Shartnoma raqamini bering:');
  console.error('  npm run probe-contract --workspace=server -- 5582MSO25F3');
  process.exit(1);
}

const gateway = new XonsaroyContractGateway();
const started = Date.now();
const c = await gateway.findByContractNo(contractNo);

if (!c) {
  console.log(`${contractNo} — topilmadi`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const debt = computeDebt(c.schedule, today);
const som = (n: number | null): string =>
  n === null ? '—' : `${n.toLocaleString('ru-RU')} so'm`;

const last = c.history.at(-1);

console.log(`
Shartnoma       ${c.contractNo}   (order.id ${c.orderId})
Mijoz           ${c.clientName}
Telefonlar      ${c.phones.join(', ') || '—'}
Obyekt          ${c.objectName ?? '—'} · ${c.apartment?.number ?? '—'} · ${c.apartment?.rooms ?? '—'} xona · ${c.apartment?.area ?? '—'} m²
Oylik to'lov    ${som(c.monthlyPayment)}
Grafik          ${c.schedule.length} qator · to'lov tarixi ${c.history.length} yozuv
Oxirgi to'lov   ${last ? `${last.datePaid} · ${som(last.amount)}` : '—'}

KECHIKKAN       ${som(debt.overdueTotal)}
   boshlang'ich ${som(debt.overdueFirst)}
   oylik        ${som(debt.overdueMonthly)}
Kechikish       ${debt.daysOverdue} kun · ${debt.missedMonths} oy
Keyingi to'lov  ${debt.nextPaymentDate ?? '—'} · ${som(debt.nextPaymentAmount)}

Umumiy qoldiq   ${som(c.remainingTotal)}   ← ICHKI, mijozga aytilmaydi
So'rov vaqti    ${Date.now() - started} ms
`);
