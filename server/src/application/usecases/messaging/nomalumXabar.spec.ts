import type { ReplyDebouncer } from '@/application/services/ReplyDebouncer';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { IncomingMediaProcessor, ProcessedMedia } from '@/application/services/IncomingMediaProcessor';
import type { PaymentCheckService } from '@/application/services/PaymentCheckService';
import { NomalumMijozOchuvchi } from '@/application/services/NomalumMijozOchuvchi';
import { HandleIncomingMessageUseCase } from '@/application/usecases/messaging/HandleIncomingMessageUseCase';
import type { Conversation } from '@/domain/entities/Conversation';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { INomalumSuhbatRepository } from '@/domain/repositories/INomalumSuhbatRepository';
import type { IncomingMessage } from '@/domain/services/ITelegramGateway';
import type { IEventBus } from '@/domain/services/support';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import { NOMALUM_SABAB_ESKI_XABAR, NOMALUM_SABAB_HUJJAT, NOMALUM_SABAB_OPERATOR, NOMALUM_SABAB_TASDIQ, nomalumSababimi } from '@/domain/entities/NomalumSuhbat';
import { NomalumHujjatQabul, MATN_HUJJAT_QABUL } from '@/application/services/NomalumHujjatQabul';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';

/** Qo'lda: npm run test:nomalum-xabar --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

interface Muhit {
  /** `findByPeer` qaytaradigan suhbat (boshqa mijozniki bo'lishi mumkin). */
  peerSuhbat?: Conversation | null;
  /** Mijozning o'z suhbati (`findByClientId`). */
  ozSuhbat?: Conversation | null;
  /** Ma'lum (haqiqiy) mijoz — `findByTelegramUserId` uni topadi. */
  malumMijoz?: boolean;
  /** O'z akkauntlarimizning Telegram id'lari. */
  akkauntIdlari?: string[];
  holat?: string;
  /** Suhbat maydonlari (`canAgentReply` uchun). */
  conv?: Partial<Conversation>;
}

const NOW = new Date('2026-10-15T10:00:00Z');

function muhit(processed: ProcessedMedia | null, ensureXato = false, o: Muhit = {}) {
  let creates = 0;
  const yozilganSuhbat: string[] = [];
  const suhbatPatchlari: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const holatPatchlari: unknown[] = [];
  let identities = 0;
  let belgilar = 0;
  let pushlar = 0;
  let chekOchildi = 0;
  let holat = o.holat ?? 'kutilmoqda';
  const uzilganlar: string[] = [];
  const processOpts: unknown[] = [];
  const yuborilgan: Array<{ body: string; author: string; meta?: Record<string, unknown> }> = [];
  const suhbat = {
    id: 'cv1', clientId: 'k1', peerId: null, state: 'negotiating', agentEnabled: true, needsHuman: false, ...o.conv,
  } as unknown as Conversation;
  const clients = {
    findByTelegramUserId: async () => (o.malumMijoz ? { id: 'real1', telegramUserId: 'u1', nomalum: false } : null),
    findByPhone: async () => null,
    create: async () => {
      creates += 1;
      return { id: 'k1', telegramUserId: null, nomalum: true };
    },
    setTelegramIdentity: async () => {
      identities += 1;
      return { id: 'k1', telegramUserId: 'u1', nomalum: true };
    },
  } as unknown as IClientRepository;
  const nomalum = {
    ensure: async () => {
      belgilar += 1;
      if (ensureXato) throw new Error('db');
    },
    find: async () => ({ conversationId: 'cv1', holat, topilganClientId: 'real7', agentJavoblari: 1 }),
    update: async (_id: string, patch: { holat?: string }) => {
      holatPatchlari.push(patch);
      if (patch.holat) holat = patch.holat;
    },
    // Haqiqiy repo kabi atomar: `await` dan keyin tekshirib-yozish bitta qadamda.
    holatniAlmashtir: async (_id: string, eski: string, yangi: string) => {
      await Promise.resolve();
      if (holat !== eski) return false;
      holat = yangi;
      holatPatchlari.push({ holat: yangi });
      return true;
    },
  } as unknown as INomalumSuhbatRepository;
  const conversations = {
    findByPeer: async () => o.peerSuhbat ?? null,
    findByClientId: async () => o.ozSuhbat ?? null,
    findById: async () => suhbat,
    create: async () => suhbat,
    update: async (id: string, patch: Record<string, unknown>) => {
      suhbatPatchlari.push({ id, patch });
      return suhbat;
    },
    touchInbound: async () => undefined,
  } as unknown as IConversationRepository;
  const useCase = new HandleIncomingMessageUseCase(
    clients,
    { findByClientId: async () => [] } as unknown as IContractRepository,
    conversations,
    {
      existsTelegramMessage: async () => false,
      create: async (m: { conversationId: string }) => {
        yozilganSuhbat.push(m.conversationId);
        return { id: 'm1' };
      },
    } as unknown as IMessageRepository,
    { push: () => void (pushlar += 1) } as unknown as ReplyDebouncer,
    { get: async () => ({ killSwitch: false }) } as unknown as RuntimeSettings,
    { process: async (_m: unknown, _c: string, opts?: unknown) => { processOpts.push(opts ?? null); return processed; } } as unknown as IncomingMediaProcessor,
    { publish: () => undefined } as unknown as IEventBus,
    { openReceiptReview: async () => void (chekOchildi += 1) } as unknown as PaymentCheckService,
    null,
    new NomalumMijozOchuvchi(
      clients, nomalum,
      { list: async () => (o.akkauntIdlari ?? []).map((tgUserId) => ({ tgUserId })) } as unknown as Pick<ITelegramAccountRepository, 'list'>,
      () => NOW,
    ),
    new NomalumHujjatQabul({
      nomalum, conversations,
      dispatcher: {
        send: async (opt) => {
          yuborilgan.push({ body: opt.body, author: opt.author, meta: opt.meta as Record<string, unknown> | undefined });
          return {} as never;
        },
      } as Pick<MessageDispatcher, 'send'>,
      events: { publish: () => undefined, subscribe: () => () => undefined },
      abortAgent: (id: string) => void uzilganlar.push(id),
    }),
  );
  return {
    useCase,
    c: () => ({ creates, identities, belgilar, pushlar, chekOchildi }),
    yozilganSuhbat, suhbatPatchlari, holatPatchlari, yuborilgan, uzilganlar, processOpts,
  };
}

const xabar = {
  telegramAccountId: 'a1',
  telegramUserId: 'u1',
  accessHash: null,
  username: null,
  fullName: 'Begona',
  phone: '998901234567',
  telegramMsgId: 1,
  text: 'salom',
  media: null,
  receivedAt: NOW,
} as unknown as IncomingMessage;

async function main(): Promise<void> {
  {
    const m = muhit(null);
    const r = await m.useCase.execute(xabar);
    check('matn: imported', r, 'imported');
    // Matn debouncerga tushadi (u noma'lum agentga yo'naltiradi); chek ochilmaydi.
    check('matn: bir marta ochildi, identifikator bir marta, belgi, debouncerga bir marta, chek yo\'q', m.c(),
      { creates: 1, identities: 1, belgilar: 1, pushlar: 1, chekOchildi: 0 });
  }
  {
    const foto = {
      media: { kind: 'photo' }, agentText: '[chek]', needsReview: true, reviewReason: 'x',
      receiptSource: 'tolov', imageKind: 'tolov', imageStatus: 'done', imageNote: null,
      transcript: null, transcriptStatus: 'none',
    } as unknown as ProcessedMedia;
    const m = muhit(foto);
    // `media` bo'lmasa ishlov beruvchi chaqirilmaydi — rasm xabari aynan rasm bo'lsin.
    await m.useCase.execute({ ...xabar, media: { kind: 'photo' } } as unknown as IncomingMessage);
    check('rasm: chek tekshiruvi ochilmadi, agent yo\'q (operator ko\'radi)', m.c().chekOchildi + m.c().pushlar, 0);
  }
  {
    const m = muhit(null, true);
    check('belgi yiqilsa ham imported', await m.useCase.execute(xabar), 'imported');
  }
  // ── I4: noma'lum yozuvchi boshqa mijoz suhbatiga tushmaydi ──
  {
    const begona = { id: 'cvX', clientId: 'real9', peerId: 'u1', state: 'negotiating' } as unknown as Conversation;
    const m = muhit(null, false, { peerSuhbat: begona });
    await m.useCase.execute(xabar);
    check('I4: peer boshqa mijozniki — xabar o\'z suhbatiga (cv1), cvX ga emas', m.yozilganSuhbat, ['cv1']);
  }
  {
    const oz = { id: 'cvOz', clientId: 'k1', peerId: 'u1', state: 'negotiating' } as unknown as Conversation;
    const begona = { id: 'cvX', clientId: 'real9', peerId: 'u1', state: 'negotiating' } as unknown as Conversation;
    const m = muhit(null, false, { peerSuhbat: begona, ozSuhbat: oz });
    await m.useCase.execute(xabar);
    check('I4: o\'z suhbati bor — o\'shanga yoziladi', m.yozilganSuhbat, ['cvOz']);
  }
  {
    // Ma'lum mijoz uchun eski xulq o'zgarmaydi: peer bo'yicha topilgan suhbat.
    const peer = { id: 'cvPeer', clientId: 'real1', peerId: 'u1', state: 'negotiating' } as unknown as Conversation;
    const m = muhit(null, false, { malumMijoz: true, peerSuhbat: peer });
    await m.useCase.execute(xabar);
    check('I4: ma\'lum mijoz — peer suhbati (eski xulq)', [m.yozilganSuhbat, m.c().creates], [['cvPeer'], 0]);
  }

  // ── I5a: Telegram xizmati va o'z akkauntimiz — ochilmaydi ──
  for (const [nom, tgId, akk, bayroq] of [
    ['777000', '777000', [], false],
    ['42777', '42777', [], false],
    ['o\'z akkauntimiz', 'u1', ['u1'], false],
    ['verified/support', 'u1', [], true],
  ] as Array<[string, string, string[], boolean]>) {
    const m = muhit(null, false, { akkauntIdlari: akk });
    const r = await m.useCase.execute({ ...xabar, telegramUserId: tgId, xizmatHisobi: bayroq } as IncomingMessage);
    check(`I5a: ${nom} — ignored, mijoz ochilmadi, agent yo'q`, [r, m.c().creates, m.c().pushlar, m.yozilganSuhbat.length], ['ignored', 0, 0, 0]);
  }

  // ── I5b: eski xabar (deploydan keyin) — agentga berilmaydi, operatorga ──
  {
    const m = muhit(null);
    const r = await m.useCase.execute({ ...xabar, receivedAt: new Date(NOW.getTime() - 30 * 60_000) } as IncomingMessage);
    check('I5b: eski xabar saqlandi, debouncerga tushmadi', [r, m.yozilganSuhbat, m.c().pushlar], ['imported', ['cv1'], 0]);
    check('I5b: holat operatorda', (m.holatPatchlari[0] as { holat?: string })?.holat, 'operatorda');
    check('I5b: needsHuman + eski xabar sababi', m.suhbatPatchlari.some((p) => p.patch.needsHuman === true
      && p.patch.humanReason === NOMALUM_SABAB_ESKI_XABAR), true);
  }
  {
    const m = muhit(null, false, { holat: 'tasdiq_kutilmoqda' });
    await m.useCase.execute({ ...xabar, receivedAt: new Date(NOW.getTime() - 30 * 60_000) } as IncomingMessage);
    check('I5b: tasdiq kutilmoqda — holat/belgi tegilmaydi, agent yo\'q',
      [m.holatPatchlari.length, m.suhbatPatchlari.some((p) => 'needsHuman' in p.patch), m.c().pushlar], [0, false, 0]);
  }
  {
    const m = muhit(null);
    await m.useCase.execute({ ...xabar, receivedAt: new Date(NOW.getTime() - 5 * 60_000) } as IncomingMessage);
    check('I5b: 5 daqiqalik xabar — odatdagidek debouncerga', m.c().pushlar, 1);
  }
  {
    // Ma'lum mijozga yosh darvozasi qo'llanmaydi (eski xulq).
    const peer = { id: 'cvPeer', clientId: 'real1', peerId: 'u1', state: 'negotiating' } as unknown as Conversation;
    const m = muhit(null, false, { malumMijoz: true, peerSuhbat: peer });
    await m.useCase.execute({ ...xabar, receivedAt: new Date(NOW.getTime() - 30 * 60_000) } as IncomingMessage);
    check('I5b: ma\'lum mijozning eski xabari — debouncerga (o\'zgarmagan)', m.c().pushlar, 1);
  }

  // ── Hujjat: pasport / shartnoma 1-beti rasmi ──
  const hujjatRasm = {
    media: { kind: 'photo' }, agentText: '[rasm: hujjat]', needsReview: false, reviewReason: null,
    receiptSource: null, imageKind: 'hujjat', imageStatus: 'done', imageNote: null,
    transcript: null, transcriptStatus: 'none',
  } as unknown as ProcessedMedia;
  const rasmXabar = { ...xabar, text: '', media: { kind: 'photo' } } as unknown as IncomingMessage;
  {
    const m = muhit(hujjatRasm, false, { holat: 'hujjat_kutilmoqda' });
    const r = await m.useCase.execute(rasmXabar);
    check('H1: imported, xabar saqlandi', [r, m.yozilganSuhbat], ['imported', ['cv1']]);
    check('H1: holat tasdiq_kutilmoqda (topilgan mijoz tegilmaydi)', m.holatPatchlari, [{ holat: 'tasdiq_kutilmoqda' }]);
    check('H1: needsHuman + hujjat sababi', m.suhbatPatchlari.some((p) => p.patch.needsHuman === true
      && p.patch.humanReason === NOMALUM_SABAB_HUJJAT), true);
    check('H1: rahmat matni aynan, agent, tayyorMatn', m.yuborilgan, [{
      body: 'Rahmat! Tekshirib, tez orada javob beramiz.', author: 'agent', meta: { nomalum: true, tayyorMatn: true },
    }]);
    check('H1: MATN_HUJJAT_QABUL', MATN_HUJJAT_QABUL, 'Rahmat! Tekshirib, tez orada javob beramiz.');
    check('H1: debouncerga tushmadi, chek ochilmadi', [m.c().pushlar, m.c().chekOchildi], [0, 0]);
  }
  {
    // Hujjat fayl (PDF) sifatida ham keladi; caption bo'lsa ham agentga berilmaydi.
    const fayl = { ...hujjatRasm, media: { kind: 'document' }, agentText: 'mana\n[fayl]' } as unknown as ProcessedMedia;
    const m = muhit(fayl, false, { holat: 'hujjat_kutilmoqda' });
    await m.useCase.execute({ ...xabar, text: 'mana', media: { kind: 'document' } } as unknown as IncomingMessage);
    check('H2: document → tasdiq_kutilmoqda, debouncer yo\'q', [m.holatPatchlari, m.c().pushlar], [[{ holat: 'tasdiq_kutilmoqda' }], 0]);
  }
  {
    // Rasm `kutilmoqda` da — eski xulq (debouncer → noma'lum agent), holat tegilmaydi.
    const m = muhit(hujjatRasm, false, { holat: 'kutilmoqda' });
    await m.useCase.execute(rasmXabar);
    check('H3: kutilmoqda — holat tegilmadi, matn ketmadi, debouncerga 1', [m.holatPatchlari.length, m.yuborilgan.length, m.c().pushlar], [0, 0, 1]);
  }
  {
    // Ovoz — hujjat emas: hujjat_kutilmoqda da ham holat o'zgarmaydi.
    const ovoz = { ...hujjatRasm, media: { kind: 'voice' }, agentText: 'salom', imageKind: null } as unknown as ProcessedMedia;
    const m = muhit(ovoz, false, { holat: 'hujjat_kutilmoqda' });
    await m.useCase.execute({ ...xabar, media: { kind: 'voice' } } as unknown as IncomingMessage);
    check('H4: ovoz — hujjat qabul qilinmadi', [m.holatPatchlari.length, m.yuborilgan.length], [0, 0]);
  }
  {
    // Matn — hujjat emas: debouncerga (agent eslatma yozadi).
    const m = muhit(null, false, { holat: 'hujjat_kutilmoqda' });
    await m.useCase.execute(xabar);
    check('H5: matn — debouncerga, holat tegilmadi', [m.c().pushlar, m.holatPatchlari.length], [1, 0]);
  }
  {
    // Eski (deploydan keyin kelgan) rasm: holat va operator belgisi — ha, kechikkan avtomatik matn — yo'q.
    const m = muhit(hujjatRasm, false, { holat: 'hujjat_kutilmoqda' });
    await m.useCase.execute({ ...rasmXabar, receivedAt: new Date(NOW.getTime() - 30 * 60_000) } as IncomingMessage);
    check('H6: eski rasm — tasdiq_kutilmoqda + needsHuman, matn yo\'q, debouncer yo\'q',
      [m.holatPatchlari, m.suhbatPatchlari.some((p) => p.patch.humanReason === NOMALUM_SABAB_HUJJAT), m.yuborilgan.length, m.c().pushlar],
      [[{ holat: 'tasdiq_kutilmoqda' }], true, 0, 0]);
  }
  {
    // Operator suhbatni qo'lga olgan (needsHuman) — holat o'tadi, avtomatik matn yo'q.
    const m = muhit(hujjatRasm, false, { holat: 'hujjat_kutilmoqda', conv: { needsHuman: true } });
    await m.useCase.execute(rasmXabar);
    check('H7: needsHuman — matn ketmadi, holat o\'tdi', [m.yuborilgan.length, m.holatPatchlari], [0, [{ holat: 'tasdiq_kutilmoqda' }]]);
  }
  {
    // Bir vaqtda ikki rasm: holatni faqat bittasi o'tkazadi — rahmat bir marta.
    const m = muhit(hujjatRasm, false, { holat: 'hujjat_kutilmoqda' });
    const natijalar = await Promise.all([
      m.useCase.execute(rasmXabar),
      m.useCase.execute({ ...rasmXabar, telegramMsgId: 2 } as unknown as IncomingMessage),
    ]);
    check('H9: ikki rasm — ikkalasi imported, debouncer yo\'q', [natijalar, m.c().pushlar], [['imported', 'imported'], 0]);
    check('H9: rahmat matni BIR marta', m.yuborilgan.length, 1);
    check('H9: chek/operator sababi hujjat sababini bosmadi', m.suhbatPatchlari.every((p) => p.patch.humanReason === undefined
      || p.patch.humanReason === NOMALUM_SABAB_HUJJAT), true);
  }
  {
    // Holat o'tganda ketayotgan noma'lum agent navbati uziladi — "Iltimos ... yuboring" rahmatdan keyin ketmasin.
    const m = muhit(hujjatRasm, false, { holat: 'hujjat_kutilmoqda' });
    await m.useCase.execute(rasmXabar);
    check('H10: agent navbati uzildi', m.uzilganlar, ['cv1']);
    const k = muhit(hujjatRasm, false, { holat: 'kutilmoqda' });
    await k.useCase.execute(rasmXabar);
    check('H10: kutilmoqda — uzilmadi', k.uzilganlar, []);
  }
  {
    // Eski matn hujjat kutilayotganda jim yo'qolmaydi: operator chaqiriladi, holat qoladi.
    const m = muhit(null, false, { holat: 'hujjat_kutilmoqda' });
    await m.useCase.execute({ ...xabar, receivedAt: new Date(NOW.getTime() - 30 * 60_000) } as IncomingMessage);
    check('H11: eski matn — needsHuman + tasdiq sababi, holat tegilmadi, agent yo\'q',
      [m.suhbatPatchlari.some((p) => p.patch.needsHuman === true && p.patch.humanReason === NOMALUM_SABAB_TASDIQ),
        m.holatPatchlari.length, m.c().pushlar], [true, 0, 0]);
  }
  {
    // PII: noma'lum odamning rasmi (pasport bo'lishi mumkin) vision modelga yuborilmaydi.
    const m = muhit(hujjatRasm, false, { holat: 'kutilmoqda' });
    await m.useCase.execute(rasmXabar);
    check('H12: noma\'lum — tasniflanmaydi', m.processOpts, [{ tasniflama: true }]);
    const peer = { id: 'cvPeer', clientId: 'real1', peerId: 'u1', state: 'negotiating' } as unknown as Conversation;
    const k = muhit(hujjatRasm, false, { malumMijoz: true, peerSuhbat: peer });
    await k.useCase.execute(rasmXabar);
    check('H12: ma\'lum mijoz — odatdagidek tasniflanadi', k.processOpts, [{ tasniflama: false }]);
  }
  {
    // Tasdiq kutilayotganda yana rasm: agentga/chek oqimiga bermaydi, matn yo'q;
    // operator belgisi tushirilgan bo'lsa — qayta qo'yiladi.
    const m = muhit(hujjatRasm, false, { holat: 'tasdiq_kutilmoqda' });
    const r = await m.useCase.execute(rasmXabar);
    check('H13: tasdiq_kutilmoqda rasm — imported, matn/debouncer yo\'q, holat tegilmadi',
      [r, m.yuborilgan.length, m.c().pushlar, m.holatPatchlari.length], ['imported', 0, 0, 0]);
    check('H13: belgi yo\'q edi — hujjat sababi bilan qo\'yildi', m.suhbatPatchlari.some((p) => p.patch.needsHuman === true
      && p.patch.humanReason === NOMALUM_SABAB_HUJJAT), true);
    const k = muhit(hujjatRasm, false, { holat: 'tasdiq_kutilmoqda', conv: { needsHuman: true } });
    await k.useCase.execute(rasmXabar);
    check('H13: belgi bor — tegilmadi', k.suhbatPatchlari.some((p) => 'needsHuman' in p.patch), false);
  }
  {
    // Tasniflanmagan (PII) rasm `kutilmoqda` da operatorga: sabab noma'lum oqimniki —
    // "chek bo'lishi mumkin" emas, va bog'langach o'zi tushiriladi.
    const tasniflanmagan = {
      ...hujjatRasm, needsReview: true, reviewReason: 'chek bo\'lishi mumkin', receiptSource: 'aniqlanmagan', imageKind: null,
    } as unknown as ProcessedMedia;
    const m = muhit(tasniflanmagan, false, { holat: 'kutilmoqda' });
    await m.useCase.execute(rasmXabar);
    check('H14: noma\'lum rasm — needsHuman + NOMALUM_SABAB_OPERATOR, agent/chek yo\'q',
      [m.suhbatPatchlari.filter((p) => 'needsHuman' in p.patch).map((p) => p.patch), m.c().pushlar, m.c().chekOchildi],
      [[{ needsHuman: true, humanReason: NOMALUM_SABAB_OPERATOR }], 0, 0]);
    // Ma'lum mijoz: o'zgarmagan (ovoz o'girilmadi — reviewReason qoladi).
    const peer = { id: 'cvPeer', clientId: 'real1', peerId: 'u1', state: 'negotiating' } as unknown as Conversation;
    const ovoz = { ...tasniflanmagan, media: { kind: 'voice' }, receiptSource: null, reviewReason: 'eshiting' } as unknown as ProcessedMedia;
    const k = muhit(ovoz, false, { malumMijoz: true, peerSuhbat: peer });
    await k.useCase.execute({ ...xabar, media: { kind: 'voice' } } as unknown as IncomingMessage);
    check('H14: ma\'lum mijoz — reviewReason o\'zgarmadi', k.suhbatPatchlari.filter((p) => 'needsHuman' in p.patch).map((p) => p.patch.humanReason), ['eshiting']);
  }
  check('H8: hujjat sababi noma\'lum oqim sababi (bog\'lashda tushiriladi)', nomalumSababimi(NOMALUM_SABAB_HUJJAT), true);
  check('H8: sabab matni', NOMALUM_SABAB_HUJJAT, 'Noma\'lum mijoz hujjat yubordi — tekshirib, bog\'lashni tasdiqlang');
  check('H8: matnda "qarz" yo\'q', /qarz/i.test(MATN_HUJJAT_QABUL), false);

  console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
  process.exitCode = failed ? 1 : 0;
}
void main();
