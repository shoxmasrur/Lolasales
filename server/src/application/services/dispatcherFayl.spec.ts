import { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { Conversation } from '@/domain/entities/Conversation';

/**
 * Qo'lda: npm run test:dispatcher-fayl --workspace=server
 *
 * `sendMedia`: Telegram faylni yetkazgandan KEYIN yiqilgan hisob yozuvi
 * xabarni "failed" qilmasligi kerak — aks holda qayta urinish (talabnoma)
 * mijozga ikkinchi nusxani yuboradi. «Agent navbati» (logger → config).
 */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

function yasash(o: { tgYiqiladi?: boolean; hisobYiqiladi?: boolean }) {
  const holatlar: string[] = [];
  const hodisalar: string[] = [];
  const SENT_AT = new Date('2026-10-16T07:00:00Z');
  const messages = {
    hasOutbound: async () => false,
    create: async () => ({ id: 'm1' }),
    updateStatus: async (_id: string, status: string) => { holatlar.push(status); return { id: 'm1', status }; },
  };
  const accounts = {
    findById: async () => ({ id: 'a1', label: 'A', isEnabled: true, status: 'connected', floodWaitUntil: null, spamStatus: 'ok', spamUntil: null }),
    incrementSentToday: async () => { if (o.hisobYiqiladi) throw new Error('baza'); },
  };
  const gateway = {
    runExclusive: async (_a: string, _g: unknown, fn: () => Promise<unknown>) => fn(),
    markRead: async () => undefined,
    sendMedia: async () => {
      if (o.tgYiqiladi) throw new Error('PEER_FLOOD');
      return { telegramMsgId: 7, sentAt: SENT_AT };
    },
  };
  const d = new MessageDispatcher(
    messages as never,
    { touchOutbound: async () => undefined } as never,
    accounts as never,
    gateway as never,
    { get: async () => ({ killSwitch: false }) } as never,
    { publish: (e: { type: string; messageId?: string }) => { hodisalar.push(e.messageId ? `${e.type}:${e.messageId}` : e.type); } } as never,
    { now: () => SENT_AT, todayIso: () => '2026-10-16' } as never,
    { save: async () => ({ path: 'p.pdf', sizeBytes: 3 }) } as never,
    { findById: async () => null } as never,
    { record: async () => undefined } as never,
  );
  const conversation = { id: 's1', clientId: 'k1', telegramAccountId: 'a1', peerId: 'p1', peerAccessHash: 'h' } as Conversation;
  const yubor = () => d.sendMedia({
    conversation, data: Buffer.from('PDF'), fileName: 'f.pdf', mimeType: 'application/pdf',
    caption: 'c', author: 'human', asDocument: true,
  });
  return { yubor, holatlar, hodisalar };
}

async function main(): Promise<void> {
  const xato = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return (e as Error).message; } };

  const a = yasash({ hisobYiqiladi: true });
  check('yetkazilgach yiqildi → xato tashlanadi', await xato(a.yubor), 'baza');
  check('… lekin xabar sent, failed emas', a.holatlar, ['sent']);
  // Chat "yuborilmoqda" da osilib qolmasin: `sent` yozuvidan keyin hodisa.
  check('… va sent yozilgach message.updated chiqadi', a.hodisalar, ['message.created:m1', 'message.updated:m1']);

  const b = yasash({ tgYiqiladi: true });
  check('Telegram rad etdi → failed', [await xato(b.yubor), b.holatlar], ['PEER_FLOOD', ['failed']]);

  const c = yasash({});
  check('oddiy yuborish → sent', [await xato(c.yubor), c.holatlar], [null, ['sent']]);

  if (failed > 0) {
    console.error(`\n${failed} ta tekshiruv yiqildi`);
    process.exit(1);
  }
  console.log('\nHammasi o\'tdi');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
