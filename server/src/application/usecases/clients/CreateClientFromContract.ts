import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { Client } from '@/domain/entities/Client';
import { HAMMASI, obyektQamrovdami, type MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ExternalContract, IContractGateway } from '@/domain/services/IContractGateway';
import { computeDebt } from '@/domain/services/contractDebt';
import type { IClock } from '@/domain/services/support';
import { childLogger } from '@/shared/logger';

const log = childLogger('client-create');

export interface ClientRef {
  readonly id: string;
  readonly fullName: string;
}

/** Operator ekranida ko'rsatiladigan qism — bazaga yozilmaydi. */
export interface ContractPreview {
  readonly contractNo: string;
  readonly clientName: string;
  readonly phones: string[];
  readonly objectName: string | null;
  /** Kechikkan to'lov. Ularning `total_debt` i EMAS — u umumiy qoldiq. */
  readonly overdueTotal: number;
  readonly daysOverdue: number;
}

export type LookupOutcome = 'ok' | 'not_found' | 'disabled' | 'error';

/**
 * Diskriminatsiyalangan birlashma — `outcome === 'ok'` tekshiruvi
 * `external` ning bor-yo'qligini ham hal qiladi. Ikki alohida maydonni
 * tekshirish TypeScript uchun bog'liq emas va `'ok'` qolib ketardi.
 */
type LookupResult =
  | { readonly outcome: 'ok'; readonly external: ExternalContract }
  | { readonly outcome: Exclude<LookupOutcome, 'ok'>; readonly external: null; readonly error?: string };

export interface PreviewResult {
  readonly outcome: LookupOutcome;
  /** Shartnoma bazada bo'lsa — uning mijozi. */
  readonly existingClient: ClientRef | null;
  /** Raqam bo'yicha topilgan mijoz — shartnoma o'shanga biriktiriladi. */
  readonly matchedByPhone: ClientRef | null;
  readonly contract: ContractPreview | null;
  readonly error?: string;
}

export type CreateOutcome =
  | 'created'
  | 'attached'
  | 'already_exists'
  | 'not_found'
  | 'disabled'
  | 'error';

export interface CreateResult {
  readonly outcome: CreateOutcome;
  readonly clientId: string | null;
  readonly error?: string;
}

/**
 * Shartnoma raqami bo'yicha mijozni qo'lda qo'shish.
 *
 * Nega ism va to'lov qo'lda kiritilmaydi: to'lov har kuni o'zgaradi va odam
 * yozib qo'ysa o'sha zahoti eskiradi. Shartnoma raqami o'zgarmaydi, tashqi
 * bazada esa hamma narsa bor — ism, telefonlar, grafik, to'lov tarixi.
 */
export class CreateClientFromContract {
  constructor(
    private readonly clients: IClientRepository,
    private readonly contracts: IContractRepository,
    private readonly gateway: IContractGateway,
    private readonly contractSync: ContractSyncService,
    private readonly audit: IAuditRepository,
    private readonly clock: IClock,
    private readonly enabled: boolean,
  ) {}

  /**
   * Saqlamasdan ko'rsatish — operator tasdiqlashidan oldin.
   *
   * `qamrov` (obyekt cheklovi): bazada YO'Q shartnomaning CRM obyekti
   * qamrovda bo'lmasa — `not_found` (begona shartnoma borligi oshkor
   * qilinmaydi). Bazadagi shartnoma (`existingClient`) mijozini
   * chaqiruvchi tekshiradi.
   */
  async preview(contractNo: string, qamrov: MijozQamrovi = HAMMASI): Promise<PreviewResult> {
    const existing = await this.contracts.findByContractNo(contractNo);
    const existingClient = existing ? await this.clientRef(existing.clientId) : null;

    const found = await this.lookup(contractNo);
    if (found.outcome !== 'ok') {
      return {
        outcome: found.outcome,
        existingClient,
        matchedByPhone: null,
        contract: null,
        error: found.error,
      };
    }

    if (!existingClient && !obyektQamrovdami(qamrov, found.external.objectName)) {
      return { outcome: 'not_found', existingClient: null, matchedByPhone: null, contract: null };
    }

    // Shartnoma allaqachon bazada bo'lsa, telefon moslashtirish ma'nosiz:
    // mijoz baribir o'sha shartnomaniki.
    const matched = existingClient ? null : await this.findByPhones(found.external.phones);
    const debt = computeDebt(found.external.schedule, this.clock.todayIso());

    return {
      outcome: 'ok',
      existingClient,
      matchedByPhone: matched ? { id: matched.id, fullName: matched.fullName } : null,
      contract: {
        contractNo: found.external.contractNo,
        clientName: found.external.clientName,
        phones: found.external.phones,
        objectName: found.external.objectName,
        overdueTotal: debt.overdueTotal,
        daysOverdue: debt.daysOverdue,
      },
    };
  }

  /**
   * `qamrov` (obyekt cheklovi): CRM obyekti qamrovda bo'lmasa — `not_found`,
   * hech narsa yozilmaydi. `already_exists` dagi mijozni chaqiruvchi tekshiradi.
   */
  async execute(contractNo: string, actor: string, qamrov: MijozQamrovi = HAMMASI): Promise<CreateResult> {
    // Birinchi tekshiruv ataylab bazadan: shartnoma bor bo'lsa tashqi
    // API'ni bezovta qilishning hojati yo'q.
    const existing = await this.contracts.findByContractNo(contractNo);
    if (existing) return { outcome: 'already_exists', clientId: existing.clientId };

    const found = await this.lookup(contractNo);
    if (found.outcome !== 'ok') {
      return { outcome: found.outcome, clientId: null, error: found.error };
    }
    const external = found.external;
    if (!obyektQamrovdami(qamrov, external.objectName)) return { outcome: 'not_found', clientId: null };

    const matched = await this.findByPhones(external.phones);
    const client =
      matched ??
      (await this.clients.create({
        fullName: external.clientName,
        firstName: external.clientFirstName,
        phone: external.phones[0] ?? null,
        extraPhones: external.phones.slice(1),
      }));

    // Bo'sh qobiq: to'lov, grafik, uy va narxlar quyidagi syncOne da to'ladi.
    // Ularni bu yerda ham to'ldirsak, ikkita mapping paydo bo'lardi va
    // ular vaqt o'tib bir-biridan ajrardi.
    const { contract } = await this.contracts.upsert({
      clientId: client.id,
      contractNo: external.contractNo,
      externalId: null,
      objectName: external.objectName,
      status: null,
      virtualStatus: null,
      category: null,
      totalPrice: null,
      firstPayment: null,
      monthlyPayment: null,
      paidTotal: null,
      remainingTotal: null,
      contractDate: null,
      months: null,
      nextPaymentDate: null,
      daysOverdue: 0,
      debtFirst: 0,
      debtMonthly: 0,
      debtTotal: 0,
      warningCount: 0,
      lastWarningType: null,
      lastWarningMethod: null,
      lastWarningManager: null,
      lastWarningAt: null,
      raw: {},
    });

    // Yiqilsa ham qaytarilmaydi: shartnoma qatori `sync_error` bilan
    // qoladi va kechasi to'liq sinxronizatsiya uni qayta oladi.
    const sync = await this.contractSync.syncOne(contract.id);
    if (sync.outcome !== 'ok') {
      log.warn({ contractNo, outcome: sync.outcome }, 'Yangi shartnoma sinxronlanmadi');
    }

    await this.audit.record({
      actor,
      action: 'client.created_manually',
      entity: 'client',
      entityId: client.id,
      payload: { contractNo, attached: Boolean(matched), syncOutcome: sync.outcome },
    });

    return { outcome: matched ? 'attached' : 'created', clientId: client.id };
  }

  private async lookup(contractNo: string): Promise<LookupResult> {
    if (!this.enabled) return { outcome: 'disabled', external: null };

    let external: ExternalContract | null;
    try {
      external = await this.gateway.findByContractNo(contractNo);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ contractNo, err }, "Shartnomani so'rab bo'lmadi");
      return { outcome: 'error', external: null, error: message };
    }

    // Raqam aynan mos kelishini talab qilamiz — `ContractSyncService.resolve()`
    // ham shunday qiladi: API yaqin natijani qaytarishi mumkin.
    if (!external || external.contractNo !== contractNo) {
      return { outcome: 'not_found', external: null };
    }
    return { outcome: 'ok', external };
  }

  /**
   * Raqamlardan biri mavjud mijozniki bo'lsa — o'sha mijoz.
   *
   * Telefon ism bilan solishtirganda ancha kuchli identifikator, shuning
   * uchun moslik aynan raqam bo'yicha qidiriladi. Bu dublikatning eng
   * keng tarqalgan sababini yopadi: bitta odamning ikkita shartnomasi.
   */
  private async findByPhones(phones: readonly string[]): Promise<Client | null> {
    for (const phone of phones) {
      const found = await this.clients.findByPhone(phone);
      if (found) return found;
    }
    return null;
  }

  private async clientRef(clientId: string): Promise<ClientRef | null> {
    const client = await this.clients.findById(clientId);
    return client ? { id: client.id, fullName: client.fullName } : null;
  }
}
