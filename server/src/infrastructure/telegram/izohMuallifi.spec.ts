import { izohMuallifi, type IzohUser } from '@/infrastructure/telegram/izohMuallifi';

/** Qo'lda: npm run test:izoh-muallifi --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const USERS = new Map<string, IzohUser>([
  ['5', { id: '5', accessHash: 'h5', username: 'ali', firstName: 'Ali', lastName: 'Valiyev', bot: false }],
  ['6', { id: '6', accessHash: 'h6', username: 'sobir', firstName: null, lastName: null, bot: false }],
  ['7', { id: '7', accessHash: 'h7', username: 'lola_bot', firstName: 'Bot', lastName: null, bot: true }],
]);
const CHATS = new Map<string, { title: string }>([['9', { title: 'Lola kanal' }]]);

check('foydalanuvchi', izohMuallifi({ kind: 'user', id: '5' }, USERS, CHATS)?.kind, 'user');
check('access_hash saqlanadi', (izohMuallifi({ kind: 'user', id: '5' }, USERS, CHATS) as any).peer.accessHash, 'h5');
check('to\'liq ism', (izohMuallifi({ kind: 'user', id: '5' }, USERS, CHATS) as any).fullName, 'Ali Valiyev');
check('ismsiz — @username', (izohMuallifi({ kind: 'user', id: '6' }, USERS, CHATS) as any).fullName, '@sobir');
check('kanal nomidan', izohMuallifi({ kind: 'channel', id: '9' }, USERS, CHATS), { kind: 'anonim', title: 'Lola kanal' });
check('bot', izohMuallifi({ kind: 'user', id: '7' }, USERS, CHATS), null);
check('fromId yo\'q', izohMuallifi({ kind: 'none', id: '' }, USERS, CHATS), { kind: 'anonim', title: 'Anonim' });
check('foydalanuvchi ro\'yxatda yo\'q', izohMuallifi({ kind: 'user', id: '99' }, USERS, CHATS), { kind: 'anonim', title: 'Anonim' });

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
