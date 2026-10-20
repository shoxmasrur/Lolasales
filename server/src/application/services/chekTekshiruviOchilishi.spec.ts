import { IncomingMediaProcessor, type ProcessedMedia } from '@/application/services/IncomingMediaProcessor';
import { PaymentCheckService } from '@/application/services/PaymentCheckService';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import type { ReplyDebouncer } from '@/application/services/ReplyDebouncer';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { HandleIncomingMessageUseCase } from '@/application/usecases/messaging/HandleIncomingMessageUseCase';
import type { Conversation } from '@/domain/entities/Conversation';
import {
  RECEIPT_REVIEW_REASON,
  type NewReceiptReview,
  type PaymentCheck,
  type ReceiptSource,
} from '@/domain/entities/PaymentCheck';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type {
  ConversationPatch,
  IConversationRepository,
} from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IPurchaseRepository } from '@/domain/repositories/IPurchaseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IImageClassifier, ImageClassifyResult } from '@/domain/services/IImageClassifier';
import type { IMediaStorage } from '@/domain/services/IMediaStorage';
import type { ISpeechToText } from '@/domain/services/ISpeechToText';
import type { IncomingMedia, IncomingMessage } from '@/domain/services/ITelegramGateway';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-ochilishi --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — bazaga ham,
 * Telegramga ham, modelga ham chiqmaydi).
 *
 * Qaysi media chek tekshiruvini ochadi va mijoz nima oladi (2026-09-17):
 *   • `tolov` — tekshiruv ochiladi, agent navbati ketadi (bir marta
 *     "Chekni oldim…"), eskalatsiyani javobdan keyin `AgentRunner` qo'yadi;
 *   • `noaniq` / yiqilgan / tasnifchi o'chiq / yuklanmagan fayl —
 *     `aniqlanmagan`: agent CHAQIRILMAYDI, operator DARHOL;
 *   • hujjat, oddiy rasm, stiker, video — tekshiruv ochilmaydi.
 *   • Chek ochilganda tekshiruv faol xaridga bog'lanadi va xarid bosqichi
 *     `chek_keldi` bo'ladi (10-vazifa).
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

const NOW = new Date('2026-09-17T06:00:00Z');

// ─── 1. Media → chek tekshiruvi manbai ───────────────────────────────────
const storage = { save: async () => ({ path: 'storage/media/x.jpg', sizeBytes: 100 }) } as unknown as IMediaStorage;
const stt = { available: false, transcribe: async () => ({ ok: false, reason: 'yo\'q' }) } as unknown as ISpeechToText;

function media(patch: Partial<IncomingMedia> = {}): IncomingMedia {
  return {
    kind: 'photo',
    mimeType: 'image/jpeg',
    fileName: 'chek.jpg',
    sizeBytes: 100,
    durationSec: null,
    stickerAlt: null,
    download: async () => Buffer.from('rasm'),
    ...patch,
  } as IncomingMedia;
}

async function manba(
  natija: ImageClassifyResult,
  patch: Partial<IncomingMedia> = {},
  available = true,
): Promise<ProcessedMedia> {
  const classifier: IImageClassifier = { available, classify: async () => natija };
  return new IncomingMediaProcessor(storage, stt, classifier).process(media(patch), '');
}

{
  const tolov = await manba({ kind: 'tolov', note: 'Payme', failed: false });
  check('tolov → tolov', tolov.receiptSource === 'tolov', String(tolov.receiptSource));
  check('tolov: sabab matni', tolov.reviewReason === RECEIPT_REVIEW_REASON.tolov, String(tolov.reviewReason));

  const noaniq = await manba({ kind: 'noaniq', note: null, failed: false });
  check('noaniq → aniqlanmagan', noaniq.receiptSource === 'aniqlanmagan', String(noaniq.receiptSource));
  check('aniqlanmagan: sabab matni', noaniq.reviewReason === RECEIPT_REVIEW_REASON.aniqlanmagan, String(noaniq.reviewReason));

  const yiqildi = await manba({ kind: 'noaniq', note: null, failed: true });
  check('tasnif yiqildi → aniqlanmagan', yiqildi.receiptSource === 'aniqlanmagan', String(yiqildi.receiptSource));

  const ochiq = await manba({ kind: 'tolov', note: null, failed: false }, {}, false);
  check('tasnifchi o\'chiq → aniqlanmagan', ochiq.receiptSource === 'aniqlanmagan', String(ochiq.receiptSource));

  // PDF endi tasniflanadi (2026-09-24): chek bo'lsa rasm chek bilan bir
  // xil yo'ldan ketadi, chek bo'lmasa `aniqlanmagan` bo'lib operatorga
  // tushadi. To'liq jadval — `pdfOqimi.spec.ts`.
  const pdfChek = await manba({ kind: 'tolov', note: null, failed: false }, {
    kind: 'document',
    mimeType: 'application/pdf',
    fileName: 'chek.pdf',
  });
  check('PDF chek → tolov', pdfChek.receiptSource === 'tolov', String(pdfChek.receiptSource));

  const pdfHujjat = await manba({ kind: 'hujjat', note: null, failed: false }, {
    kind: 'document',
    mimeType: 'application/pdf',
    fileName: 'shartnoma.pdf',
  });
  check('PDF hujjat → aniqlanmagan', pdfHujjat.receiptSource === 'aniqlanmagan', String(pdfHujjat.receiptSource));

  const yuklanmadi = await manba({ kind: 'tolov', note: null, failed: false }, {
    download: async () => {
      throw new Error('tarmoq uzildi');
    },
  });
  check('yuklanmagan rasm → aniqlanmagan', yuklanmadi.receiptSource === 'aniqlanmagan', String(yuklanmadi.receiptSource));
  check(
    'yuklanmagan rasm: o\'ziga xos sabab qoladi',
    yuklanmadi.reviewReason === 'Faylni yuklab bo\'lmadi — Telegramdan qo\'lda ko\'ring',
    String(yuklanmadi.reviewReason),
  );

  const hujjat = await manba({ kind: 'hujjat', note: 'shartnoma', failed: false });
  check('hujjat → ochilmaydi', hujjat.receiptSource === null, String(hujjat.receiptSource));

  const boshqa = await manba({ kind: 'boshqa', note: null, failed: false });
  check('boshqa → ochilmaydi', boshqa.receiptSource === null, String(boshqa.receiptSource));

  const video = await manba({ kind: 'tolov', note: null, failed: false }, {
    kind: 'video',
    mimeType: 'video/mp4',
    fileName: 'gif.mp4',
  });
  check('video → ochilmaydi', video.receiptSource === null && !video.needsReview, String(video.receiptSource));

  const stiker = await manba({ kind: 'tolov', note: null, failed: false }, {
    kind: 'sticker',
    mimeType: null,
    stickerAlt: '👋',
  });
  check('stiker → ochilmaydi', stiker.receiptSource === null, String(stiker.receiptSource));
}

// ─── 2. Xotiradagi `payment_checks` ──────────────────────────────────────
type Qator = { -readonly [K in keyof PaymentCheck]: PaymentCheck[K] };

class XotiraTekshiruvlar {
  readonly qatorlar: Qator[] = [];
  private n = 0;

  private ochiqmi(q: Qator): boolean {
    return q.status === 'reviewing';
  }

  async findOpenByConversation(conversationId: string): Promise<PaymentCheck | null> {
    return this.qatorlar.find((q) => q.conversationId === conversationId && this.ochiqmi(q)) ?? null;
  }

  async openReceiptReview(d: NewReceiptReview): Promise<PaymentCheck> {
    const q = this.yangi({
      conversationId: d.conversationId,
      clientId: d.clientId,
      purchaseId: d.purchaseId,
      messageId: d.messageId,
      kind: 'receipt_review',
      status: 'reviewing',
      receiptSource: d.receiptSource,
      sinceIso: d.sinceIso,
    });
    return q;
  }

  async raiseReceiptSource(id: string): Promise<void> {
    const q = this.qatorlar.find((x) => x.id === id && x.status === 'reviewing');
    if (q) q.receiptSource = 'tolov';
  }

  async cancel(conversationId: string): Promise<void> {
    for (const q of this.qatorlar) {
      if (q.conversationId === conversationId && this.ochiqmi(q)) q.status = 'cancelled';
    }
  }

  yangi(over: Partial<Qator>): Qator {
    this.n += 1;
    const q: Qator = {
      id: `pc${this.n}`,
      conversationId: 'cv1',
      clientId: 'c1',
      purchaseId: null,
      messageId: null,
      kind: 'receipt_review',
      status: 'reviewing',
      receiptSource: 'tolov',
      sinceIso: '2026-09-10',
      acknowledgedAt: null,
      confirmedBy: null,
      confirmedAt: null,
      confirmedAmount: null,
      rejectedReason: null,
      createdAt: NOW,
      ...over,
    };
    this.qatorlar.push(q);
    return q;
  }
}

class YiqiladiganTekshiruvlar extends XotiraTekshiruvlar {
  override async openReceiptReview(): Promise<PaymentCheck> {
    throw new Error('baza javob bermadi');
  }
}

// ─── 3. HandleIncomingMessageUseCase ─────────────────────────────────────
function ishlangan(receiptSource: ReceiptSource | null, over: Partial<ProcessedMedia> = {}): ProcessedMedia {
  return {
    media: { kind: 'photo', path: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 100, durationSec: null, fileName: 'chek.jpg' },
    transcript: null,
    transcriptStatus: 'none',
    agentText: receiptSource === 'tolov' ? '[mijoz to\'lov cheki yubordi]' : '[mijoz rasm yubordi — nimaligi aniqlanmadi]',
    needsReview: receiptSource !== null,
    reviewReason: receiptSource ? RECEIPT_REVIEW_REASON[receiptSource] : null,
    receiptSource,
    imageKind: receiptSource === 'tolov' ? 'tolov' : 'noaniq',
    imageStatus: 'done',
    imageNote: null,
    ...over,
  };
}

function muhit(opts: {
  processed: ProcessedMedia;
  tekshiruvlar?: XotiraTekshiruvlar;
  killSwitch?: boolean;
  suhbat?: Partial<Conversation>;
}) {
  const suhbat = {
    id: 'cv1',
    clientId: 'c1',
    peerId: 'u1',
    state: 'active',
    agentEnabled: true,
    needsHuman: false,
    humanKind: null,
    ...opts.suhbat,
  } as Conversation;
  const patches: ConversationPatch[] = [];
  const navbat: string[] = [];
  const tekshiruvlar = opts.tekshiruvlar ?? new XotiraTekshiruvlar();
  const bosqichlar: string[] = [];
  const xarid = {
    faolXaridBosqichi: async (clientId: string, stage: string, actor: string) => {
      bosqichlar.push(`${clientId}:${stage}:${actor}`);
      return null;
    },
  } as unknown as XaridXizmati;

  const conversations = {
    findByPeer: async () => suhbat,
    findByClientId: async () => suhbat,
    findById: async () => suhbat,
    update: async (_id: string, patch: ConversationPatch) => {
      patches.push(patch);
      return suhbat;
    },
    touchInbound: async () => undefined,
  } as unknown as IConversationRepository;
  const events = { publish: () => undefined } as unknown as IEventBus;

  const service = new PaymentCheckService(
    tekshiruvlar as unknown as IPaymentCheckRepository,
    conversations,
    {
      findActiveByClient: async () => ({ id: 'p1', stage: 'karta_yuborildi' }),
      findLatestByClient: async () => null,
    } as unknown as IPurchaseRepository,
    { findById: async () => null },
    xarid,
    {} as unknown as AgentRunner,
    { send: async () => { throw new Error('kutilmagan'); } },
    { record: async () => undefined } as unknown as IAuditRepository,
    events,
    { now: () => NOW, todayIso: () => '2026-09-17' } as unknown as IClock,
    { get: async () => ({ killSwitch: false }) } as unknown as RuntimeSettings,
  );

  const useCase = new HandleIncomingMessageUseCase(
    { findByTelegramUserId: async () => ({ id: 'c1', telegramUserId: 'u1' }) } as unknown as IClientRepository,
    conversations,
    { existsTelegramMessage: async () => false, create: async () => ({ id: 'm1' }) } as unknown as IMessageRepository,
    { push: (_id: string, text: string) => void navbat.push(text) } as unknown as ReplyDebouncer,
    { get: async () => ({ killSwitch: opts.killSwitch ?? false }) } as unknown as RuntimeSettings,
    { process: async () => opts.processed } as unknown as IncomingMediaProcessor,
    events,
    service,
    null,
    null,
    null,
    xarid,
  );

  return { useCase, service, patches, navbat, tekshiruvlar, bosqichlar };
}

const xabar: IncomingMessage = {
  telegramAccountId: 'a1',
  telegramUserId: 'u1',
  accessHash: null,
  username: null,
  fullName: 'Mijoz',
  phone: null,
  telegramMsgId: 1,
  text: '',
  media: media(),
  receivedAt: NOW,
};

const chekEskalatsiyasi = (patches: ConversationPatch[], reason: string): boolean =>
  patches.some((p) => p.needsHuman === true && p.humanKind === 'chek_tekshiruvi' && p.humanReason === reason);

// tolov — tekshiruv ochiladi, agent navbati ketadi, operator hali chaqirilmaydi
{
  const m = muhit({ processed: ishlangan('tolov') });
  await m.useCase.execute(xabar);
  const q = m.tekshiruvlar.qatorlar[0];
  check(
    'tolov: receipt_review ochildi',
    q?.kind === 'receipt_review' && q.status === 'reviewing' && q.receiptSource === 'tolov',
    JSON.stringify(q),
  );
  check('tolov: xabar va kun yoziladi', q?.messageId === 'm1' && q.sinceIso === '2026-09-17', JSON.stringify(q));
  check('tolov: faol xaridga bog\'landi', q?.purchaseId === 'p1', JSON.stringify(q));
  check('tolov: bosqich chek_keldi (tizim)', JSON.stringify(m.bosqichlar) === JSON.stringify(['c1:chek_keldi:tizim']), JSON.stringify(m.bosqichlar));
  check('tolov: agent navbati ketdi', m.navbat.length === 1, JSON.stringify(m.navbat));
  check('tolov: eskalatsiya javobdan oldin qo\'yilmaydi', !m.patches.some((p) => p.needsHuman), JSON.stringify(m.patches));
}

// aniqlanmagan — agent chaqirilmaydi, operator DARHOL
{
  const m = muhit({ processed: ishlangan('aniqlanmagan') });
  await m.useCase.execute(xabar);
  const q = m.tekshiruvlar.qatorlar[0];
  check('aniqlanmagan: receipt_review ochildi', q?.receiptSource === 'aniqlanmagan', JSON.stringify(q));
  check('aniqlanmagan: agent navbati YO\'Q', m.navbat.length === 0, JSON.stringify(m.navbat));
  check(
    'aniqlanmagan: darhol needs_human (chek_tekshiruvi)',
    chekEskalatsiyasi(m.patches, RECEIPT_REVIEW_REASON.aniqlanmagan),
    JSON.stringify(m.patches),
  );
}

// tolov, lekin agent yoza olmaydi — operator darhol
{
  const kill = muhit({ processed: ishlangan('tolov'), killSwitch: true });
  await kill.useCase.execute(xabar);
  check('tolov + kill switch: navbat yo\'q', kill.navbat.length === 0);
  check('tolov + kill switch: darhol eskalatsiya', chekEskalatsiyasi(kill.patches, RECEIPT_REVIEW_REASON.tolov), JSON.stringify(kill.patches));

  const qolda = muhit({ processed: ishlangan('tolov'), suhbat: { needsHuman: true } });
  await qolda.useCase.execute(xabar);
  check('tolov + operator qo\'lida: navbat yo\'q', qolda.navbat.length === 0);
  check('tolov + operator qo\'lida: eskalatsiya', chekEskalatsiyasi(qolda.patches, RECEIPT_REVIEW_REASON.tolov));
}

// ochiq aniqlanmagan + tolov rasmi — manba ko'tariladi, yangi yozuv yo'q
{
  const t = new XotiraTekshiruvlar();
  const eski = t.yangi({ receiptSource: 'aniqlanmagan' });
  const m = muhit({ processed: ishlangan('tolov'), tekshiruvlar: t, suhbat: { needsHuman: true, humanKind: 'chek_tekshiruvi' } });
  await m.useCase.execute(xabar);
  check('aniqlanmagan → tolov ga ko\'tarildi', eski.receiptSource === 'tolov', String(eski.receiptSource));
  check('yangi yozuv ochilmadi', t.qatorlar.length === 1, String(t.qatorlar.length));

  // Teskarisi: tolov ustiga aniqlanmagan — pastga tushirilmaydi.
  const t2 = new XotiraTekshiruvlar();
  const tolov = t2.yangi({ receiptSource: 'tolov' });
  const m2 = muhit({ processed: ishlangan('aniqlanmagan'), tekshiruvlar: t2 });
  await m2.useCase.execute(xabar);
  check('tolov pastga tushirilmaydi', tolov.receiptSource === 'tolov', String(tolov.receiptSource));
}

// ikkinchi chek rasmi — javob berilgan, suhbat operatorda: yangi javob ham, yozuv ham yo'q
{
  const t = new XotiraTekshiruvlar();
  t.yangi({ receiptSource: 'tolov', acknowledgedAt: NOW });
  const m = muhit({
    processed: ishlangan('tolov'),
    tekshiruvlar: t,
    suhbat: { needsHuman: true, humanKind: 'chek_tekshiruvi' },
  });
  await m.useCase.execute(xabar);
  check('ikkinchi rasm: yangi yozuv yo\'q', t.qatorlar.length === 1, String(t.qatorlar.length));
  check('ikkinchi rasm: agent navbati yo\'q', m.navbat.length === 0, JSON.stringify(m.navbat));
}

// 7 kundan eski, tugmasiz qolgan tekshiruv + yangi chek — eskisi bekor, yangisi ochiladi
{
  const t = new XotiraTekshiruvlar();
  const eski = t.yangi({
    receiptSource: 'tolov',
    acknowledgedAt: new Date('2026-09-09T06:00:00Z'),
    createdAt: new Date('2026-09-09T06:00:00Z'),
  });
  const m = muhit({ processed: ishlangan('tolov'), tekshiruvlar: t });
  await m.useCase.execute(xabar);
  const yangi = t.qatorlar[1];
  check('eski tekshiruv: bekor qilindi', eski.status === 'cancelled', eski.status);
  check(
    'eski tekshiruv: yangisi ochildi',
    t.qatorlar.length === 2 && yangi?.status === 'reviewing' && yangi.acknowledgedAt === null,
    JSON.stringify(t.qatorlar),
  );
  check('eski tekshiruv: agent navbati ketdi', m.navbat.length === 1, JSON.stringify(m.navbat));
}

// tekshiruv ochilmadi — operator baribir chaqiriladi
{
  const m = muhit({ processed: ishlangan('tolov'), tekshiruvlar: new YiqiladiganTekshiruvlar() });
  await m.useCase.execute(xabar);
  check('ochilmadi: navbat yo\'q', m.navbat.length === 0);
  check('ochilmadi: bosqich o\'zgarmadi', m.bosqichlar.length === 0, JSON.stringify(m.bosqichlar));
  check(
    'ochilmadi: needs_human sabab bilan',
    m.patches.some((p) => p.needsHuman === true && p.humanReason === RECEIPT_REVIEW_REASON.tolov),
    JSON.stringify(m.patches),
  );
}

// chek emas — tekshiruv yo'q, agent odatdagidek javob beradi
{
  const m = muhit({ processed: ishlangan(null, { imageKind: 'hujjat', agentText: '[mijoz hujjat rasmini yubordi]' }) });
  await m.useCase.execute(xabar);
  check('hujjat: tekshiruv yo\'q', m.tekshiruvlar.qatorlar.length === 0);
  check('hujjat: bosqich o\'zgarmadi', m.bosqichlar.length === 0);
  check('hujjat: agent navbati ketdi', m.navbat.length === 1);
}

// ovoz o'girilmadi — chek emas, lekin operator eshitadi
{
  const m = muhit({
    processed: ishlangan(null, {
      needsReview: true,
      reviewReason: 'Ovozli xabar keldi, lekin STT sozlanmagan — o\'zingiz eshiting',
      agentText: '[ovozli xabar]',
      imageKind: null,
      imageStatus: 'none',
    }),
  });
  await m.useCase.execute(xabar);
  check('ovoz: chek tekshiruvi ochilmadi', m.tekshiruvlar.qatorlar.length === 0);
  check('ovoz: navbat yo\'q', m.navbat.length === 0);
  check('ovoz: operatorga sabab bilan', m.patches.some((p) => p.needsHuman === true && p.humanKind === undefined));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
