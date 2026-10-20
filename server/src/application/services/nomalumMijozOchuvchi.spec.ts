import { NomalumMijozOchuvchi, nomalumIsmi } from '@/application/services/NomalumMijozOchuvchi';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { INomalumSuhbatRepository } from '@/domain/repositories/INomalumSuhbatRepository';
import { NOMALUM_SABAB_ESKI_XABAR, NOMALUM_SABAB_TASDIQ, type NomalumSuhbat } from '@/domain/entities/NomalumSuhbat';
import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import type { IncomingMessage } from '@/domain/services/ITelegramGateway';

/** Qo'lda: npm run test:nomalum-ochuvchi --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const created: unknown[] = [];
const identities: unknown[] = [];
const ensures: unknown[][] = [];
const clients = {
  create: async (nc: unknown) => {
    created.push(nc);
    return { id: 'k1', ...(nc as object) };
  },
  setTelegramIdentity: async (...args: unknown[]) => {
    identities.push(args);
    return { id: 'k1', telegramUserId: 'u1', nomalum: true };
  },
} as unknown as Pick<IClientRepository, 'create' | 'setTelegramIdentity'>;
let holat: NomalumSuhbat['holat'] = 'kutilmoqda';
const holatPatchlari: unknown[] = [];
const nomalum = {
  ensure: async (...args: unknown[]) => {
    ensures.push(args);
  },
  find: async () => ({ conversationId: 's1', holat }),
  update: async (_id: string, patch: unknown) => { holatPatchlari.push(patch); },
} as unknown as Pick<INomalumSuhbatRepository, 'ensure' | 'find' | 'update'>;

const incoming = {
  telegramAccountId: 'a1',
  telegramUserId: 'u1',
  accessHash: 'h1',
  username: 'ali',
  fullName: 'Ali Valiyev',
  phone: '998901234567',
  telegramMsgId: 1,
  text: 'salom',
  media: null,
  receivedAt: new Date(),
} as unknown as IncomingMessage;

async function main(): Promise<void> {
  const ochuvchi = new NomalumMijozOchuvchi(clients, nomalum);
  const client = await ochuvchi.och(incoming);
  check('create: ism va nomalum, phone yo\'q', created[0], { fullName: 'Ali Valiyev', nomalum: true });
  check('qaytgan client telegramUserId bilan', client.telegramUserId, 'u1');
  check('setTelegramIdentity', identities[0], [
    'k1',
    {
      telegramUserId: 'u1',
      telegramUsername: 'ali',
      telegramAccessHash: 'h1',
      telegramHashAccountId: 'a1',
      telegramName: 'Ali Valiyev',
    },
    'found',
  ]);
  check('nomalumIsmi: fullName', nomalumIsmi({ fullName: 'Ali Valiyev', username: null }), 'Ali Valiyev');
  check('nomalumIsmi: username', nomalumIsmi({ fullName: '', username: 'ali' }), '@ali');
  check('nomalumIsmi: bo\'sh', nomalumIsmi({ fullName: ' ', username: null }), "Noma'lum mijoz");
  await ochuvchi.suhbatniBelgila('s1', '998901234567');
  check('ensure normallashtirilgan', ensures[0], ['s1', '+998901234567']);
  await ochuvchi.suhbatniBelgila('s1', null);
  check('ensure null', ensures[1], ['s1', null]);

  // ── Xizmat yozuvchilari (I5a): noma'lum mijoz ochilmaydi ──
  const NOW = new Date('2026-10-15T10:00:00Z');
  const akkauntlar = { list: async () => [{ tgUserId: '9001' }, { tgUserId: null }] as unknown as TelegramAccount[] };
  const toliq = new NomalumMijozOchuvchi(clients, nomalum, akkauntlar, () => NOW);
  const xizmat = async (telegramUserId: string, xizmatHisobi?: boolean) =>
    toliq.xizmatYozuvchisimi({ telegramUserId, xizmatHisobi });
  check('xizmat: 777000 (Telegram kodlari)', await xizmat('777000'), true);
  check('xizmat: 42777 (Telegram yordam)', await xizmat('42777'), true);
  check('xizmat: verified/support bayrog\'i', await xizmat('555', true), true);
  check('xizmat: o\'z akkauntimiz', await xizmat('9001'), true);
  check('xizmat: oddiy notanish — yo\'q', await xizmat('555'), false);
  check('xizmat: akkauntlarsiz — faqat ro\'yxat', await ochuvchi.xizmatYozuvchisimi({ telegramUserId: '9001' }), false);

  // ── Eski xabar (I5b) ──
  check('eski: 11 daqiqa — eski', toliq.eskimi(new Date(NOW.getTime() - 11 * 60_000)), true);
  check('eski: 9 daqiqa — yangi', toliq.eskimi(new Date(NOW.getTime() - 9 * 60_000)), false);
  // Natija — chaqiruvchi qo'yadigan operator sababi (`null` — belgi kerak emas).
  check('eski: kutilmoqda → operatorda, eski xabar sababi', [await toliq.eskiniOperatorga('s1'), (holatPatchlari[0] as { holat?: string })?.holat],
    [NOMALUM_SABAB_ESKI_XABAR, 'operatorda']);
  holat = 'tasdiq_kutilmoqda';
  holatPatchlari.length = 0;
  check('eski: tasdiq_kutilmoqda — tegilmaydi (tasdiq tugmasi qoladi)', [await toliq.eskiniOperatorga('s1'), holatPatchlari.length],
    [null, 0]);
  // Hujjat kutilmoqda: eski matn jim yo'qolmasin — operator chaqiriladi,
  // holat (topilgan mijoz bilan) qoladi.
  holat = 'hujjat_kutilmoqda';
  holatPatchlari.length = 0;
  check('eski: hujjat_kutilmoqda — tasdiq sababi, holat tegilmaydi', [await toliq.eskiniOperatorga('s1'), holatPatchlari.length],
    [NOMALUM_SABAB_TASDIQ, 0]);
  console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
  process.exitCode = failed ? 1 : 0;
}
void main();
