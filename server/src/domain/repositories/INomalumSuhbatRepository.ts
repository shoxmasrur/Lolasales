import type { NomalumHolat, NomalumSuhbat } from '@/domain/entities/NomalumSuhbat';

export interface INomalumSuhbatRepository {
  /** Bo'lmasa ochadi; `telegramTelefon` berilsa (normallashtirilgan) yozadi. */
  ensure(conversationId: string, telegramTelefon?: string | null): Promise<NomalumSuhbat>;
  find(conversationId: string): Promise<NomalumSuhbat | null>;
  update(conversationId: string, patch: Partial<Pick<NomalumSuhbat,
    'holat' | 'agentJavoblari' | 'urinishlar' | 'topilmagan' | 'shartnomaRaqami' | 'topilganClientId' | 'sabab'>>): Promise<NomalumSuhbat>;
  /**
   * Holatni faqat u hozir `eski` bo'lsa `yangi` ga o'tkazadi (compare-and-set).
   * `true` — aynan shu chaqiruv o'tkazdi. Bir vaqtda kelgan ikki hodisadan
   * (masalan, ikki rasm) faqat bittasi o'tishni "yutadi".
   */
  holatniAlmashtir(conversationId: string, eski: NomalumHolat, yangi: NomalumHolat): Promise<boolean>;
}
