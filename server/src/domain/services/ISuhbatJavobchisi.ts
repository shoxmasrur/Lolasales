/**
 * Suhbatga javob beruvchi — `ReplyDebouncer` faqat shu ikki amalni biladi.
 *
 * NEGA KERAK: debouncer (taymer, bufer, suhbat bo'yicha ketma-ketlik) hamma
 * suhbat turi uchun umumiy. Kim javob berishi esa suhbat turiga bog'liq
 * (asosiy agent yoki noma'lum mijoz agenti).
 */
export interface ISuhbatJavobchisi {
  reply(conversationId: string, incoming: string): Promise<unknown>;
  /** To'xtatilgan navbatlar soni (hech biri ishlamasa 0). */
  abort(conversationId: string, reason?: 'operator' | 'stale'): number;
}
