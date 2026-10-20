import bigInt from 'big-integer';
import { Api } from 'teleproto';
import { kiruvchigaQabul, peerKindOf } from '@/infrastructure/telegram/kiruvchiFiltr';

/** Qo'lda: npm run test:kiruvchi-filtr --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};
check('shaxsiy foydalanuvchi', kiruvchigaQabul({ peerKind: 'user', senderIsUser: true, senderIsBot: false, senderId: '42' }), true);
check('guruhdagi foydalanuvchi', kiruvchigaQabul({ peerKind: 'group', senderIsUser: true, senderIsBot: false, senderId: '42' }), false);
check('kanal/supergruppa', kiruvchigaQabul({ peerKind: 'channel', senderIsUser: true, senderIsBot: false, senderId: '42' }), false);
check('bot', kiruvchigaQabul({ peerKind: 'user', senderIsUser: true, senderIsBot: true, senderId: '42' }), false);
check('Telegram xizmati 777000', kiruvchigaQabul({ peerKind: 'user', senderIsUser: true, senderIsBot: false, senderId: '777000' }), false);
check('foydalanuvchi emas', kiruvchigaQabul({ peerKind: 'user', senderIsUser: false, senderIsBot: false, senderId: '42' }), false);
check('noma\'lum peer turi (null) — rad', kiruvchigaQabul({ peerKind: null, senderIsUser: true, senderIsBot: false, senderId: '42' }), false);
check('peerKindOf: PeerUser → user', peerKindOf(new Api.PeerUser({ userId: bigInt(42) })), 'user');
check('peerKindOf: PeerChat → group', peerKindOf(new Api.PeerChat({ chatId: bigInt(42) })), 'group');
check('peerKindOf: PeerChannel → channel', peerKindOf(new Api.PeerChannel({ channelId: bigInt(42) })), 'channel');
check('peerKindOf: peerId yo\'q → null (user EMAS)', peerKindOf(undefined), null);
check('peerKindOf: noma\'lum obyekt → null', peerKindOf({ className: 'PeerYangi' } as unknown as Api.TypePeer), null);
process.exitCode = failed ? 1 : 0;
