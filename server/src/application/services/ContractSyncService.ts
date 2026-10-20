import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IClientPhoneBlockRepository } from '@/domain/repositories/IClientPhoneBlockRepository';
import type { IContractSyncRepository } from '@/domain/repositories/IContractSyncRepository';
import type { ExternalContract, IContractGateway } from '@/domain/services/IContractGateway';
import { computeDebt } from '@/domain/services/contractDebt';
import { tosilganlarniTashla } from '@/domain/services/telefonToSigi';
import type { IClock } from '@/domain/services/support';
import { childLogger } from '@/shared/logger';

const log = childLogger('contract-sync');

export type SyncOutcome = 'ok' | 'not_found' | 'error' | 'disabled';

export interface SyncResult {
  readonly outcome: SyncOutcome;
  readonly contractId: string;
  readonly debtTotal: number;
  readonly newPhones: string[];
  readonly error?: string;
}

/**
 * Shartnomani tashqi bazadan olib, bizdagi qiymatlarni yangilaydi.
 *
 * Kechikkan to'lov API'dan OLINMAYDI — grafikdan hisoblanadi
 * (`computeDebt`). API'ning `total_debt` i umumiy qoldiq bo'lib, real
 * shartnomada ular o'rtasidagi farq o'nlab baravar bo'lishi mumkin.
 */
export class ContractSyncService {
  constructor(
    private readonly gateway: IContractGateway,
    private readonly repo: IContractSyncRepository,
    private readonly clients: IClientRepository,
    private readonly clock: IClock,
    private readonly enabled: boolean,
    /** Mijozdan uzilgan raqamlar — ular CRM'dan qayta qo'shilmaydi. */
    private readonly phoneBlocks: IClientPhoneBlockRepository,
  ) {}

  async syncOne(contractId: string): Promise<SyncResult> {
    const empty = { contractId, debtTotal: 0, newPhones: [] as string[] };
    if (!this.enabled) return { ...empty, outcome: 'disabled' };

    const row = await this.repo.getById(contractId);
    if (!row) return { ...empty, outcome: 'not_found' };

    let external: ExternalContract | null;
    try {
      external = await this.resolve(row.contractNo, row.externalOrderId, row.externalId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repo.markError(contractId, message);
      log.warn({ contractNo: row.contractNo, err }, "Shartnomani yangilab bo'lmadi");
      return { ...empty, outcome: 'error', error: message };
    }

    if (!external) {
      await this.repo.markError(contractId, 'not_found');
      return { ...empty, outcome: 'not_found' };
    }

    const debt = computeDebt(external.schedule, this.clock.todayIso());

    await this.repo.applySync(contractId, {
      externalOrderId: external.orderId,
      objectName: external.objectName,
      status: external.status,
      virtualStatus: external.virtualStatus,
      contractDate: external.contractDate,
      months: external.months,
      totalPrice: external.transactionPrice,
      firstPayment: external.initialPayment,
      monthlyPayment: external.monthlyPayment,
      paidTotal: external.totalPaid,
      remainingTotal: external.remainingTotal,
      nextPaymentDate: debt.nextPaymentDate,
      daysOverdue: debt.daysOverdue,
      debtFirst: debt.overdueFirst,
      debtMonthly: debt.overdueMonthly,
      debtTotal: debt.overdueTotal,
      debtMeter: debt.overdueMeter,
      apartment: external.apartment,
      completionDate: external.completionDate,
      missedMonths: debt.missedMonths,
      objectAddress: external.objectAddress,
      companyInn: external.companyInn,
    });

    await this.repo.replaceSchedule(contractId, external.schedule);
    await this.repo.upsertHistory(contractId, external.history);

    await this.fillFirstName(row.clientId, external.clientFirstName);
    const newPhones = await this.mergePhones(row.clientId, external.phones);

    return { contractId, outcome: 'ok', debtTotal: debt.overdueTotal, newPhones };
  }

  /** `maxAgeMinutes` dan yangi bo'lsa hech narsa qilmaydi va `null` qaytaradi. */
  async syncIfStale(contractId: string, maxAgeMinutes: number): Promise<SyncResult | null> {
    const syncedAt = await this.repo.getSyncedAt(contractId);
    if (syncedAt && this.clock.now().getTime() - syncedAt.getTime() < maxAgeMinutes * 60_000) {
      return null;
    }
    return this.syncOne(contractId);
  }

  /** Oxirgi muvaffaqiyatli sinxronizatsiya vaqti (yo'q bo'lsa null). */
  lastSyncedAt(contractId: string): Promise<Date | null> {
    return this.repo.getSyncedAt(contractId);
  }

  /**
   * Hamma shartnomani ketma-ket yangilaydi.
   *
   * Ro'yxat BOSHIDA to'liq olinadi va tsikl aylanmaydi: `synced_at` har
   * yangilanishda o'zgaradi, xato bo'lganda esa o'zgarmaydi — sahifalab
   * olish xatolik bergan shartnomani cheksiz qaytarardi. 1700 qator
   * xotirada arzimas joy egallaydi.
   */
  async syncAll(delayMs: number): Promise<{ ok: number; notFound: number; failed: number }> {
    const stats = { ok: 0, notFound: 0, failed: 0 };
    if (!this.enabled) return stats;

    const total = await this.repo.countSyncable();
    const rows = await this.repo.findSyncable(total, 0);
    log.info({ total: rows.length }, "To'liq sinxronizatsiya boshlandi");

    for (const [index, row] of rows.entries()) {
      const result = await this.syncOne(row.id);
      if (result.outcome === 'ok') stats.ok += 1;
      else if (result.outcome === 'not_found') stats.notFound += 1;
      else stats.failed += 1;

      if (delayMs > 0 && index < rows.length - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    log.info(stats, "To'liq sinxronizatsiya tugadi");
    return stats;
  }

  // ─── Ichki ──────────────────────────────────────────────────────────────

  /**
   * Ularning `order.id` sini aniqlaydi.
   *
   * Excel'dagi `ID` ustuni ularning `order.id` siga to'g'ri kelishi MUMKIN,
   * lekin bunga ishonib bo'lmaydi. Shuning uchun u faqat sinab ko'riladi va
   * javobdagi shartnoma raqami biznikiga teng bo'lgandagina qabul qilinadi —
   * aks holda boshqa mijozning ma'lumoti bizning shartnomaga yozilardi.
   */
  private async resolve(
    contractNo: string,
    orderId: number | null,
    excelId: string | null,
  ): Promise<ExternalContract | null> {
    if (orderId) {
      const byId = await this.gateway.fetchByOrderId(orderId);
      if (byId?.contractNo === contractNo) return byId;
    }

    const guess = Number(excelId);
    if (!orderId && excelId && Number.isFinite(guess) && guess > 0) {
      const byExcel = await this.gateway.fetchByOrderId(guess);
      if (byExcel?.contractNo === contractNo) return byExcel;
    }

    const found = await this.gateway.findByContractNo(contractNo);
    return found?.contractNo === contractNo ? found : null;
  }

  /**
   * Mijozning aniq ismini CRM'dan to'ldiradi.
   *
   * Mavjud mijozlarda bu ustun bo'sh: u faqat 054-migratsiyada qo'shilgan.
   * Sinxronizatsiya baribir har bir shartnomani aylanib chiqadi, shuning
   * uchun alohida backfill skripti kerak emas — ism o'z-o'zidan to'ladi.
   *
   * To'liq ism (`full_name`) YANGILANMAYDI: uni operator dashboardda
   * tahrirlagan bo'lishi mumkin va jins aynan o'sha satrdagi otasining
   * ismidan aniqlanadi. Bu yerda faqat bo'sh katak to'ldiriladi.
   */
  private async fillFirstName(clientId: string, firstName: string | null): Promise<void> {
    if (!firstName?.trim()) return;

    const client = await this.clients.findById(clientId);
    if (!client || client.firstName?.trim() === firstName.trim()) return;

    await this.clients.update(clientId, { firstName: firstName.trim() });
    log.info({ clientId }, 'Mijozning ismi shartnomalar bazasidan yangilandi');
  }

  /**
   * API'dagi raqamlarni mijozga qo'shadi.
   *
   * Excel'dagi eski raqam O'CHIRILMAYDI — u ham ishlashi mumkin. Yangi raqam
   * qo'shilsa Telegram holati `unknown` ga qaytariladi, shunda mavjud
   * `BulkTelegramLookup` uni o'zi navbatga oladi: ko'p hollarda aynan yangi
   * raqamda Telegram topiladi.
   */
  private async mergePhones(clientId: string, phones: readonly string[]): Promise<string[]> {
    if (!phones.length) return [];

    const client = await this.clients.findById(clientId);
    if (!client) return [];

    // Operator "bu raqam mijozniki emas" deb uzgan raqamlar. CRM'da ular
    // hamon eski egasiga bog'langan holicha turadi, ya'ni har
    // sinxronizatsiyada qaytib kelishga urinadi. Filtr bo'lmasa begona
    // odamga bergan "boshqa yozilmaydi" degan va'damiz buzilardi.
    const blocked = new Set(await this.phoneBlocks.listForClient(clientId));
    const allowed = tosilganlarniTashla(phones, blocked);
    if (allowed.length !== phones.length) {
      log.info(
        { clientId, skipped: phones.length - allowed.length },
        'Uzilgan raqam CRM javobidan tashlandi',
      );
    }
    if (!allowed.length) return [];

    const known = new Set([client.phone, ...client.extraPhones].filter(Boolean) as string[]);
    const fresh = allowed.filter((p) => !known.has(p));
    if (!fresh.length) return [];

    if (client.phone) {
      await this.clients.update(clientId, { extraPhones: [...client.extraPhones, ...fresh] });
    } else {
      // Asosiy raqam umuman yo'q edi — birinchisi asosiy bo'ladi.
      await this.clients.update(clientId, {
        phone: fresh[0],
        extraPhones: [...client.extraPhones, ...fresh.slice(1)],
      });
    }

    await this.clients.setTelegramStatus(clientId, 'unknown');
    log.info({ clientId, count: fresh.length }, "Shartnomalar bazasidan yangi raqam qo'shildi");
    return fresh;
  }
}
