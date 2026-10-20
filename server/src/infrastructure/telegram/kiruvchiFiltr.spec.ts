import { kiruvchigaQabul } from '@/infrastructure/telegram/kiruvchiFiltr';

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
process.exitCode = failed ? 1 : 0;
