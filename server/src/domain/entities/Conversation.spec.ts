import { canAgentReply, type Conversation } from '@/domain/entities/Conversation';

/** Qo'lda ishga tushiriladi: npm run test:javob-berish --workspace=server */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  (kutilgan: ${String(expected)}, keldi: ${String(actual)})`}`);
};

const base: Conversation = {
  id: 'c', clientId: 'k', telegramAccountId: null, peerId: null, peerAccessHash: null,
  state: 'active', agentEnabled: true, needsHuman: false, humanReason: null, humanKind: null,
  agentSessionId: null, lastMessageAt: null, lastInboundAt: null, lastOutboundAt: null,
  unreadCount: 0, summary: null, createdAt: new Date(0), updatedAt: new Date(0),
};

check('oddiy suhbat: javob beradi', canAgentReply(base), true);
check('agent o\'chirilgan: jim', canAgentReply({ ...base, agentEnabled: false }), false);
check('yopilgan suhbat: jim', canAgentReply({ ...base, state: 'closed' }), false);
check('operator kutilyapti: jim', canAgentReply({ ...base, needsHuman: true, humanKind: null }), false);
check('chek tekshiruvi: jim', canAgentReply({ ...base, needsHuman: true, humanKind: 'chek_tekshiruvi' }), false);
check('agent xatosi: jim', canAgentReply({ ...base, needsHuman: true, humanKind: 'agent_error' }), false);
// To'lagan mijoz: havola kiritilmagani yoki qator almashtirish — menejerga xabar, lekin javob to'xtamaydi.
check('menejer xabari: javob beradi', canAgentReply({ ...base, needsHuman: true, humanKind: 'menejer_xabari' }), true);
check('menejer xabari + agent o\'chirilgan: jim', canAgentReply({ ...base, needsHuman: true, humanKind: 'menejer_xabari', agentEnabled: false }), false);

if (failed > 0) process.exit(1);
console.log('OK');
