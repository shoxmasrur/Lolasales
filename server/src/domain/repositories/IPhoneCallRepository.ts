import type { PhoneCall, QongiroqNatijasi } from '@/domain/entities/PhoneCall';

export interface PhoneCallUpsert {
  readonly externalId: string;
  readonly clientId: string;
  readonly contractId: string | null;
  readonly agentKey: string;
  readonly agentName: string;
  readonly phone: string | null;
  readonly startedAt: Date;
  readonly durationSec: number;
  readonly outcome: QongiroqNatijasi;
  readonly summary: string | null;
  readonly transcript: string | null;
  readonly promiseDate: string | null;
  readonly promiseAmount: number | null;
  readonly createdByUserId: string;
}

export interface AgentHisobotQatori {
  readonly agentKaliti: string;
  readonly agentIsmi: string;
  readonly qongiroqlar: number;
  readonly gaplashildi: number;
  readonly kotarmadi: number;
  readonly band: number;
  readonly boshqaOdam: number;
  readonly raqamNotogri: number;
  readonly vadalar: number;
  readonly bajarilgan: number;
  readonly buzilgan: number;
  readonly jamiSoniya: number;
}

export interface IPhoneCallRepository {
  findByExternal(createdByUserId: string, externalId: string): Promise<PhoneCall | null>;
  /** `(created_by_user_id, external_id)` bo'yicha: yo'q bo'lsa qo'shadi, bor bo'lsa yangilaydi. */
  upsert(data: PhoneCallUpsert): Promise<PhoneCall>;
  setPromiseId(id: string, promiseId: string | null): Promise<void>;
  /** Eng yangisi birinchi. `since` berilsa — faqat shundan keyingilar. */
  listRecentForClient(clientId: string, limit: number, since?: Date): Promise<PhoneCall[]>;
  /** @returns nechta qatorning transkripti tozalangani */
  clearTranscriptsOlderThan(days: number): Promise<number>;
  /**
   * Agentlar kesimidagi hisobot. `from`/`to` — `timeZone` dagi kunlar,
   * `to` kuni oxirigacha kiradi. Eng ko'p qo'ng'iroq qilgan agent birinchi.
   */
  agentlarHisoboti(from: string, to: string, timeZone: string): Promise<AgentHisobotQatori[]>;
}
