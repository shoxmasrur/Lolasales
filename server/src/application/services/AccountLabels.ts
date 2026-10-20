import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import { childLogger } from '@/shared/logger';

const log = childLogger('account-labels');

/**
 * Telegram akkaunt id → ko'rinadigan nomi (`Madina`, `Nafosat`).
 *
 * NEGA KESH: jurnal qatoriga nomni qo'shish uchun bazaga borib bo'lmaydi —
 * `log.warn(...)` sinxron chaqiriladi va uni `await` qilib bo'lmaydi. Xato
 * ko'p bo'lganda har qator uchun `findById` qilish esa keraksiz so'rovlar
 * oqimini beradi.
 *
 * Akkauntlar kam (o'nlab) va nomlari deyarli o'zgarmaydi, shuning uchun
 * butun xarita xotirada turadi.
 *
 * Keshda topilmagan id — yangi qo'shilgan yoki nomi o'zgargan akkaunt.
 * Bunday holatda `null` qaytariladi (jurnalda `akkaunt` maydoni shunchaki
 * bo'lmaydi) va fon rejimida yangilash boshlanadi, ya'ni keyingi qatorda
 * nom chiqadi. Bu ataylab shunday: jurnal hech qachon asosiy ishni
 * sekinlashtirmasligi yoki yiqitmasligi kerak.
 */
export class AccountLabels {
  private labels = new Map<string, string>();
  /** Bir vaqtda bitta yangilash — bir nechta xato ketma-ket kelganda. */
  private yangilanmoqda: Promise<void> | null = null;

  constructor(private readonly accounts: ITelegramAccountRepository) {}

  async refresh(): Promise<void> {
    if (this.yangilanmoqda) return this.yangilanmoqda;

    this.yangilanmoqda = (async () => {
      try {
        const all = await this.accounts.list();
        const next = new Map<string, string>();
        for (const a of all) next.set(a.id, a.label);
        this.labels = next;
      } catch (err) {
        // Jurnal uchun yordamchi ma'lumot — u yiqilsa ham ilova ishlashda
        // davom etishi kerak.
        log.warn({ err }, 'Akkaunt nomlarini yangilab bo\'lmadi');
      } finally {
        this.yangilanmoqda = null;
      }
    })();

    return this.yangilanmoqda;
  }

  /** Sinxron: jurnal yozish nuqtasida kutib turib bo'lmaydi. */
  labelOf(accountId: string | null | undefined): string | null {
    if (!accountId) return null;
    const label = this.labels.get(accountId);
    if (label) return label;

    // Noma'lum id — xaritani fon rejimida yangilaymiz.
    void this.refresh();
    return null;
  }
}
