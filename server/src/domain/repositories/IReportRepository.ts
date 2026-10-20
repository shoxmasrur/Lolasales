import type { AttributedPayment, Buckets } from '@/domain/services/attributionBuckets';
import type { XomTolov } from '@/domain/services/tushumBelgilari';

export interface GroupResult {
  /** Guruhdagi mijozlar soni. */
  readonly clients: number;
  /** Shundan hech bo'lmasa bitta to'lov qilganlari. */
  readonly paidClients: number;
  readonly amount: number;
  readonly buckets: Buckets;
}

export interface AttributionReport {
  /** YYYY-MM-DD */
  readonly from: string;
  readonly to: string;
  /** Davr ichida birinchi xabar yuborilgan mijozlar. */
  readonly contacted: GroupResult;
  /**
   * Kechikkan to'lovi bor, lekin chiquvchi xabar umuman ketmagan mijozlar.
   * Ular uchun anchor — davrning boshlanishi.
   */
  readonly notContacted: GroupResult;
}

export interface CampaignAttribution {
  readonly campaignId: string;
  readonly name: string;
  /** Kampaniya doirasida xabar ketgan mijozlar soni. */
  readonly sent: number;
  readonly paidClients: number;
  readonly amount: number;
}

export interface ClientAttribution {
  /** ISO 8601 — birinchi chiquvchi xabar vaqti. */
  readonly anchorAt: string | null;
  readonly amount: number;
  readonly payments: AttributedPayment[];
}

export interface TushumFiltri {
  /** YYYY-MM-DD, ikkala chegara ham kiradi. */
  readonly from: string;
  readonly to: string;
  /** true — bahsli to'lovlar ham qo'shiladi. */
  readonly bahsli: boolean;
  /** Shartnoma raqami yoki mijoz ismi bo'lagi. */
  readonly q: string | null;
}

export interface UslubQatori {
  readonly styleVersion: 'v1' | 'v2';
  /** Davrda shu uslubda tamg'alangan chiquvchi agent xabarlari soni. */
  readonly xabarlar: number;
  /** Foiz: xabardan keyin 3 kun ichida mijozdan javob kelgan. */
  readonly javob3Kun: number;
  /**
   * Foiz: suhbatning DAVR ICHIDAGI oxirgi tamg'alangan xabaridan keyin
   * shu suhbatda va'da olingan. Suhbat darajasida — bitta suhbatda bir
   * necha tamg'alangan xabar bo'lishi mumkin, lekin natija faqat oxirgisiga
   * yoziladi (taxminiy bog'lanish, sabab isboti emas).
   */
  readonly vadaOlingan: number;
  /**
   * Foiz: xuddi shu qoida bilan — suhbatning oxirgi tamg'alangan xabaridan
   * keyingi 14 kun ichida mijozning shartnoma bo'yicha to'lovi (`date_paid`)
   * bo'lgan.
   */
  readonly tolov14Kun: number;
  /** O'rtacha so'z soni (bo'sh joy bilan ajratilgan taxminiy hisob). */
  readonly ortachaSoz: number;
  /**
   * Foiz: "qisqa javob" ulushi — 3 so'zdan kam yoki teng. Bu chegara
   * 2026-09-28 auditidagi ta'rif bilan bir xil (jamoada 47,4%, agentda
   * 2,4%) — aks holda bu ko'rsatkichlar o'sha audit raqamlari bilan
   * solishtirib bo'lmaydigan bo'lib qoladi.
   */
  readonly qisqaUlush: number;
}

export interface IReportRepository {
  /** Davr bo'yicha, solishtirish guruhi bilan. */
  attribution(fromIso: string, toIso: string): Promise<AttributionReport>;
  /** Kampaniyalar kesimi — eng yangisi birinchi. */
  byCampaign(limit: number): Promise<CampaignAttribution[]>;
  /** Bitta mijoz: birinchi xabar vaqti va undan keyingi to'lovlar. */
  forClient(clientId: string): Promise<ClientAttribution>;
  /** Davrda tushgan bank to'lovlari — grafik va birinchi xabar sanasi bilan. */
  paymentsForExport(f: TushumFiltri): Promise<XomTolov[]>;
  /** v1/v2 uslublarini taqqoslash — kuzatuv, tajriba emas. */
  uslubTaqqoslash(from: string, to: string): Promise<UslubQatori[]>;
}
