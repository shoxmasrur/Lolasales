import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { ITelegramGateway } from '@/domain/services/ITelegramGateway';
import type { IClock } from '@/domain/services/support';
import { ulanishQarori } from '@/domain/services/ulanishHolati';
import { childLogger } from '@/shared/logger';

const log = childLogger('connection-watch');

/** Har 2 daqiqada — uzilishni tez sezish uchun yetarli, yuk esa kichik. */
const CHECK_INTERVAL_MS = 2 * 60 * 1000;

/**
 * Uzilib qolgan Telegram akkauntlarni topib, qayta ulaydi.
 *
 * NEGA KERAK: `teleproto` proksi orqali qayta ulanishga urinadi, lekin
 * taslim bo'lsa klient o'lik holatda qoladi va HECH NARSA uni
 * tiklamasdi — akkaunt panelda ulangan ko'rinib, amalda ishlamasdi
 * (2026-08-09). `reconnect()` metodi bor edi, uni faqat hech kim
 * chaqirmasdi.
 *
 * Qaysi akkauntga tegish kerakligini `ulanishQarori()` hal qiladi —
 * qoidalar sof funksiyada va alohida tekshiriladi.
 */
export class TelegramConnectionWatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /**
   * Akkaunt id → oxirgi MUVAFFAQIYATSIZ urinish vaqti.
   *
   * Xotirada: bu ish holati, tarix emas. Xizmat qayta ishga tushganda
   * baribir hammasi qaytadan uriniladi.
   */
  private readonly xatolar = new Map<string, Date>();

  constructor(
    private readonly accounts: ITelegramAccountRepository,
    private readonly gateway: ITelegramGateway,
    private readonly clock: IClock,
    /**
     * Qayta ulangach o'tkazib yuborilgan xabarlarni tiklaydi.
     *
     * Aylana bog'lanishni uzish uchun funksiya sifatida beriladi:
     * tiklash zanjiri oxir-oqibat shu kuzatuvchiga qaytib keladi.
     */
    private readonly onReconnected?: (accountId: string) => Promise<void>,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.checkAll(), CHECK_INTERVAL_MS);
    // Ilova yopilishini ushlab turmasin.
    this.timer.unref?.();
    log.info('Ulanish kuzatuvchisi ishga tushdi');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async checkAll(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const hozir = this.clock.now();
      const accounts = await this.accounts.list();

      for (const account of accounts) {
        const qaror = ulanishQarori({
          account,
          ulanganmi: this.gateway.isConnected(account.id),
          oxirgiXatoUrinishi: this.xatolar.get(account.id) ?? null,
          hozir,
        });

        if (qaror !== 'qayta_ulash') {
          // Tirik akkauntning eski xatosi ahamiyatsiz — tozalaymiz,
          // aks holda keyingi uzilishda tanaffus noto'g'ri hisoblanardi.
          if (qaror === 'ulangan') this.xatolar.delete(account.id);
          continue;
        }

        try {
          await this.gateway.reconnect(account.id);

          // `MtprotoTelegramGateway.reconnect()` muvaffaqiyatsizlikda ham
          // RAD ETMAYDI: ichida o'zi ushlab, `Qayta ulanmadi` deb
          // jurnallab, akkauntni `error` holatiga o'tkazadi va oddiy
          // qaytadi (qarang: MtprotoTelegramGateway.ts). Shu sabab
          // natijani `throw`ning yo'qligidan emas, `isConnected()`dan
          // bilib olamiz — aks holda bu yerda HAR DOIM "muvaffaqiyat"
          // deb hisoblanardi, xato hech qachon `xatolar`ga tushmasdi va
          // 5 daqiqalik tanaffus o'lik kod bo'lib qolardi.
          if (this.gateway.isConnected(account.id)) {
            this.xatolar.delete(account.id);
            log.info({ account: account.label }, 'Akkaunt qayta ulandi');

            // Uzilish paytida kelgan xabarlar jonli oqimga tushmagan —
            // ularni Telegramdan tortib olamiz. Ular orasida "pul
            // to'ladim" va chek rasmlari bo'ladi.
            await this.onReconnected?.(account.id);
          } else {
            this.xatolar.set(account.id, hozir);
            log.warn({ account: account.label }, 'Qayta ulanmadi');
          }
        } catch (err) {
          // `reconnect()` odatda rad etmaydi (yuqoridagi izohga qarang),
          // lekin `setStatus` ichidagi kutilmagan DB xatosi hali ham chin
          // `throw` bo'lishi mumkin. Bitta akkauntdagi bunday xato
          // qolganlarini TO'XTATMASLIGI uchun shu yerda ham ushlanadi.
          this.xatolar.set(account.id, hozir);
          log.warn({ account: account.label, err }, 'Qayta ulanmadi');
        }
      }
    } catch (err) {
      log.error({ err }, 'Ulanish kuzatuvchisi tsiklida xato');
    } finally {
      this.running = false;
    }
  }
}
