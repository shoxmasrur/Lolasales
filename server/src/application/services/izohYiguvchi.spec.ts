import { IzohYiguvchi } from '@/application/services/IzohYiguvchi';
import type { ChannelComment, ChannelCommentsResult, ResolvedPeer } from '@/domain/services/ITelegramGateway';
import { TelegramError } from '@/shared/errors';

/** Qo'lda: npm run test:izoh-yiguvchi --workspace=server (bazasiz, Telegramsiz). */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const peer = (id: string): ResolvedPeer => ({ telegramUserId: id, accessHash: `h${id}`, username: null, firstName: `I${id}`, lastName: null });
const izoh = (id: number, postId: number, text: string, uid: string): ChannelComment => ({
  id, postId, date: new Date(Date.UTC(2026, 9, 20, 10, id)), text,
  author: { kind: 'user', peer: peer(uid), fullName: `I${uid}` },
});

function qurish(o: { floodOnPost?: number; mavjud?: string[] } = {}) {
  const iz = { getComments: [] as Array<[number, number]>, guruhdan: [] as unknown[], campaigns: [] as any[], audit: [] as any[], sent: 0 };
  const telegram = {
    listDialogs: async () => [{ peerId: '900', accessHash: 'kh', kind: 'channel', title: 'Lola kanal' }],
    listChannelPosts: async () => [
      { id: 1, date: new Date(), text: 'a', repliesCount: 3 },
      { id: 2, date: new Date(), text: 'b', repliesCount: 0 },
      { id: 3, date: new Date(), text: 'c', repliesCount: 2 },
    ],
    getComments: async (_a: string, ch: { peerId: string; accessHash: string | null }, postId: number, opt: { limit: number }) => {
      iz.getComments.push([postId, opt.limit]);
      if (ch.accessHash !== 'kh') throw new Error('hash yo\'q');
      if (postId === o.floodOnPost) throw new TelegramError('Telegram 30 soniya kutishni so\'radi', 'FLOOD_WAIT', 30);
      const r: ChannelCommentsResult = postId === 1
        ? [izoh(1, 1, 'menga xabar bering', '11'), izoh(2, 1, 'zo\'r', '12')]
        : [izoh(3, 3, '+', '13')];
      return r.slice(0, opt.limit);
    },
    sendMessage: async () => { iz.sent += 1; },
  };
  const clients = { existingTelegramUserIds: async (ids: string[]) => new Set(ids.filter((i) => (o.mavjud ?? []).includes(i))) };
  let n = 0;
  const mijoz = {
    guruhdan: async (i: { peer: ResolvedPeer }) => {
      iz.guruhdan.push(i);
      const created = !(o.mavjud ?? []).includes(i.peer.telegramUserId);
      return { client: { id: `c${++n}` } as any, created };
    },
  };
  const campaigns = { execute: async (input: any) => { iz.campaigns.push(input); return { campaign: { id: 'k1' } as any, targetsAdded: input.filters.clientIds.length }; } };
  const settings = { get: async () => ({ izohKalitSozlari: ['menga xabar bering', '+'], izohLimit: 500 }) as any };
  const audit = { record: async (e: unknown) => { iz.audit.push(e); }, list: async () => ({ items: [], total: 0 }) } as any;
  const clock = { now: () => new Date(), todayIso: () => '2026-10-20' };
  const y = new IzohYiguvchi(telegram as any, clients as any, mijoz as any, campaigns as any, settings as any, audit, clock);
  return { y, iz };
}

const main = async (): Promise<void> => {
  {
    const { y, iz } = qurish();
    const r = await y.kommentlar('a1', '900', 'all', 7, false);
    check('"all": faqat izohi bor postlar', iz.getComments.map((x) => x[0]), [1, 3]);
    check('kalit so\'z filtri', r.items.map((x) => x.id), [3, 1]);
    check('to\'liq', r.partial, null);
  }
  {
    const { y } = qurish();
    const r = await y.kommentlar('a1', '900', [1], null, true);
    check('filtrsiz — hammasi', r.items.length, 2);
  }
  {
    const { y, iz } = qurish({ floodOnPost: 3 });
    const r = await y.kommentlar('a1', '900', [1, 3], null, false);
    check('FLOOD_WAIT: yig\'ilgani qaytadi', r.items.map((x) => x.id), [1]);
    check('FLOOD_WAIT: bayroq', r.partial?.retryAfterSec, 30);
    check('FLOOD_WAIT: keyingi post so\'ralmaydi', iz.getComments.length, 2);
  }
  {
    const { y } = qurish({ floodOnPost: 1 });
    let xato = '';
    try { await y.kommentlar('a1', '900', [1], null, false); } catch (e) { xato = (e as TelegramError).telegramCode; }
    check('FLOOD_WAIT birinchi postda — xato', xato, 'FLOOD_WAIT');
  }
  {
    const { y } = qurish();
    let kod = '';
    try { await y.kommentlar('a1', '999', 'all', null, false); } catch (e) { kod = (e as { code: string }).code; }
    check('noma\'lum kanal', kod, 'NOT_FOUND');
  }
  {
    const { y, iz } = qurish({ mavjud: ['12'] });
    const r = await y.mijozQil('a1', 'Lola kanal', [
      { peer: peer('11'), fullName: 'I11', text: 'menga xabar bering' },
      { peer: peer('12'), fullName: 'I12', text: '+' },
    ], 'admin@x.uz');
    check('natija', r, { created: 1, existing: 1, campaignId: 'k1' });
    check('guruhdan: akkaunt va manba', (iz.guruhdan[0] as any), {
      accountId: 'a1', peer: peer('11'), fullName: 'I11', sourceGroup: 'Lola kanal', sourceComment: 'menga xabar bering',
    });
    check('kampaniya nomi', iz.campaigns[0].name, 'Kanal: Lola kanal — 2026-10-20');
    check('kampaniya faqat yangi mijozlar', iz.campaigns[0].filters, { clientIds: ['c1'], limit: 1 });
    check('darhol ishga tushadi', iz.campaigns[0].startNow, true);
    check('audit', iz.audit.map((a: any) => a.action), ['comments.imported']);
    check('hech narsa yuborilmadi', iz.sent, 0);
  }
  {
    const { y, iz } = qurish({ mavjud: ['11'] });
    const r = await y.mijozQil('a1', 'Lola kanal', [{ peer: peer('11'), fullName: 'I11', text: '+' }], 'admin@x.uz');
    check('yangi yo\'q — kampaniya yo\'q', [r.campaignId, iz.campaigns.length], [null, 0]);
    check('yangi yo\'q — audit baribir', iz.audit.length, 1);
  }

  console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
  process.exitCode = failed ? 1 : 0;
};
void main();
