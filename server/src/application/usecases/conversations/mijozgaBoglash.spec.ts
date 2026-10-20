import { MijozgaBoglashUseCase } from '@/application/usecases/conversations/MijozgaBoglashUseCase';
import type { Conversation } from '@/domain/entities/Conversation';
import type { Client } from '@/domain/entities/Client';
import type { Message } from '@/domain/entities/Message';
import {
  NOMALUM_SABAB_OPERATOR,
  NOMALUM_SABAB_TASDIQ,
  type NomalumSuhbat,
} from '@/domain/entities/NomalumSuhbat';
import type { TelegramIdentity } from '@/domain/repositories/IClientRepository';
import type { DomainEvent } from '@/domain/services/support';
import { ConflictError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:mijozga-boglash --workspace=server
 *
 * Bazaga chiqmaydi (hammasi soxta).
 *
 * NEGA KERAK: noma'lum suhbat haqiqiy mijozga ko'chiriladi. Tartib buzilsa
 * (masalan, `softDelete` ishlatilsa) ko'chirilayotgan suhbat va xabarlar ham
 * o'chib ketadi; birlashtirish kerak bo'lgan joyda `reassignClient` esa
 * UNIQUE xatosi beradi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOM_CONV = 'conv-nomalum';
const NOM_CLIENT = 'client-nomalum';
const REAL = 'client-real';
const MAVJUD = 'conv-mavjud';
const AKK = 'akk-1';

function qur(o: {
  mavjud?: boolean; nomalumEmas?: boolean; agentXato?: boolean; eskiTelegram?: boolean;
  /** Noma'lum suhbatdagi operator belgisi (`null` — belgi yo'q). */
  humanReason?: string | null;
} = {}) {
  const k = {
    calls: [] as string[],
    identity: null as null | { id: string; identity: TelegramIdentity; status: string },
    reassign: [] as Array<[string, string]>,
    moveAll: [] as Array<[string, string]>,
    convUpdates: [] as Array<[string, Record<string, unknown>]>,
    yopilganSuhbat: [] as string[],
    yopilganMijoz: [] as string[],
    nomalumPatch: [] as Array<Partial<NomalumSuhbat>>,
    audit: [] as Array<Record<string, unknown>>,
    events: [] as DomainEvent[],
    agentReply: [] as Array<[string, string]>,
  };
  const nomConv = {
    id: NOM_CONV, clientId: NOM_CLIENT, telegramAccountId: AKK, peerId: 'peer-777', peerAccessHash: 'hash-777',
    needsHuman: Boolean(o.humanReason), humanReason: o.humanReason ?? null, humanKind: null,
  } as unknown as Conversation;
  const mavjudConv = { id: MAVJUD, clientId: REAL, telegramAccountId: AKK, peerId: null, peerAccessHash: null } as unknown as Conversation;
  const nomClient = {
    id: NOM_CLIENT, nomalum: !o.nomalumEmas, telegramUserId: '777', telegramUsername: 'odam',
    telegramAccessHash: 'ah-777', telegramHashAccountId: AKK, telegramName: 'Odam',
  } as unknown as Client;
  const realClient = {
    id: REAL, nomalum: false,
    telegramUserId: o.eskiTelegram ? '555' : null, telegramUsername: o.eskiTelegram ? 'eski' : null,
  } as unknown as Client;

  const uc = new MijozgaBoglashUseCase({
    clients: {
      findById: async (id) => (id === NOM_CLIENT ? nomClient : id === REAL ? realClient : null),
      nomalumniYopish: async (id) => { k.calls.push('nomalumniYopish'); k.yopilganMijoz.push(id); },
      setTelegramIdentity: async (id, identity, status) => {
        k.calls.push('setTelegramIdentity');
        k.identity = { id, identity, status };
        return realClient;
      },
    },
    conversations: {
      findById: async (id) => (id === NOM_CONV ? nomConv : id === MAVJUD ? mavjudConv : null),
      findLiveByClientAndAccount: async (id, akk) => (id === REAL && o.mavjud && akk === AKK ? mavjudConv : null),
      reassignClient: async (id, clientId) => { k.calls.push('reassignClient'); k.reassign.push([id, clientId]); },
      yopish: async (id) => { k.calls.push('yopish'); k.yopilganSuhbat.push(id); },
      update: async (id, patch) => { k.calls.push('convUpdate'); k.convUpdates.push([id, patch as Record<string, unknown>]); return mavjudConv; },
    },
    messages: {
      moveAll: async (from, to) => { k.calls.push('moveAll'); k.moveAll.push([from, to]); return 3; },
      recentByConversation: async () => ([
        { direction: 'out', body: 'Shartnoma raqamingizni yozing', media: null, transcript: null },
        { direction: 'in', body: 'AB12345', media: null, transcript: null },
        { direction: 'note', body: 'ichki', media: null, transcript: null },
      ] as unknown as Message[]),
    },
    nomalum: {
      find: async () => ({ conversationId: NOM_CONV, holat: 'tasdiq_kutilmoqda' } as NomalumSuhbat),
      update: async (_id, patch) => { k.calls.push('nomalumUpdate'); k.nomalumPatch.push(patch); return {} as NomalumSuhbat; },
    },
    audit: { record: async (e) => { k.audit.push(e as unknown as Record<string, unknown>); } },
    events: { publish: (e) => { k.events.push(e); }, subscribe: () => () => undefined },
    agentReply: async (convId, text) => {
      k.agentReply.push([convId, text]);
      if (o.agentXato) throw new Error('agent yiqildi');
    },
  });
  return { uc, k };
}

async function main(): Promise<void> {
  // 1. birlashtir=false — suhbat haqiqiy mijozga ko'chiriladi.
  {
    const { uc, k } = qur();
    const r = await uc.execute({ conversationId: NOM_CONV, clientId: REAL, actor: 'operator-1', birlashtir: false });
    check('1: natija — o\'sha suhbat', r.conversationId === NOM_CONV);
    check('1: reassignClient', k.reassign.length === 1 && k.reassign[0]?.[0] === NOM_CONV && k.reassign[0]?.[1] === REAL);
    check('1: Telegram ma\'lumoti haqiqiy mijozga', k.identity?.id === REAL && k.identity.identity.telegramUserId === '777'
      && k.identity.identity.telegramAccessHash === 'ah-777' && k.identity.identity.telegramHashAccountId === AKK
      && k.identity.identity.telegramUsername === 'odam' && k.identity.identity.telegramName === 'Odam'
      && k.identity.status === 'found', JSON.stringify(k.identity));
    check('1: noma\'lum mijoz nomalumniYopish bilan yopildi', k.yopilganMijoz[0] === NOM_CLIENT);
    check('1: nomalumniYopish setTelegramIdentity dan oldin',
      k.calls.indexOf('nomalumniYopish') >= 0 && k.calls.indexOf('nomalumniYopish') < k.calls.indexOf('setTelegramIdentity'));
    check('1: reassignClient nomalumniYopish dan oldin', k.calls.indexOf('reassignClient') < k.calls.indexOf('nomalumniYopish'));
    check('1: holat boglandi', k.nomalumPatch.some((p) => p.holat === 'boglandi'));
    check('1: suhbat yopilmadi, xabar ko\'chmadi', k.yopilganSuhbat.length === 0 && k.moveAll.length === 0);
    check('1: audit', k.audit.length === 1 && k.audit[0]?.action === 'conversation.nomalum_boglandi' && k.audit[0]?.actor === 'operator-1'
      && (k.audit[0]?.payload as Record<string, unknown>)?.realClientId === REAL
      && (k.audit[0]?.payload as Record<string, unknown>)?.unknownClientId === NOM_CLIENT
      && (k.audit[0]?.payload as Record<string, unknown>)?.birlashtir === false, JSON.stringify(k.audit));
    check('1: conversation.updated', k.events.some((e) => e.type === 'conversation.updated' && e.conversationId === NOM_CONV));
    check('1: agentReply oxirgi kiruvchi matn bilan', k.agentReply.length === 1 && k.agentReply[0]?.[0] === NOM_CONV && k.agentReply[0]?.[1] === 'AB12345',
      JSON.stringify(k.agentReply));
  }

  // 2. birlashtir=true — mavjud suhbatga qo'shiladi.
  {
    const { uc, k } = qur({ mavjud: true });
    const r = await uc.execute({ conversationId: NOM_CONV, clientId: REAL, actor: 'operator-1', birlashtir: true });
    check('2: natija — mavjud suhbat', r.conversationId === MAVJUD);
    check('2: moveAll', k.moveAll.length === 1 && k.moveAll[0]?.[0] === NOM_CONV && k.moveAll[0]?.[1] === MAVJUD);
    const upd = k.convUpdates.find(([id]) => id === MAVJUD)?.[1];
    check('2: mavjud suhbatga peer', upd?.peerId === 'peer-777' && upd?.peerAccessHash === 'hash-777', JSON.stringify(upd));
    check('2: noma\'lum suhbat yopildi', k.yopilganSuhbat[0] === NOM_CONV);
    check('2: noma\'lum mijoz yopildi', k.yopilganMijoz[0] === NOM_CLIENT);
    check('2: reassignClient chaqirilmadi', k.reassign.length === 0);
    check('2: Telegram ma\'lumoti haqiqiy mijozga', k.identity?.id === REAL && k.identity.identity.telegramUserId === '777');
    check('2: tartib: moveAll → update → yopish → nomalumniYopish → setTelegramIdentity',
      ['moveAll', 'convUpdate', 'yopish', 'nomalumniYopish', 'setTelegramIdentity']
        .every((c, i, a) => i === 0 || k.calls.indexOf(a[i - 1] ?? '') < k.calls.indexOf(c)), k.calls.join(','));
    check('2: audit birlashtir=true', (k.audit[0]?.payload as Record<string, unknown>)?.birlashtir === true);
    check('2: agentReply mavjud suhbatga', k.agentReply[0]?.[0] === MAVJUD);
    check('2: conversation.updated mavjud suhbat uchun', k.events.some((e) => e.type === 'conversation.updated' && e.conversationId === MAVJUD));
  }

  // 3. birlashtir=false, lekin shu akkauntda suhbat bor → ConflictError, hech narsa o'zgarmaydi.
  {
    const { uc, k } = qur({ mavjud: true });
    let xato: unknown = null;
    try { await uc.execute({ conversationId: NOM_CONV, clientId: REAL, actor: 'operator-1', birlashtir: false }); } catch (e) { xato = e; }
    check('3: ConflictError', xato instanceof ConflictError, String(xato));
    check('3: hech narsa o\'zgarmadi', k.calls.length === 0 && k.audit.length === 0 && k.agentReply.length === 0, k.calls.join(','));
  }

  // 4. Mijoz noma'lum emas → ConflictError, hech narsa o'zgarmaydi.
  {
    const { uc, k } = qur({ nomalumEmas: true });
    let xato: unknown = null;
    try { await uc.execute({ conversationId: NOM_CONV, clientId: REAL, actor: 'op', birlashtir: false }); } catch (e) { xato = e; }
    check('4: noma\'lum bo\'lmagan suhbat rad etildi', xato instanceof ConflictError && k.calls.length === 0);
  }

  // 4b. Oldingi Telegram hisobi auditda saqlanadi (operator almashtirdi).
  {
    const { uc, k } = qur({ eskiTelegram: true });
    await uc.execute({ conversationId: NOM_CONV, clientId: REAL, actor: 'op', birlashtir: false });
    const old = (k.audit[0]?.payload as Record<string, unknown>)?.oldingiTelegram as Record<string, unknown> | null;
    check('4b: auditda oldingi Telegram', old?.telegramUserId === '555' && old?.telegramUsername === 'eski', JSON.stringify(old));
  }
  {
    const { uc, k } = qur();
    await uc.execute({ conversationId: NOM_CONV, clientId: REAL, actor: 'op', birlashtir: false });
    check('4c: oldingi Telegram yo\'q → null', (k.audit[0]?.payload as Record<string, unknown>)?.oldingiTelegram === null);
  }

  // 5. agentReply yiqilsa bog'lash bekor qilinmaydi.
  {
    const { uc, k } = qur({ agentXato: true });
    let otildi = false;
    try { await uc.execute({ conversationId: NOM_CONV, clientId: REAL, actor: 'op', birlashtir: false }); } catch { otildi = true; }
    check('5: agentReply xatosi rad etmaydi', !otildi && k.reassign.length === 1);
  }

  // 6. Operator tasdiqladi (reassign): noma'lum oqim belgisi tushiriladi —
  // aks holda `canAgentReply` yopiq qolib, bog'langandan keyingi javob jim
  // tashlanardi va odam javobsiz qolardi.
  for (const sabab of [NOMALUM_SABAB_TASDIQ, NOMALUM_SABAB_OPERATOR]) {
    const { uc, k } = qur({ humanReason: sabab });
    await uc.execute({ conversationId: NOM_CONV, clientId: REAL, actor: 'op', birlashtir: false });
    const tushdi = k.convUpdates.find(([id, p]) => id === NOM_CONV && p.needsHuman === false);
    check(`6: «${sabab.slice(0, 30)}…» — needsHuman/humanReason/humanKind tozalandi`,
      tushdi?.[1].humanReason === null && tushdi?.[1].humanKind === null, JSON.stringify(k.convUpdates));
    check('6: javob navbatga qo\'yildi', k.agentReply.length === 1);
  }

  // 7. Boshqa sabab (chek, agent xatosi) — bog'lash uni tushirmaydi: operatorniki.
  {
    const { uc, k } = qur({ humanReason: 'Chekni tekshiring' });
    await uc.execute({ conversationId: NOM_CONV, clientId: REAL, actor: 'op', birlashtir: false });
    check('7: begona sabab — belgi tegilmadi', !k.convUpdates.some(([id, p]) => id === NOM_CONV && 'needsHuman' in p),
      JSON.stringify(k.convUpdates));
  }

  // 8. Birlashtirish: noma'lum qator `boglandi` bo'ladi va bu YOPISHDAN OLDIN.
  {
    const { uc, k } = qur({ mavjud: true, humanReason: NOMALUM_SABAB_TASDIQ });
    await uc.execute({ conversationId: NOM_CONV, clientId: REAL, actor: 'op', birlashtir: true });
    check('8: holat boglandi', k.nomalumPatch.some((p) => p.holat === 'boglandi' && p.topilganClientId === REAL),
      JSON.stringify(k.nomalumPatch));
    check('8: nomalumUpdate yopishdan oldin', k.calls.indexOf('nomalumUpdate') >= 0
      && k.calls.indexOf('nomalumUpdate') < k.calls.indexOf('yopish'), k.calls.join(','));
    check('8: mavjud suhbat belgisiga tegilmadi', !k.convUpdates.some(([id, p]) => id === MAVJUD && 'needsHuman' in p));
  }

  if (failed) {
    console.error(`\n${failed} ta tekshiruv yiqildi`);
    process.exit(1);
  }
  console.log('\nHammasi o\'tdi');
}

void main();
