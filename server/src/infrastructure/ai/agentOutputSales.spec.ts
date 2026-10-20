import { parseAgentOutput, toTurnOutput, type RawAgentOutput } from '@/infrastructure/ai/agentOutput';
import { AGENT_OUTPUT_SCHEMA } from '@/infrastructure/ai/prompt/systemPrompt';

/**
 * Qo'lda: npm run test:agent-output-sales --workspace=server
 *
 * Sotuv javobi sxemasi: `stage`, `courseId`, `sendCard`, `installment`.
 * Qarzga oid `promise` va `paymentClaim` maydonlari yo'q.
 */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const MIN: RawAgentOutput = {
  reply: 'Salom', replySecond: null, stage: null, courseId: null, sendCard: false, installment: false,
  escalate: null, note: null, lesson: null, clientMemory: null, interlocutor: null,
};
const out = (raw: unknown, text = '') => toTurnOutput(parseAgentOutput(raw, text), null, undefined);

check('sendCard', out({ ...MIN, sendCard: true }).sendCard, true);
check('noma\'lum stage tashlanadi', out({ ...MIN, stage: 'toladi' }).stage, null);
check('fallback matn', toTurnOutput(parseAgentOutput(null, 'salom'), null, undefined).reply, 'salom');
check('sxemada promise yo\'q', 'promise' in (AGENT_OUTPUT_SCHEMA as any).properties, false);

// Qo'shimcha
check('ruxsat etilgan stage', out({ ...MIN, stage: 'qiziqdi' }).stage, 'qiziqdi');
check('rad_etdi', out({ ...MIN, stage: 'rad_etdi' }).stage, 'rad_etdi');
check('courseId', out({ ...MIN, courseId: 'kurs-1' }).courseId, 'kurs-1');
check('bo\'sh courseId', out({ ...MIN, courseId: '  ' }).courseId, null);
check('installment', out({ ...MIN, installment: true }).installment, true);
check('sendCard satr bo\'lsa false', out({ ...MIN, sendCard: 'true' }).sendCard, false);
check('escalate', out({ ...MIN, escalate: 'shikoyat' }).escalate, { reason: 'shikoyat' });
check('fallback — sendCard false', out(null, 'salom').sendCard, false);
check('sxemada paymentClaim yo\'q', 'paymentClaim' in (AGENT_OUTPUT_SCHEMA as any).properties, false);
const schema = AGENT_OUTPUT_SCHEMA as { required: string[]; properties: Record<string, unknown> };
check('hamma maydon required', [...schema.required].sort(), Object.keys(schema.properties).sort());
check('sxema maydonlari', Object.keys(schema.properties).sort(), [
  'clientMemory', 'courseId', 'escalate', 'installment', 'interlocutor', 'lesson', 'note', 'reply', 'replySecond',
  'sendCard', 'stage',
]);
check('clientType variantlari', (schema.properties.clientMemory as any).properties.clientType.enum,
  ['tez_qaror', 'oylaydigan', 'narxga_sezgir', 'shubhali', null]);
check('stage variantlari', (schema.properties.stage as any).enum, ['suhbatda', 'qiziqdi', 'rad_etdi', null]);

console.log(failed ? `\n${failed} ta tekshiruv yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
