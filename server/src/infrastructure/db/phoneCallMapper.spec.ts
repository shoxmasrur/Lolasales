import { mapPhoneCall } from '@/infrastructure/db/repositories/PgPhoneCallRepository';

/** Qo'lda ishga tushiriladi: npm run test:phone-call-mapper --workspace=server */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const qator = {
  id: 'p1', external_id: 'call-1', client_id: 'cl1', contract_id: 'ct1',
  agent_key: 'madina-orzular', agent_name: 'Madina', phone: '+998901112233',
  started_at: new Date('2026-10-14T05:00:00Z'), duration_sec: 95, outcome: 'gaplashildi',
  summary: 'Juma to\'laydi', transcript: null,
  // DATE `pool.ts` dagi 1082-parser tufayli satr bo'lib keladi, NUMERIC esa son.
  promise_date: '2026-10-17', promise_amount: 8339000, promise_id: null,
  created_by_user_id: 'u1', created_at: new Date('2026-10-14T05:02:00Z'), updated_at: new Date('2026-10-14T05:02:00Z'),
};
const p = mapPhoneCall(qator);
check('maydonlar', [p.externalId, p.agentKey, p.agentName, p.outcome, p.durationSec], ['call-1', 'madina-orzular', 'Madina', 'gaplashildi', 95]);
check('va\'da', [p.promiseDate, p.promiseAmount], ['2026-10-17', 8339000]);
check('bo\'sh va\'da', [mapPhoneCall({ ...qator, promise_date: null, promise_amount: null }).promiseDate,
  mapPhoneCall({ ...qator, promise_date: null, promise_amount: null }).promiseAmount], [null, null]);
check('NUMERIC satr bo\'lib kelsa ham son', mapPhoneCall({ ...qator, promise_amount: '8339000.00' }).promiseAmount, 8339000);
check('contract yo\'q', mapPhoneCall({ ...qator, contract_id: null }).contractId, null);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
