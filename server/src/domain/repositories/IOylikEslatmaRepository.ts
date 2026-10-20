import type { EslatmaGuruhi } from '@/domain/services/oylikEslatma';

/** Eslatma kutayotgan to'lov qatori va u yuboriladigan suhbat. */
export interface OylikEslatmaNomzodi {
  readonly conversationId: string;
  readonly clientId: string;
  readonly contractId: string;
  /** YYYY-MM-DD */
  readonly datePayment: string;
}

export interface QatorKaliti {
  readonly contractId: string;
  readonly datePayment: string;
}

export interface OylikEslatmaYozuvi extends QatorKaliti {
  readonly clientId: string;
  readonly guruh: EslatmaGuruhi;
  readonly holat: 'sent' | 'skipped';
  readonly sabab: string | null;
}

export interface IOylikEslatmaRepository {
  /**
   * `date_payment` [dan, gacha] oralig'idagi, hali eslatma yozilmagan,
   * to'lanmagan oylik qatorlar — eng eski sana birinchi. Suhbat, mijoz,
   * va'da va chek filtrlari SQL ichida.
   */
  nomzodlar(danIso: string, gachaIso: string, limit: number): Promise<OylikEslatmaNomzodi[]>;
  /** `ON CONFLICT DO NOTHING`. Qaytadi: nechta qator qo'shildi. */
  yoz(yozuvlar: OylikEslatmaYozuvi[]): Promise<number>;
  holatniOzgartir(kalitlar: QatorKaliti[], holat: 'sent' | 'skipped', sabab: string | null): Promise<void>;
  /** CRM yiqilganda — qator navbatga qaytadi. */
  ochir(kalitlar: QatorKaliti[]): Promise<void>;
  /** Bugun (loyiha vaqt mintaqasida) `sent` bo'lib yozilganlar soni. */
  bugunYuborilgan(todayIso: string): Promise<number>;
}
