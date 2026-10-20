import type { Purchase, XaridBosqichi } from '@/domain/entities/Purchase';

export interface IPurchaseRepository {
  findById(id: string): Promise<Purchase | null>;
  findActiveByClient(clientId: string): Promise<Purchase | null>;
  findLatestByClient(clientId: string): Promise<Purchase | null>;
  /** Bir nechta mijozning faol (yo'q bo'lsa oxirgi) xaridi — ro'yxat uchun. */
  /** Mijoz to'liq to'lagan (`toladi`) xaridlarining kurs id lari, takrorsiz. */
  listPaidCourseIds(clientId: string): Promise<string[]>;
  findCurrentByClients(clientIds: string[]): Promise<Map<string, Purchase>>;
  create(data: { clientId: string; courseId: string | null; totalAmount: number | null }): Promise<Purchase>;
  setStage(id: string, stage: XaridBosqichi): Promise<Purchase>;
  setCourse(id: string, courseId: string, totalAmount: number): Promise<Purchase>;
  setInstallment(id: string, installment: boolean): Promise<void>;
  addPaid(id: string, amount: number): Promise<Purchase>;
  /** Faqat `link_sent_at` null bo'lsa true. */
  markLinkSent(id: string, at: Date): Promise<boolean>;
  addRemindedStage(id: string, stage: XaridBosqichi): Promise<void>;
  countByStage(): Promise<Record<XaridBosqichi, number>>;
}
