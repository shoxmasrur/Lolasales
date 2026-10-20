import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { RekvizitManbai } from '@/application/services/RekvizitManbai';
import type { ITalabnomaRepository } from '@/domain/repositories/ITalabnomaRepository';
import type { IClock } from '@/domain/services/support';
import { sleep } from '@/shared/datetime';
import { childLogger } from '@/shared/logger';

const log = childLogger('talabnoma-crm');

export type CrmYangilashHolati = 'bosh' | 'ishlayapti' | 'tugadi' | 'xato';

export interface CrmYangilashVazifasi {
  holat: CrmYangilashHolati;
  /** Sinxlanadigan shartnomalar soni (INN yoki manzili yo'q nomzodlar). */
  jami: number;
  bajarildi: number;
  /** CRM'dan muvaffaqiyatli yangilanganlar. */
  yangilandi: number;
  /** Topilmagan yoki yiqilgan shartnomalar soni. */
  xatolar: number;
  /** ISO vaqt. */
  boshlangan: string | null;
  tugagan: string | null;
  /** Faqat `holat='xato'`: vazifaning o'zi nega to'xtadi. */
  sabab: string | null;
}

export interface TalabnomaCrmYangilashDeps {
  talabnomalar: Pick<ITalabnomaRepository, 'nomzodlar'>;
  rekvizitManbai: Pick<RekvizitManbai, 'keshniTashla'>;
  contractSync: Pick<ContractSyncService, 'syncOne'>;
  clock: IClock;
  /** Kechasigi to'liq sinx (`ContractSyncScheduler.isRunning`) ketyaptimi. */
  nightlyBusy: () => boolean;
  /** Ikki CRM so'rovi orasidagi pauza (`CONTRACTS_SYNC_DELAY_MS`). */
  pauzaMs: number;
  /** Kechasigi sinxni qayta tekshirish oralig'i. */
  kutishMs?: number;
  /** Testlar uchun: haqiqiy `sleep` o'rniga. */
  kut?: (ms: number) => Promise<void>;
}

const BOSH: CrmYangilashVazifasi = {
  holat: 'bosh', jami: 0, bajarildi: 0, yangilandi: 0, xatolar: 0, boshlangan: null, tugagan: null, sabab: null,
};

/** INN yoki manzil hali bazada yo'q — talabnoma hujjati uchun CRM'dan kerak. */
const yetishmaydi = (n: { companyInn: string | null; objectAddress: string | null }): boolean =>
  !(n.companyInn ?? '').trim() || !n.objectAddress;

const xabari = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * «CRM'dan yangilash» (Talabnomalar sahifasi): yangi ustunlar
 * (`company_inn`, `object_address`) faqat shartnoma CRM'dan sinxlanganda
 * to'ladi — deploy'dan keyin kechasigi sinxni kutmasdan, faqat talabnoma
 * nomzodlarini bittadan yangilaydi.
 *
 * Holat xotirada: vazifa bir necha daqiqalik, deploy uni to'xtatsa
 * operator qayta bosadi (tiklash uchun jadval ortiqcha).
 */
export class TalabnomaCrmYangilash {
  private v: CrmYangilashVazifasi = { ...BOSH };
  private ish: Promise<void> | null = null;

  constructor(private readonly d: TalabnomaCrmYangilashDeps) {}

  holat(): CrmYangilashVazifasi {
    return { ...this.v };
  }

  /** Bir vaqtda bitta: ketayotgan bo'lsa yangisi boshlanmaydi, joriy holat qaytadi. */
  boshla(): CrmYangilashVazifasi {
    if (this.v.holat === 'ishlayapti') return this.holat();
    this.v = { ...BOSH, holat: 'ishlayapti', boshlangan: this.d.clock.now().toISOString() };
    this.ish = this.yurgiz().finally(() => {
      this.ish = null;
    });
    return this.holat();
  }

  /** Joriy vazifa tugashini kutadi (testlar va to'xtatish uchun). */
  async tugashi(): Promise<void> {
    await this.ish;
  }

  private kut(ms: number): Promise<void> {
    return this.d.kut ? this.d.kut(ms) : sleep(ms);
  }

  private async yurgiz(): Promise<void> {
    try {
      // Kompaniyalar ro'yxati ham yangidan olinsin — CRM'ga yangi hisob
      // kiritilgan bo'lishi mumkin; ro'yxat keyingi ochilishda olinadi.
      this.d.rekvizitManbai.keshniTashla();
      const nomzodlar = (await this.d.talabnomalar.nomzodlar(this.d.clock.todayIso())).filter(yetishmaydi);
      this.v.jami = nomzodlar.length;
      log.info({ jami: nomzodlar.length }, "Talabnoma nomzodlari CRM'dan yangilanmoqda");

      for (const [i, n] of nomzodlar.entries()) {
        // CRM'ga ikki parallel oqim bormasin (`BulkContractSync` bilan bir xil qoida).
        let aytildi = false;
        while (this.d.nightlyBusy()) {
          if (!aytildi) {
            log.info("Kechasigi to'liq yangilash ketyapti — tugashini kutamiz");
            aytildi = true;
          }
          await this.kut(this.d.kutishMs ?? 5000);
        }
        if (i > 0 && this.d.pauzaMs > 0) await this.kut(this.d.pauzaMs);

        try {
          const r = await this.d.contractSync.syncOne(n.contractId);
          if (r.outcome === 'disabled') {
            // Hech biri yangilanmaydi — qolganlarini aylanib o'tirish behuda.
            // O'zgaruvchi nomi faqat jurnalda: operatorga u hech narsa demaydi.
            log.warn("CRM sinxi o'chiq (CONTRACTS_SYNC_ENABLED=false) — talabnoma nomzodlari yangilanmadi");
            this.tugat('xato', "CRM sinxronizatsiyasi o'chirilgan");
            return;
          }
          if (r.outcome === 'ok') this.v.yangilandi += 1;
          else {
            this.v.xatolar += 1;
            log.warn({ contractId: n.contractId, outcome: r.outcome, error: r.error }, 'Talabnoma nomzodi CRM\'dan yangilanmadi');
          }
        } catch (err) {
          this.v.xatolar += 1;
          log.warn({ err, contractId: n.contractId }, 'Talabnoma nomzodi CRM\'dan yangilanmadi');
        }
        this.v.bajarildi += 1;
      }
      log.info({ yangilandi: this.v.yangilandi, xatolar: this.v.xatolar }, "Talabnoma nomzodlari CRM'dan yangilandi");
      this.tugat('tugadi', null);
    } catch (err) {
      log.error({ err }, "Talabnoma nomzodlarini CRM'dan yangilash yiqildi");
      this.tugat('xato', xabari(err));
    }
  }

  private tugat(holat: 'tugadi' | 'xato', sabab: string | null): void {
    this.v = { ...this.v, holat, sabab, tugagan: this.d.clock.now().toISOString() };
  }
}
