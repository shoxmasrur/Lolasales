import type { BulkStartAccountPlan, IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import {
  canAcceptClients,
  canLookup,
  personaNameOf,
  remainingLookups,
  remainingQuota,
} from '@/domain/entities/TelegramAccount';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { IClock } from '@/domain/services/support';
import {
  planAccountSplit,
  planManualSplit,
  type SplitAccount,
} from '@/application/services/accountSplit';

export interface BulkStartPlan {
  /** clientId → accountId. Faqat akkaunti o'zgaradiganlar. */
  readonly assignments: Map<string, string>;
  readonly accountPlan: BulkStartAccountPlan[];
  readonly reassigned: number;
  /**
   * Bog'lanish MUMKIN bo'lgan mijozlar (`findReassignableForBulkStart`).
   *
   * NEGA REJADA QAYTARILADI: chaqiruvchiga `assignments` dan tashqarida
   * qolgan mijozning IKKI xil bo'lishini ajratish kerak — biri baza
   * so'rovining o'zidan chiqib ketgan (chiquvchi xabari bor, bog'lanish
   * taqiqlangan, raqami yo'q), ikkinchisi esa bog'lanish mumkin, lekin
   * operator qo'lda chegaralagani uchun bugungi taqsimotga tushmagan.
   * Bu farq shu yerda allaqachon ma'lum; chaqiruvchi uni bilish uchun
   * o'sha so'rovni QAYTA yuborishi kerak bo'lardi.
   */
  readonly reassignable: ReadonlySet<string>;
}

/**
 * Ommaviy suhbat boshlash uchun taqsimot rejasi.
 *
 * NEGA ALOHIDA XIZMAT: bu rejani IKKI joy so'raydi — oldindan ko'rish
 * oynasi va haqiqiy ish. Agar ikkalasi o'z hisobini yuritsa, operator
 * ko'rgan son bajarilgan ishdan farq qilib qolardi va buni hech kim
 * sezmasdi. Shuning uchun hisob bitta joyda.
 */
export class BulkStartPlanner {
  constructor(
    private readonly clients: IClientRepository,
    private readonly accounts: ITelegramAccountRepository,
    private readonly settings: RuntimeSettings,
    private readonly clock: IClock,
  ) {}

  /**
   * `maqsad` — kvota qaysi hisoblagichdan olinishini belgilaydi.
   *
   * Xabar va qidiruv kvotalari ALOHIDA: xabar kvotasi tugagan akkaunt
   * hali qidira oladi va aksincha. Ikkalasini bitta hisob bilan
   * taqsimlash mijozlarni kvotasi tugagan akkauntga tashlab yuborardi.
   */
  async plan(
    clientIds: string[],
    accountIds: string[],
    options: {
      maqsad?: 'outreach' | 'lookup';
      /**
       * Operator qo'lda kiritgan sonlar (accountId → nechta mijoz).
       * Berilsa avtomatik taqsimot UMUMAN ishlatilmaydi.
       */
      manual?: Readonly<Record<string, number>>;
    } = {},
  ): Promise<BulkStartPlan> {
    const maqsad = options.maqsad ?? 'outreach';
    // `reassignable` ham BO'SH: reja umuman tuzilmagan bo'lsa "operator
    // chegaralagani uchun tushmadi" degan xulosa chiqarib bo'lmaydi va
    // chaqiruvchi hech kimni majburan o'tkazib yubormasligi kerak.
    const empty: BulkStartPlan = {
      assignments: new Map(),
      accountPlan: [],
      reassigned: 0,
      reassignable: new Set(),
    };
    if (!clientIds.length || !accountIds.length) return empty;

    const [all, runtime, reassignable, loads] = await Promise.all([
      this.accounts.list(),
      this.settings.get(),
      this.clients.findReassignableForBulkStart(clientIds),
      this.clients.countByAccount(),
    ]);

    const today = this.clock.todayIso();
    const now = this.clock.now();

    // Tanlangan va haqiqatan ishga yaroqli akkauntlar.
    // Tartib `list()` dan keladi (created_at ASC) — taqsimlash shunga
    // tayanadi va shu tufayli deterministik bo'ladi.
    //
    // Qidiruvda `canLookup` qat'iyroq: akkaunt AYNAN HOZIR ulangan
    // bo'lishi kerak, aks holda mijozlar javob bermaydigan akkauntga
    // taqsimlanib, hammasi xato bilan qaytardi.
    const yaroqli = (a: (typeof all)[number]): boolean =>
      maqsad === 'lookup' ? canLookup(a, now, today) : canAcceptClients(a);

    const chosen = all.filter((a) => accountIds.includes(a.id) && yaroqli(a));
    if (!chosen.length) return empty;

    const loadById = new Map(loads.map((l) => [l.accountId, l.count]));
    const qolgan = (a: (typeof all)[number]): number =>
      maqsad === 'lookup' ? remainingLookups(a, today) : remainingQuota(a, today);

    const splitAccounts: SplitAccount[] = chosen.map((a) => ({
      id: a.id,
      currentLoad: loadById.get(a.id) ?? 0,
      remainingQuota: qolgan(a),
    }));

    const split = options.manual
      ? planManualSplit(reassignable, splitAccounts, options.manual)
      : planAccountSplit(reassignable, splitAccounts);

    const accountPlan: BulkStartAccountPlan[] = chosen.map((a) => {
      const count = split.perAccount.get(a.id) ?? 0;
      const remainingToday = qolgan(a);
      return {
        accountId: a.id,
        label: a.label,
        personaName: personaNameOf(a, runtime.personaName),
        count,
        remainingToday,
        overQuota: Math.max(0, count - remainingToday),
      };
    });

    return {
      assignments: split.assignments,
      accountPlan,
      reassigned: split.assignments.size,
      reassignable: new Set(reassignable),
    };
  }
}
