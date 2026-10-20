import type { ISuhbatJavobchisi } from '@/domain/services/ISuhbatJavobchisi';
import { AbortedError, StaleTurnError, ValidationError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('debounce');

/**
 * Ketma-ket kelgan xabarlarni bitta javobga birlashtiradi.
 *
 * Muammo: odam Telegramda fikrini bo'lib-bo'lib yozadi — avval "salom",
 * keyin "to'ladim". Har bir xabar alohida agent chaqiruvini boshlaganda ikki
 * xato yuz beradi:
 *   1) mijoz bitta savolga ikkita javob oladi (ikkalasi ham salomlashadi);
 *   2) ikkinchi chaqiruv birinchisining javobini tarixda KO'RMAYDI, chunki u
 *      hali yuborilmagan — natijada agent suhbat mazmunini yo'qotadi.
 *
 * Yechim: xabar kelganda taymer qo'yiladi. Yangi xabar kelsa taymer qaytadan
 * boshlanadi. Mijoz yozishdan to'xtagach, to'plangan xabarlar BITTA matn
 * sifatida agentga beriladi.
 *
 * Bundan tashqari bir suhbat uchun bir vaqtda faqat bitta agent chaqiruvi
 * ketadi: ishlayotgan payt kelgan xabarlar navbatda kutadi.
 */
export class ReplyDebouncer {
  private readonly buffers = new Map<string, string[]>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Set<string>();

  constructor(
    private readonly agent: ISuhbatJavobchisi,
    private readonly delayMs: number,
    /** Agent xato bersa chaqiriladi (suhbatni operatorga chiqarish uchun). */
    private readonly onError: (conversationId: string, err: unknown) => Promise<void>,
  ) {}

  /** Kiruvchi xabarni navbatga qo'yadi va taymerni qaytadan boshlaydi. */
  push(conversationId: string, text: string): void {
    const buffer = this.buffers.get(conversationId) ?? [];
    buffer.push(text);
    this.buffers.set(conversationId, buffer);
    this.arm(conversationId);

    // Ketayotgan navbat bo'lsa — uzamiz. U hozirgina eskirdi: mijoz gapini
    // davom ettirdi, tayyor bo'layotgan matn esa o'tib ketgan savolga javob
    // beradi. Oxirigacha kutish ikki tomondan ham zarar — javobi yaroqsiz,
    // tokenlari esa sarflanadi (prodda bitta shunday navbat $0.38 turgan).
    //
    // Aynan SHU YERDA uzamiz, `HandleIncomingMessage` da emas: buferga
    // xabar qo'yilgani keyingi navbat albatta bo'lishini kafolatlaydi.
    // Javob talab qilmaydigan xabar (masalan izohsiz stiker) bu yergacha
    // yetib kelmaydi — ya'ni u ketayotgan javobni bekorga o'ldirmaydi.
    this.agent.abort(conversationId, 'stale');
  }

  /** Shu suhbatda javob kutayotgan xabar bormi. */
  hasPending(conversationId: string): boolean {
    return Boolean(this.buffers.get(conversationId)?.length);
  }

  /** Kutilayotgan javoblarni darhol yuboradi (server to'xtayotganda). */
  async flushAll(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.all([...this.buffers.keys()].map((id) => this.flush(id)));
  }

  /**
   * Bitta agent chaqiruvini navbat qulfi ostida bajaradi.
   *
   * "Qayta urinish" tugmasi uchun kerak: qulfsiz chaqiruv aynan debouncer
   * javob yozayotgan paytga tushib qolishi va mijoz IKKITA xabar olishi
   * mumkin — bu debouncer umuman shu narsa uchun yozilgan.
   */
  async runNow<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
    if (this.running.has(conversationId)) {
      throw new ValidationError('Agent hozir shu suhbatda ishlayapti — biroz kuting');
    }
    this.running.add(conversationId);
    // Chaqiruvchi (masalan "Qayta urinish") buferdagi xabarlarni BAZADAN
    // o'qib oladi va ularga javob beradi. Bufer joyida qolsa, taymer
    // otganda o'sha xabar IKKINCHI marta javob olardi — mijoz bitta
    // savoliga ikkita javob ko'rardi. Shuning uchun qulf olingandan keyin,
    // `fn` chaqirilishidan OLDIN kutayotgan taymer va buferni tozalaymiz.
    const pending = this.timers.get(conversationId);
    if (pending) {
      clearTimeout(pending);
      this.timers.delete(conversationId);
    }
    this.buffers.delete(conversationId);
    try {
      return await fn();
    } finally {
      this.running.delete(conversationId);
      // Qulf ushlab turilgan payt kelgan xabar buferda qolib ketmasin:
      // `flush` band deb chiqib ketgan va taymerini o'chirib yuborgan bo'lishi
      // mumkin, ya'ni uni qaytadan qo'yadigan boshqa hech kim yo'q.
      if (this.buffers.get(conversationId)?.length) this.arm(conversationId);
    }
  }

  /** Taymerni qo'yadi (yoki qaytadan boshlaydi). */
  private arm(conversationId: string): void {
    const existing = this.timers.get(conversationId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.timers.delete(conversationId);
      void this.flush(conversationId);
    }, this.delayMs);

    // Taymer jarayonni tirik ushlab turmasin.
    timer.unref?.();
    this.timers.set(conversationId, timer);
  }

  private async flush(conversationId: string): Promise<void> {
    // Shu suhbat uchun agent allaqachon ishlayapti — tugagach o'zi qayta oladi.
    if (this.running.has(conversationId)) return;

    const buffer = this.buffers.get(conversationId);
    if (!buffer?.length) return;
    this.buffers.delete(conversationId);

    const text = buffer.join('\n');
    this.running.add(conversationId);

    try {
      if (buffer.length > 1) {
        log.info({ conversationId, count: buffer.length }, 'Xabarlar bitta javobga birlashtirildi');
      }
      await this.agent.reply(conversationId, text);
    } catch (err) {
      // Operator "Agent" tugmasini o'chirgani uchun uzilish — NOSOZLIK
      // EMAS, QAROR. `onError` suhbatni odamga chiqarib, chatda "Agent
      // vaqtincha ishlamadi" bannerini va "Qayta urinish" tugmasini
      // ko'rsatardi: operator o'zi bosgan tugmaning natijasini nosozlik
      // deb o'qib, uni bekor qilishga taklif qilinardi.
      if (err instanceof StaleTurnError) {
        // Navbatni O'ZIMIZ uzdik, chunki mijoz yangi xabar yubordi.
        // Uzilgan navbatning matnlari hali JAVOB OLMAGAN, shuning uchun
        // ular buferning BOSHIGA qaytariladi — keyingi navbat mijozning
        // butun gapini ko'radi. Qaytarilmasa "Bugun to'layman" yo'qolib,
        // agent faqat undan keyingi "Insha'Alloh" ga javob berardi.
        this.buffers.set(conversationId, [...buffer, ...(this.buffers.get(conversationId) ?? [])]);
        log.info({ conversationId, count: buffer.length }, 'Navbat eskirdi — yangi xabar bilan qayta beriladi');
      } else if (err instanceof AbortedError) {
        log.info({ conversationId }, 'Agent navbati to\'xtatildi — javob yuborilmadi');
      } else {
        log.error({ conversationId, err }, 'Agent javobida xato');
        await this.onError(conversationId, err).catch(() => undefined);
      }
    } finally {
      this.running.delete(conversationId);
    }

    // Agent ishlayotgan payt yangi xabar kelgan bo'lsa — yana bir navbat.
    if (this.buffers.get(conversationId)?.length) this.arm(conversationId);
  }
}
