import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { RekvizitManbai } from '@/application/services/RekvizitManbai';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { TalabnomaSuhbati } from '@/application/services/TalabnomaSuhbati';
import { isContactable, type Client } from '@/domain/entities/Client';
import type { Contract } from '@/domain/entities/Contract';
import type { Conversation } from '@/domain/entities/Conversation';
import type { Message } from '@/domain/entities/Message';
import type { Talabnoma, TalabnomaNomzodi } from '@/domain/entities/Talabnoma';
import { canReply } from '@/domain/entities/TelegramAccount';
import { holatKorinishi, type HolatKorinishi } from '@/domain/entities/shartnomaHolati';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ITalabnomaRepository } from '@/domain/repositories/ITalabnomaRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IMediaStorage } from '@/domain/services/IMediaStorage';
import type { ITalabnomaPdf, TalabnomaMalumot } from '@/domain/services/ITalabnomaPdf';
import type { Rekvizit, RekvizitNatija } from '@/domain/services/rekvizit';
import type { IClock } from '@/domain/services/support';
import { ikkiOyTushmagan, talabnomaMuddatlari } from '@/domain/services/talabnomaQoidasi';
import { talabnomaRaqami } from '@/domain/services/talabnomaFormat';
import { zonedParts } from '@/shared/datetime';
import { AppError, ConflictError, KillSwitchError, NotFoundError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('talabnoma');

/** «Yuborishga tayyor» qatori: rekvizit sababi operatorga oldindan ko'rinadi. */
export interface TayyorQator extends TalabnomaNomzodi {
  /**
   * `null` — shartnomada kompaniya INN'i hali yo'q (CRM'dan sinxlanmagan):
   * rekvizitni tanlab bo'lmaydi, lekin bu yuborishni TO'SMAYDI — `yubor`
   * avval sinxlaydi va rekvizitni qayta tekshiradi (INN baribir yo'q
   * bo'lsa o'sha yerda rad etadi).
   */
  rekvizit: RekvizitNatija | null;
  /**
   * Hujjatga kerak, lekin bazada hali yo'q maydonlar (`"kompaniya INN'i,
   * obyekt manzili"`). Yuborish TO'SILMAYDI: `yubor` avval CRM'dan
   * sinxlaydi va ularni to'ldirishi mumkin. Sahifa faqat belgi qo'yadi va
   * ko'rinishni so'ramaydi.
   */
  malumotYetishmaydi: string | null;
  /**
   * Shartnomaning CRM holati (kanonik kalit + nom). Ro'yxatda faqat
   * yoziladigan holatlar bo'ladi; «Проц. отказ» ni sahifa alohida belgilaydi —
   * bekor qilinayotgan shartnomaga talabnoma yuborishdan oldin operator ko'rsin.
   */
  shartnomaHolati: HolatKorinishi | null;
}

/** Bazada hali yo'q (CRM sinxi to'ldiradigan) hujjat maydonlari. */
function yetishmaganlar(n: TalabnomaNomzodi): string | null {
  const royxat = [
    !(n.companyInn ?? '').trim() ? "kompaniya INN'i" : null,
    !n.objectAddress ? 'obyekt manzili' : null,
    !n.objectName ? 'obyekt nomi' : null,
  ].filter((x): x is string => x !== null);
  return royxat.length > 0 ? royxat.join(', ') : null;
}

export interface TalabnomaXizmatiDeps {
  talabnomalar: ITalabnomaRepository;
  rekvizitManbai: Pick<RekvizitManbai, 'rekvizit' | 'keshniTashla'>;
  pdf: ITalabnomaPdf;
  payments: Pick<IContractPaymentRepository, 'listSchedule'>;
  contractSync: Pick<ContractSyncService, 'syncOne'>;
  holidays: Pick<IHolidayRepository, 'list'>;
  dispatcher: Pick<MessageDispatcher, 'sendMedia'>;
  messages: Pick<IMessageRepository, 'yuborilganFayl'>;
  /** Suhbatni agent xabarisiz tayyorlaydi (`TalabnomaSuhbati`). */
  suhbat: Pick<TalabnomaSuhbati, 'tayyorla'>;
  /** Dispatcher'ning oldindan ma'lum rad etishlari yozuv yaratilmasdan tekshiriladi. */
  settings: Pick<RuntimeSettings, 'get'>;
  accounts: Pick<ITelegramAccountRepository, 'findById'>;
  clients: Pick<IClientRepository, 'findById'>;
  contracts: Pick<IContractRepository, 'findById'>;
  storage: Pick<IMediaStorage, 'read'>;
  audit: Pick<IAuditRepository, 'record'>;
  clock: IClock;
}

/** PDF'ga va caption'ga kerak bo'lgan, bazadan yig'ilgan ma'lumot. */
interface Hujjat {
  contract: Contract;
  client: Client;
  objectName: string;
  objectAddress: string;
}

const endiKerakEmas = (): ConflictError =>
  new ConflictError("Talabnoma endi kerak emas: to'lov kelgan yoki shartnoma qoidaga tushmay qolgan", 'ENDI_KERAK_EMAS');

const faylNomi = (etRaqam: string): string => `Talabnoma ${etRaqam}.pdf`;

const xabari = (err: unknown): string => {
  if (err instanceof AppError) return `${err.code}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
};

/**
 * Elektron talabnoma: tayyorlash, ko'rib chiqish, yuborish, qayta urinish.
 *
 * Agent bu yerda UMUMAN chaqirilmaydi: talabnoma — operatorning ongli
 * qarori, matni oldindan tasdiqlangan. Suhbat bo'lmasa u agentning
 * birinchi xabarisiz ochiladi (aks holda mijoz bir vaqtda ikki xabar
 * olardi: agentning salomi va rasmiy hujjat).
 */
export class TalabnomaXizmati {
  constructor(private readonly d: TalabnomaXizmatiDeps) {}

  async tayyorlar(): Promise<TayyorQator[]> {
    const today = this.d.clock.todayIso();
    const nomzodlar = await this.d.talabnomalar.nomzodlar(today);
    // Bir INN — bir so'rov. NEGA: `RekvizitManbai` xatoni keshlamaydi;
    // CRM yiqilganda har qator uchun alohida (va har biri timeout bilan)
    // so'rov ketib, ro'yxat daqiqalab ochilardi.
    const rekvizitlar = new Map<string, Promise<RekvizitNatija>>();
    const natija: TayyorQator[] = [];
    // Ketma-ket: nomzodlar yuzlab bo'lishi mumkin, baza puli esa kichik.
    for (const n of nomzodlar) {
      if (!ikkiOyTushmagan(await this.d.payments.listSchedule(n.contractId), today)) continue;
      const malumotYetishmaydi = yetishmaganlar(n);
      const shartnomaHolati = holatKorinishi(n.virtualStatus);
      const kalit = (n.companyInn ?? '').trim();
      if (kalit === '') {
        natija.push({ ...n, rekvizit: null, malumotYetishmaydi, shartnomaHolati });
        continue;
      }
      if (!rekvizitlar.has(kalit)) rekvizitlar.set(kalit, this.d.rekvizitManbai.rekvizit(n.companyInn));
      natija.push({ ...n, rekvizit: await rekvizitlar.get(kalit)!, malumotYetishmaydi, shartnomaHolati });
    }
    return natija;
  }

  /** Ko'rib chiqish PDF'i: raqamsiz (`ET-__`), bugungi sana, hech narsa saqlanmaydi. */
  async korinish(contractId: string): Promise<Buffer> {
    await this.sozlanganmi();
    const today = this.d.clock.todayIso();
    const n = await this.d.talabnomalar.nomzod(contractId, today);
    if (!n) throw new NotFoundError('Talabnoma nomzodi', contractId);
    const h = await this.hujjat(contractId);
    const rekvizit = this.rekvizitShart(await this.d.rekvizitManbai.rekvizit(h.contract.companyInn));
    return this.d.pdf.render(this.malumot(h, null, today, h.contract.debtMonthly, rekvizit));
  }

  async yubor(contractId: string, userId: string): Promise<Talabnoma> {
    await this.sozlanganmi();
    // CRM'ga chiqishdan oldin: ikkinchi bosish "endi kerak emas" emas,
    // "allaqachon bor" ni ko'rishi kerak (`nomzod()` band shartnomani ham
    // `null` qaytaradi).
    if (await this.d.talabnomalar.bandTalabnoma(contractId)) {
      throw new ConflictError('Bu shartnomaga talabnoma allaqachon yuborilgan', 'TALABNOMA_BOR');
    }
    await this.crmdanYangila(contractId);

    // Qoida SINXDAN KEYIN qayta tekshiriladi: mijoz kecha to'lagan bo'lsa
    // talabnoma ketmaydi.
    const today = this.d.clock.todayIso();
    const n = await this.d.talabnomalar.nomzod(contractId, today);
    if (!n || !ikkiOyTushmagan(await this.d.payments.listSchedule(contractId), today)) {
      throw endiKerakEmas();
    }
    // Raqam berishdan OLDIN: yetishmagan ma'lumot ET raqamini behuda yemasin.
    const h = await this.hujjat(contractId);
    this.yozsaBoladimi(h.client);
    // Hisob raqami hujjatga bir marta yoziladi — 10 daqiqalik keshdan emas,
    // CRM'dan yangi olinadi (o'sha oraliqda hisob almashgan bo'lishi mumkin).
    this.d.rekvizitManbai.keshniTashla();
    const rekvizit = this.rekvizitShart(await this.d.rekvizitManbai.rekvizit(h.contract.companyInn));
    // Oldindan aniq rad etishlar (to'xtatish, profil topilmadi, akkaunt
    // ulanmagan) ham yozuvdan OLDIN: aks holda har biri ET raqamini yeb,
    // operatorga bekor qilinadigan `xato` qatorini qoldirardi.
    const conversation = await this.yuborishgaTayyorla(h);

    // Parallel bosishni baza hal qiladi: ikkinchisi `TALABNOMA_BOR` oladi.
    const t = await this.d.talabnomalar.yarat({
      contractId, clientId: h.client.id, summa: h.contract.debtMonthly, rekvizit,
    });
    return this.yuborVaYoz(t, h, conversation, userId, 'talabnoma.sent');
  }

  /**
   * O'sha raqam, o'sha summa va o'sha rekvizit bilan qayta yasab yuboradi.
   * Rekvizit qayta olinmaydi: hujjat birinchi urinishda qaror qilingan
   * ma'lumot bilan chiqadi. Lekin CRM sinxi va qoida QAYTA tekshiriladi:
   * xato bilan turgan paytda mijoz to'lagan yoki bog'lanishni taqiqlagan
   * bo'lishi mumkin — keraksiz rasmiy xat eng qimmat xato.
   *
   * Rad etilsa yozuv `xato` da qoladi: operator uni bekor qila oladi.
   */
  async qaytaUrin(id: string, userId: string): Promise<Talabnoma> {
    await this.sozlanganmi();
    const t = await this.d.talabnomalar.qaytaUrinishgaOl(id);
    if (!t) {
      if (!(await this.d.talabnomalar.findById(id))) throw new NotFoundError('Talabnoma', id);
      throw new ConflictError('Talabnomani qayta yuborib bo\'lmaydi — u xato holatida emas', 'QAYTA_URINIB_BOLMAYDI');
    }
    let h: Hujjat;
    let conversation: Conversation;
    try {
      h = await this.hujjat(t.contractId);
      // Avvalgi urinish aslida yetib borgan bo'lishi mumkin: dispatcher
      // Telegram'dan KEYIN ham yiqiladi (hisoblagich/holat yozuvi), yoki
      // `yuborildi` yozilmay qolgan osilgan yozuv. Ikkinchi nusxa o'rniga
      // o'sha xabarni qayd qilamiz.
      if (t.raqam !== null) {
        const oldingi = await this.d.messages.yuborilganFayl(t.clientId, faylNomi(talabnomaRaqami(t.raqam)));
        if (oldingi) return await this.yetibBorgan(t, h, oldingi, userId);
      }
      await this.crmdanYangila(t.contractId);
      // Sinx shartnomani yangilagan bo'lishi mumkin — PDF yangisidan chiqadi
      // (summa va rekvizit esa saqlangan nusxadan).
      h = await this.hujjat(t.contractId);
      const today = this.d.clock.todayIso();
      const n = await this.d.talabnomalar.nomzod(t.contractId, today, t.id);
      if (!n || !isContactable(h.client) || !ikkiOyTushmagan(await this.d.payments.listSchedule(t.contractId), today)) {
        throw endiKerakEmas();
      }
      this.yozsaBoladimi(h.client);
      conversation = await this.yuborishgaTayyorla(h);
    } catch (err) {
      await this.xatoniYoz(t.id, err);
      throw err;
    }
    return this.yuborVaYoz(t, h, conversation, userId, 'talabnoma.retried');
  }

  async bekorQil(id: string, userId: string): Promise<void> {
    const t = await this.d.talabnomalar.findById(id);
    if (!t) throw new NotFoundError('Talabnoma', id);
    // Fayl mijozda bo'lsa bekor qilish yolg'on: shartnoma nomzodlarga
    // qaytib, mijozga yangi ET raqamli ikkinchi xat ketardi. Bunday yozuvni
    // "qayta urinish" `yuborildi` deb tiklaydi.
    const yetgan = t.holat === 'xato' && t.raqam !== null
      ? await this.d.messages.yuborilganFayl(t.clientId, faylNomi(talabnomaRaqami(t.raqam)))
      : null;
    if (yetgan) {
      throw new ConflictError("Talabnoma mijozga yetib borgan — bekor qilib bo'lmaydi", 'TALABNOMA_YETIB_BORGAN');
    }
    if (!(await this.d.talabnomalar.bekorQil(id))) {
      throw new ConflictError('Faqat xato bilan qolgan talabnomani bekor qilish mumkin', 'BEKOR_QILIB_BOLMAYDI');
    }
    await this.d.audit.record({
      actor: userId, action: 'talabnoma.cancelled', entity: 'talabnoma', entityId: id,
      payload: { contractId: t.contractId, raqam: t.raqam !== null ? talabnomaRaqami(t.raqam) : null },
    });
  }

  /** Mijozga ketgan PDF'ning o'zi (qayta yasalmaydi). */
  async pdf(id: string): Promise<Buffer> {
    const t = await this.d.talabnomalar.findById(id);
    if (!t?.pdfPath) throw new NotFoundError('Talabnoma PDF', id);
    return this.d.storage.read(t.pdfPath);
  }

  /**
   * Chop etish uchun nusxa: mijozga ketgan hujjatning o'zi (o'sha ET raqami,
   * yuborilgan kun, saqlangan summa va rekvizit), faqat muhr va imzo
   * rasmlarisiz — operator qog'ozga qo'lda muhr bosib, imzolab arxivlaydi.
   * CRM sinxlanmaydi, holat o'zgarmaydi: bu faqat o'qish.
   */
  async chopEtish(id: string): Promise<Buffer> {
    const t = await this.d.talabnomalar.findById(id);
    if (!t) throw new NotFoundError('Talabnoma', id);
    if (t.holat !== 'yuborildi' || t.raqam === null || !t.sentAt) {
      throw new ConflictError('Faqat yuborilgan talabnomani chop etish mumkin', 'CHOP_ETIB_BOLMAYDI');
    }
    await this.sozlanganmi();
    const h = await this.hujjat(t.contractId);
    const kun = zonedParts(t.sentAt).isoDate;
    log.info({ talabnomaId: id, raqam: talabnomaRaqami(t.raqam) }, 'Talabnoma chop etish uchun (muhrsiz) yasalmoqda');
    return this.d.pdf.render(this.malumot(h, t.raqam, kun, t.summa, t.rekvizit), { muhrsiz: true });
  }

  // ---------------------------------------------------------------------

  /**
   * Raqam → PDF → Telegram → `yuborildi`. Telegram'gacha bo'lgan har
   * qanday xato yozuvni `xato` ga o'tkazadi: aks holda shartnoma
   * `yuborilmoqda` da osilib, operator 10 daqiqa hech narsa qila olmasdi.
   *
   * Fayl mijozga KETGANIDAN keyin (dispatcher Telegram'dan keyin yiqilsa)
   * `xato` qo'yilmaydi — o'sha xabar `yuborildi` deb qayd qilinadi: aks
   * holda operator uni bekor qilib yoki qayta urinib, mijozga ikkinchi
   * nusxani yuborib qo'yardi.
   */
  private async yuborVaYoz(
    t: Talabnoma,
    h: Hujjat,
    conversation: Conversation,
    userId: string,
    action: string,
  ): Promise<Talabnoma> {
    const today = this.d.clock.todayIso();
    let raqam: number | null = t.raqam;
    let etRaqam: string;
    let message: Awaited<ReturnType<MessageDispatcher['sendMedia']>>;
    try {
      raqam = await this.d.talabnomalar.raqamBer(t.id);
      etRaqam = talabnomaRaqami(raqam);
      const data = await this.d.pdf.render(this.malumot(h, raqam, today, t.summa, t.rekvizit));
      const ism = h.client.firstName ?? h.client.fullName;
      message = await this.d.dispatcher.sendMedia({
        conversation,
        data,
        fileName: faylNomi(etRaqam),
        mimeType: 'application/pdf',
        caption:
          `Assalomu alaykum, ${ism}! Shartnoma №${h.contract.contractNo} bo'yicha oxirgi ikki oylik ` +
          "to'lov tushmagani sababli Sizga rasmiy talabnoma yuboryapmiz. Iltimos, tanishib chiqing. " +
          "Agar to'lovni amalga oshirgan bo'lsangiz, chekini shu yerga yuboring — tezda tekshirib beramiz.",
        author: 'human',
        authorUserId: userId,
        asDocument: true,
      });
    } catch (err) {
      const yetgan = raqam !== null ? await this.yetibBorganXabar(t.clientId, raqam) : null;
      if (yetgan) {
        log.error({ err, talabnomaId: t.id }, 'Talabnoma yetib bordi, lekin keyingi yozuv yiqildi');
        return this.yetibBorgan({ ...t, raqam }, h, yetgan, userId);
      }
      await this.xatoniYoz(t.id, err);
      throw err;
    }

    return this.yuborildiDebYoz(t, h, { message, etRaqam, sentBy: userId, sentAt: this.d.clock.now(), action });
  }

  /**
   * Yuborish yiqilgandan keyingi qidiruv. Qidiruvning o'zi yiqilsa (baza)
   * `null`: yozuv `xato` ga tushadi, bekor qilishdagi tekshiruv esa
   * ikkinchi nusxani baribir to'sadi.
   */
  private async yetibBorganXabar(clientId: string, raqam: number): Promise<Message | null> {
    try {
      return await this.d.messages.yuborilganFayl(clientId, faylNomi(talabnomaRaqami(raqam)));
    } catch (e) {
      log.error({ err: e, clientId }, 'Yetib borgan talabnoma qidirilmadi');
      return null;
    }
  }

  /**
   * Suhbat va dispatcher'ning oldindan ma'lum shartlari. Tartib: avval
   * to'xtatish — u yoqilgan bo'lsa yangi suhbat ham ochilmasin.
   * Shartlar `MessageDispatcher.sendMedia` bilan bir xil: u baribir qayta
   * tekshiradi, bu yerda faqat raqam berishdan oldin rad etamiz.
   */
  private async yuborishgaTayyorla(h: Hujjat): Promise<Conversation> {
    if ((await this.d.settings.get()).killSwitch) throw new KillSwitchError();
    const conversation = await this.d.suhbat.tayyorla(h.client, h.contract);
    if (!conversation.telegramAccountId) throw new AppError('Telegram akkaunt tanlanmagan', 409, 'NO_ACCOUNT');
    const account = await this.d.accounts.findById(conversation.telegramAccountId);
    if (!account) throw new AppError('Telegram akkaunt topilmadi', 409, 'NO_ACCOUNT');
    if (!canReply(account, this.d.clock.now())) {
      throw new AppError(
        `"${account.label}" akkaunti hozir yubora olmaydi (ulanmagan yoki flood-wait)`,
        429,
        'ACCOUNT_UNAVAILABLE',
      );
    }
    return conversation;
  }

  /** Avvalgi urinishda yetib borgan xabarni qayd qiladi — qayta yubormaydi. */
  private async yetibBorgan(t: Talabnoma, h: Hujjat, message: Message, userId: string): Promise<Talabnoma> {
    log.warn(
      { talabnomaId: t.id, messageId: message.id },
      'Talabnoma avval yetib borgan ekan — qayta yuborilmadi, yuborildi deb belgilandi',
    );
    return this.yuborildiDebYoz(t, h, {
      message,
      etRaqam: talabnomaRaqami(t.raqam),
      sentBy: message.authorUserId ?? userId,
      // Muddat xabar ketgan kundan: bugundan hisoblansa, mijozga berilgan
      // muddat kechroq ko'rinardi.
      sentAt: message.sentAt ?? message.createdAt,
      action: 'talabnoma.recovered',
    });
  }

  /**
   * Bu yerdagi xato — bazaniki. Yozuv `yuborilmoqda` da qoladi va 10
   * daqiqadan keyin qayta urinishga ochiladi (u yerda yetib borgan xabar
   * topiladi); operator chatda fayl ketganini ko'radi.
   */
  private async yuborildiDebYoz(
    t: Talabnoma,
    h: Hujjat,
    p: { message: Message; etRaqam: string; sentBy: string; sentAt: Date; action: string },
  ): Promise<Talabnoma> {
    const { message, sentBy, sentAt, action } = p;
    const kun = zonedParts(sentAt).isoDate;
    const { kuchgaKirishIso, muddatIso } = talabnomaMuddatlari(kun, await this.d.holidays.list());
    if (!message.media?.path) {
      log.warn({ talabnomaId: t.id, messageId: message.id }, 'Yuborilgan xabarda fayl yo\'li yo\'q — PDF ochilmaydi');
    }
    await this.d.talabnomalar.yuborildi(t.id, {
      // `sendMedia` faylni o'zi saqlaydi — chatdagi va bu yerdagi fayl bitta.
      pdfPath: message.media?.path ?? '',
      messageId: message.id,
      kuchgaKirish: kuchgaKirishIso,
      muddatSanasi: muddatIso,
      sentBy,
      sentAt,
    });
    try {
      await this.d.audit.record({
        actor: sentBy, action, entity: 'talabnoma', entityId: t.id,
        payload: {
          raqam: p.etRaqam, contractNo: h.contract.contractNo, mijoz: h.client.fullName,
          summa: t.summa, kompaniya: t.rekvizit.kompaniya, muddat: muddatIso,
        },
      });
    } catch (err) {
      log.error({ err, talabnomaId: t.id }, 'Talabnoma yuborildi, lekin jurnalga yozilmadi');
    }
    const yangi = await this.d.talabnomalar.findById(t.id);
    if (!yangi) throw new NotFoundError('Talabnoma', t.id);
    return yangi;
  }

  private async xatoniYoz(id: string, err: unknown): Promise<void> {
    log.warn({ err, talabnomaId: id }, 'Talabnoma yuborilmadi');
    try {
      await this.d.talabnomalar.xato(id, xabari(err));
    } catch (e) {
      // Asl xato muhimroq — uni yashirmaymiz; holat 10 daqiqadan keyin
      // `qaytaUrinishgaOl` orqali baribir tiklanadi.
      log.error({ err: e, talabnomaId: id }, 'Talabnoma xato holatiga o\'tkazilmadi');
    }
  }

  /**
   * Telegramdagi ism mos kelmagan mijozga rasmiy xat ketmaydi: raqam
   * boshqa odamga o'tgan bo'lishi mumkin. Operator avval mijoz kartasida
   * mos kelmaslikni hal qiladi.
   */
  private yozsaBoladimi(client: Client): void {
    if (client.telegramStatus === 'name_mismatch') {
      throw new ConflictError(
        "Telegramdagi ism mijozning ismiga mos kelmaydi — avval mijoz kartasida tasdiqlang",
        'TELEGRAM_NOMI_MOS_EMAS',
      );
    }
  }

  private async sozlanganmi(): Promise<void> {
    if (!(await this.d.pdf.tayyormi())) {
      throw new AppError(
        'Talabnoma sozlanmagan: muhr/imzo rasmlari yoki Chrome serverda yo\'q',
        503,
        'TALABNOMA_SOZLANMAGAN',
      );
    }
  }

  /** `disabled` — sinx o'chiq muhit: bazadagi ma'lumot bilan davom etamiz. */
  private async crmdanYangila(contractId: string): Promise<void> {
    const sync = await this.d.contractSync.syncOne(contractId);
    if (sync.outcome === 'disabled') {
      log.info({ contractId }, 'CRM sinxi o\'chiq — talabnoma bazadagi ma\'lumot bilan tekshiriladi');
      return;
    }
    if (sync.outcome === 'not_found') throw new ConflictError("CRM: shartnoma CRM'da topilmadi", 'CRM');
    if (sync.outcome === 'error') {
      throw new ConflictError(`CRM: shartnoma yangilanmadi (${sync.error ?? "noma'lum xato"})`, 'CRM');
    }
  }

  private rekvizitShart(r: RekvizitNatija): Rekvizit {
    if (!r.ok) throw new ConflictError(`REKVIZIT: ${r.sabab}`, 'REKVIZIT');
    return r.rekvizit;
  }

  private async hujjat(contractId: string): Promise<Hujjat> {
    const contract = await this.d.contracts.findById(contractId);
    if (!contract) throw new NotFoundError('Shartnoma', contractId);
    const client = await this.d.clients.findById(contract.clientId);
    if (!client) throw new NotFoundError('Mijoz', contract.clientId);
    // Manzilsiz rasmiy hujjat yaroqsiz — taxminiy qiymat qo'ymaymiz.
    if (!contract.objectName) throw new ConflictError('MALUMOT_YETISHMAYDI: obyekt nomi', 'MALUMOT_YETISHMAYDI');
    if (!contract.objectAddress) {
      throw new ConflictError('MALUMOT_YETISHMAYDI: obyekt manzili', 'MALUMOT_YETISHMAYDI');
    }
    return { contract, client, objectName: contract.objectName, objectAddress: contract.objectAddress };
  }

  private malumot(h: Hujjat, raqam: number | null, sanaIso: string, summa: number, rekvizit: Rekvizit): TalabnomaMalumot {
    return {
      raqam,
      sanaIso,
      fullName: h.client.fullName,
      contractNo: h.contract.contractNo,
      contractDate: h.contract.contractDate,
      objectName: h.objectName,
      objectAddress: h.objectAddress,
      summa,
      rekvizit,
    };
  }
}
