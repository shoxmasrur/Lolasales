import { pickUserById } from '@/infrastructure/telegram/peerSelection';

/**
 * Qo'lda ishga tushiriladi: npm run test:peer-selection
 *
 * Bu test real xatoni qo'riqlaydi: mijozning raqami (+998999889992)
 * Telegramda umuman yo'q edi, lekin tizim uni @ulugbek_cto bilan bog'ladi —
 * chunki eski kod `users[0]` ni olardi.
 */
const OTHER = { id: 111, username: 'ulugbek_cto' };
const TARGET = { id: 222, username: 'mijoz' };
const SELF = { id: 999, username: 'bizning_akkaunt', self: true };

interface Case {
  name: string;
  users: Array<{ id: number; username: string; self?: boolean }> | undefined;
  targetId: unknown;
  expect: string | null;
}

const CASES: Case[] = [
  {
    name: 'raqam Telegramda yo\'q — imported bo\'sh, users da begona odam',
    users: [OTHER],
    targetId: undefined,
    expect: null,
  },
  {
    name: 'raqam topildi — aynan o\'sha odam qaytadi',
    users: [OTHER, TARGET],
    targetId: 222,
    expect: 'mijoz',
  },
  {
    name: 'javobda begona odam birinchi turibdi — baribir to\'g\'risi tanlanadi',
    users: [OTHER, SELF, TARGET],
    targetId: 222,
    expect: 'mijoz',
  },
  {
    name: 'id mos kelmadi — hech kim qaytmaydi',
    users: [OTHER],
    targetId: 222,
    expect: null,
  },
  {
    name: 'akkauntning o\'zi topildi — mijoz sifatida qaytarilmaydi',
    users: [SELF],
    targetId: 999,
    expect: null,
  },
  {
    name: 'users bo\'sh',
    users: [],
    targetId: 222,
    expect: null,
  },
  {
    name: 'users umuman yo\'q',
    users: undefined,
    targetId: 222,
    expect: null,
  },
  {
    name: 'id satr sifatida kelgan (Telegram BigInt qaytaradi)',
    users: [TARGET],
    targetId: '222',
    expect: 'mijoz',
  },
];

let failed = 0;
for (const c of CASES) {
  const picked = pickUserById(c.users, c.targetId);
  const actual = picked?.username ?? null;
  const ok = actual === c.expect;
  if (!ok) failed += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${c.name} → ${actual ?? 'null'}${ok ? '' : `  (kutilgan: ${c.expect ?? 'null'})`}`,
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
