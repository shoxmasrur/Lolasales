import { HandleIncomingMessageUseCase } from '@/application/usecases/messaging/HandleIncomingMessageUseCase';
import type { IncomingMessage } from '@/domain/services/ITelegramGateway';

/** Qo'lda ishga tushiriladi: npm run test:reklama-oqimi --workspace=server (bazasiz). */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

function qur(o: { creator?: boolean; creatorXato?: boolean } = {}) {
  const yaratilgan: string[] = [];
  const suhbatlar: Array<Record<string, unknown>> = [];
  const pushlar: Array<[string, string]> = [];
  const mijoz = { id: 'c1', telegramUserId: '555', nomalum: false };
  const uc = new HandleIncomingMessageUseCase(
    { findByTelegramUserId: async () => null, findByPhone: async () => null, setTelegramIdentity: async () => mijoz } as never,
    {} as never,
    {
      findByPeer: async () => null,
      findByClientId: async () => null,
      create: async (d: Record<string, unknown>) => { suhbatlar.push(d); return { id: 'cv1', peerId: null, ...d }; },
      update: async (_id: string, p: Record<string, unknown>) => ({ id: 'cv1', peerId: p.peerId ?? null }),
      touchInbound: async () => {},
    } as never,
    { existsTelegramMessage: async () => false, create: async () => ({ id: 'm1' }) } as never,
    { push: (id: string, t: string) => { pushlar.push([id, t]); } } as never,
    { get: async () => ({ killSwitch: false }) } as never,
    {} as never,
    { publish: () => {} } as never,
    {} as never,
    null,
    o.creator === false ? null : ({
      reklamadan: async (i: IncomingMessage) => {
        if (o.creatorXato) throw new Error('baza');
        yaratilgan.push(i.telegramUserId);
        return mijoz;
      },
    } as never),
    { list: async () => [{ tgUserId: '999' }] } as never,
  );
  return { uc, yaratilgan, suhbatlar, pushlar };
}

const xabar = (o: Partial<IncomingMessage> = {}): IncomingMessage => ({
  telegramAccountId: 'a1', telegramUserId: '555', accessHash: 'h', username: 'x', fullName: 'Aziz', phone: null,
  telegramMsgId: 1, text: 'Salom, kurs narxi?', media: null, receivedAt: new Date(), ...o,
});

(async () => {
  {
    const { uc, yaratilgan, suhbatlar, pushlar } = qur();
    const r = await uc.execute(xabar());
    check('notanish yozuvchi: reklama mijozi ochildi', yaratilgan, ['555']);
    check('suhbat ochildi va agent navbatiga tushdi', [r, suhbatlar.length, pushlar], ['imported', 1, [['cv1', 'Salom, kurs narxi?']]]);
  }
  {
    const { uc, yaratilgan } = qur();
    check('xizmat hisobi: e\'tiborsiz', [await uc.execute(xabar({ xizmatHisobi: true })), yaratilgan.length], ['ignored', 0]);
  }
  {
    const { uc, yaratilgan } = qur();
    check("o'z sotuv akkauntimiz yozdi: lead ochilmaydi",
      [await uc.execute(xabar({ telegramUserId: '999' })), yaratilgan.length], ['ignored', 0]);
    check("Telegram xizmat id (42777): lead ochilmaydi",
      [await uc.execute(xabar({ telegramUserId: '42777' })), yaratilgan.length], ['ignored', 0]);
  }
  {
    const { uc } = qur({ creator: false });
    check('yaratuvchi yo\'q: e\'tiborsiz', await uc.execute(xabar()), 'ignored');
  }
  {
    const { uc, pushlar } = qur({ creatorXato: true });
    check('yaratish xatosi: e\'tiborsiz, yiqilmaydi', [await uc.execute(xabar()), pushlar.length], ['ignored', 0]);
  }
  process.exitCode = failed ? 1 : 0;
})();
