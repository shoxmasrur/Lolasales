import type { ISuhbatJavobchisi } from '@/domain/services/ISuhbatJavobchisi';

/**
 * Kelgan xabarga kim javob berishini suhbat turiga qarab tanlaydi.
 *
 * Yangi javob rejimi (masalan boshqa kanal) yangi javobchi sifatida
 * qo'shiladi — `ReplyDebouncer` va `AgentRunner` o'zgarmaydi.
 */
export class JavobYonaltiruvchi implements ISuhbatJavobchisi {
  constructor(
    private readonly asosiy: ISuhbatJavobchisi,
    private readonly nomalum: ISuhbatJavobchisi,
    private readonly nomalummi: (conversationId: string) => Promise<boolean>,
  ) {}

  async reply(conversationId: string, incoming: string): Promise<unknown> {
    const javobchi = (await this.nomalummi(conversationId)) ? this.nomalum : this.asosiy;
    return javobchi.reply(conversationId, incoming);
  }

  /**
   * Ikkalasiga ham yuboriladi: bu yerda suhbat turini so'rash uchun
   * asinxron qidiruv kerak bo'lardi, abort esa sinxron va tez bo'lishi
   * shart. Qaysi biri navbatni ushlab turganini bilmaymiz — ishlamayotgani
   * shunchaki 0 qaytaradi. Debouncerning 'stale' uzishi ham shu yo'l bilan
   * noma'lum agentga yetadi.
   */
  abort(conversationId: string, reason: 'operator' | 'stale' = 'operator'): number {
    return this.asosiy.abort(conversationId, reason) + this.nomalum.abort(conversationId, reason);
  }
}
