import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IClientProfileRepository } from '@/domain/repositories/IAgentKnowledgeRepository';
import type { IPhoneCallRepository } from '@/domain/repositories/IPhoneCallRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IClock } from '@/domain/services/support';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { config } from '@/shared/config';
import { kechikkanSumma } from '@/domain/entities/Contract';
import { faqatYoziladiganlar, holatniAniqla, yoziladimi } from '@/domain/entities/shartnomaHolati';
import { personaNameOf } from '@/domain/entities/TelegramAccount';
import { canAgentNudge } from '@/domain/entities/Conversation';
import { qongiroqMumkinmi } from '@/domain/services/qongiroqMumkinmi';
import { childLogger } from '@/shared/logger';

const log = childLogger('qongiroq-brifi');

/** Ovozli agentga beriladigan yozishma uzunligi. */
const XABARLAR_SONI = 20;
const OXIRGI_TOLOVLAR = 5;

export class ShartnomaTopilmadi extends Error {
  constructor(raqam: string) {
    super(`Shartnoma topilmadi: ${raqam}`);
    this.name = 'ShartnomaTopilmadi';
  }
}

export interface QongiroqBrifiDeps {
  readonly contracts: Pick<IContractRepository, 'findByContractNo' | 'findByClientId'>;
  readonly clients: Pick<IClientRepository, 'findById'>;
  readonly conversations: Pick<IConversationRepository, 'findByClientId'>;
  readonly messages: Pick<IMessageRepository, 'recentByConversation'>;
  readonly promises: Pick<IPaymentPromiseRepository, 'listOpenByConversation' | 'findLatestByConversation'>;
  readonly payments: Pick<IContractPaymentRepository, 'listRecentPayments'>;
  readonly profiles: Pick<IClientProfileRepository, 'find'>;
  readonly accounts: Pick<ITelegramAccountRepository, 'findById'>;
  readonly phoneCalls: Pick<IPhoneCallRepository, 'listRecentForClient'>;
  readonly contractSync: Pick<ContractSyncService, 'syncOne' | 'lastSyncedAt'>;
  readonly settings: Pick<RuntimeSettings, 'get'>;
  readonly clock: Pick<IClock, 'todayIso' | 'now'>;
}

export interface QongiroqBrifiJavob {
  readonly shartnoma_raqami: string;
  /** CRM javob bermadi — raqamlar bazadagi oxirgi ma'lumotdan. */
  readonly malumot_eskirgan: boolean;
  /** Eskirgan bo'lsa — oxirgi muvaffaqiyatli yangilanish (ISO), aks holda null. */
  readonly yangilangan: string | null;
  readonly mijoz: {
    readonly ism: string | null;
    readonly toliq_ism: string;
    readonly telefonlar: string[];
    readonly boglanmaslik: boolean;
  };
  readonly shartnomalar: Array<{
    readonly raqam: string;
    readonly obyekt: string | null;
    readonly holat: string | null;
    readonly yoziladi: boolean;
    readonly oylik_tolov: number | null;
    readonly kechikkan: { boshlangich: number; oylik: number; hisoblagich: number; jami: number };
    readonly kechikish_kunlari: number;
    readonly qoldirilgan_oylar: number;
    readonly navbatdagi_tolov_sanasi: string | null;
    readonly oxirgi_tolovlar: Array<{ sana: string; summa: number }>;
  }>;
  readonly telegram: null | {
    readonly akkaunt: string | null;
    readonly agent_ismi: string;
    readonly holat: string;
    readonly operator_kerak: boolean;
    /** Mijoz nomidan boshqa odam yozsa (qarindosh) — `mijoz` deb belgilangan xabarlar unikidir. */
    readonly suhbatdosh: { qarindoshligi: string | null; ismi: string | null } | null;
    readonly oxirgi_xabar: string | null;
    readonly xabarlar: Array<{ kim: 'mijoz' | 'agent' | 'operator'; vaqt: string; matn: string }>;
    readonly vadalar: Array<{ kun: string; summa: number; holat: string; mijoz_sozi: string | null }>;
  };
  readonly xotira: string | null;
  /** Oxirgi 5 ta qo'ng'iroq, eng yangisi birinchi. Transkript QAYTARILMAYDI. */
  readonly qongiroqlar: Array<{
    readonly sana: string;
    readonly agent_ismi: string;
    readonly natija: string;
    readonly xulosa: string | null;
    readonly vada: { readonly kun: string; readonly summa: number | null } | null;
  }>;
  readonly qongiroq_mumkin: boolean;
  readonly sabablar: string[];
}

const isoKun = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Ovozli agent qo'ng'iroq qilishdan oldin oladigan ma'lumot (spec 2-bo'lim).
 *
 * Mijoz FAQAT aniq shartnoma raqami bo'yicha topiladi — ro'yxat yoki qidiruv
 * yo'q: kalit o'g'irlansa ham butun bazani tortib bo'lmaydi.
 *
 * Mijozning ichki izohi (`clients.notes`) va yozishmadagi ichki qaydlar
 * (`direction = 'note'`) BERILMAYDI — ular xodimlar uchun.
 */
export class QongiroqBrifi {
  constructor(private readonly d: QongiroqBrifiDeps) {}

  async tuz(shartnomaRaqami: string): Promise<QongiroqBrifiJavob> {
    const raqam = shartnomaRaqami.trim().toUpperCase();
    const asosiy = raqam ? await this.d.contracts.findByContractNo(raqam) : null;
    if (!asosiy) throw new ShartnomaTopilmadi(raqam);

    const client = await this.d.clients.findById(asosiy.clientId);
    if (!client) throw new ShartnomaTopilmadi(raqam);

    // Raqamlar CRM'dan yangilanadi — Telegram agenti javobidan oldingi kabi.
    let eskirgan = false;
    let eskiVaqt: Date | null = null;
    // Telegramdagi birinchi xabar darvozasi bilan bir xil: xato + eskirgan vaqt (yoki hech qachon) — to'xtash.
    let bloklovchiEskirgan = false;
    const eskirishChegarasi = this.d.clock.now().getTime() - config.CONTRACTS_STALE_HOURS * 3_600_000;
    for (const c of await this.d.contracts.findByClientId(client.id)) {
      const r = await this.d.contractSync.syncOne(c.id);
      if (r.outcome === 'error') {
        eskirgan = true;
        const t = await this.d.contractSync.lastSyncedAt(c.id);
        if (t && (!eskiVaqt || t < eskiVaqt)) eskiVaqt = t;
        if (!t || t.getTime() < eskirishChegarasi) bloklovchiEskirgan = true;
      }
    }
    const shartnomalar = await this.d.contracts.findByClientId(client.id);

    const shartnomaQatorlari = await Promise.all(
      shartnomalar.map(async (c) => ({
        raqam: c.contractNo,
        obyekt: c.objectName,
        holat: holatniAniqla(c.virtualStatus)?.label ?? c.virtualStatus,
        yoziladi: yoziladimi(c.virtualStatus),
        oylik_tolov: c.monthlyPayment,
        kechikkan: {
          boshlangich: c.debtFirst,
          oylik: c.debtMonthly,
          hisoblagich: c.debtMeter,
          jami: c.debtFirst + c.debtMonthly,
        },
        kechikish_kunlari: c.daysOverdue,
        qoldirilgan_oylar: c.missedMonthsExact,
        navbatdagi_tolov_sanasi: isoKun(c.nextPaymentDate),
        oxirgi_tolovlar: (await this.d.payments.listRecentPayments(c.id, OXIRGI_TOLOVLAR)).map((p) => ({
          sana: p.dateIso,
          summa: p.amount,
        })),
      })),
    );

    const runtime = await this.d.settings.get();
    const suhbat = await this.d.conversations.findByClientId(client.id);
    // Profil ikki joyda kerak (xotira va suhbatdosh) — bir marta o'qiladi.
    const profil = await this.d.profiles.find(client.id);
    const suhbatdosh = profil?.interlocutor
      ? { qarindoshligi: profil.interlocutor.relation, ismi: profil.interlocutor.name }
      : null;
    // Qo'ng'iroqlar ikki joyda kerak (brifdagi ro'yxat va telefon va'dasi) — bir marta o'qiladi.
    // O'qish yiqilsa brifning o'zi yiqilmasin: qo'ng'iroqlarsiz davom etamiz.
    let oxirgiQongiroqlar: Awaited<ReturnType<QongiroqBrifiDeps['phoneCalls']['listRecentForClient']>> = [];
    try {
      oxirgiQongiroqlar = await this.d.phoneCalls.listRecentForClient(client.id, 5);
    } catch (err) {
      log.warn({ clientId: client.id, err }, 'Oxirgi qo\'ng\'iroqlar o\'qilmadi — brif ularsiz tuzildi');
    }
    let telegram: QongiroqBrifiJavob['telegram'] = null;
    let ochiqVadaKuni: string | null = null;

    if (suhbat) {
      const [xabarlar, ochiq, oxirgiVada, akkaunt] = await Promise.all([
        this.d.messages.recentByConversation(suhbat.id, XABARLAR_SONI),
        this.d.promises.listOpenByConversation(suhbat.id),
        this.d.promises.findLatestByConversation(suhbat.id),
        suhbat.telegramAccountId ? this.d.accounts.findById(suhbat.telegramAccountId) : Promise.resolve(null),
      ]);
      const vadalar = ochiq.map((p) => ({
        kun: isoKun(p.promisedDate)!,
        summa: p.amount,
        holat: p.status,
        mijoz_sozi: p.quote,
      }));
      ochiqVadaKuni = vadalar.map((v) => v.kun).sort()[0] ?? null;
      // Buzilgan va'da ochiq emas — qo'ng'iroqni kutishga qo'ymaydi, lekin agent bilishi kerak.
      if (oxirgiVada && oxirgiVada.status === 'broken' && !ochiq.some((p) => p.id === oxirgiVada.id)) {
        vadalar.push({
          kun: isoKun(oxirgiVada.promisedDate)!,
          summa: oxirgiVada.amount,
          holat: oxirgiVada.status,
          mijoz_sozi: oxirgiVada.quote,
        });
      }
      telegram = {
        akkaunt: akkaunt?.label ?? null,
        agent_ismi: personaNameOf(akkaunt, runtime.personaName),
        holat: suhbat.state,
        operator_kerak: suhbat.needsHuman,
        suhbatdosh,
        oxirgi_xabar: suhbat.lastMessageAt ? suhbat.lastMessageAt.toISOString() : null,
        xabarlar: xabarlar
          .filter((m) => m.direction !== 'note')
          // Yuborilmagan xabar "aytilgan" deb ko'rsatilmasin.
          .filter((m) => m.status !== 'failed' && !(m.direction === 'out' && (m.status === 'queued' || m.status === 'sending')))
          .map((m) => ({
            kim: m.direction === 'in' ? ('mijoz' as const) : m.author === 'human' ? ('operator' as const) : ('agent' as const),
            vaqt: m.createdAt.toISOString(),
            matn: (m.body || m.transcript || '').trim(),
          }))
          .filter((m) => m.matn !== ''),
        vadalar,
      };
    }

    const xotira = profil
      ? [profil.summary, profil.whatWorks, profil.bestContactTime ? `Qulay vaqt: ${profil.bestContactTime}` : null]
          .filter((x): x is string => Boolean(x?.trim()))
          .map((x) => x.trim().replace(/[.]$/, ''))
          .join('. ') || null
      : null;

    // Transkript ataylab olinmaydi: u uzun va mijozning so'zlarini xom holda saqlaydi.
    const qongiroqlar = oxirgiQongiroqlar.map((q) => ({
      sana: q.startedAt.toISOString(),
      agent_ismi: q.agentName,
      natija: q.outcome,
      xulosa: q.summary,
      vada: q.promiseDate ? { kun: q.promiseDate, summa: q.promiseAmount } : null,
    }));

    // Telegram suhbati yo'q (yoki summa 0 bo'lib va'da yozilmagan) mijozda telefon va'dasi
    // faqat qo'ng'iroq qatorida turadi — shuni ham kutamiz. `promiseId` bor bo'lsa u Telegram
    // va'dasi bilan allaqachon hisoblangan, ikki marta sanalmaydi.
    const bugun = this.d.clock.todayIso();
    const telefonVadalari = oxirgiQongiroqlar
      .filter((q) => q.promiseId === null && q.promiseDate !== null && q.promiseDate >= bugun)
      .map((q) => q.promiseDate as string);
    ochiqVadaKuni = [ochiqVadaKuni, ...telefonVadalari].filter((x): x is string => x !== null).sort()[0] ?? null;

    const yoziladiganlar = faqatYoziladiganlar(shartnomalar);
    const qaror = qongiroqMumkinmi({
      boglanmaslik: client.doNotContact,
      killSwitch: runtime.killSwitch,
      yoziladiganShartnomaBor: yoziladiganlar.length > 0,
      kechikkanJami: kechikkanSumma(yoziladiganlar),
      minDebt: runtime.minDebt,
      eskirganMalumot: bloklovchiEskirgan,
      ochiqVadaKuni,
      // Telegramda qayta yozish qoidasi bilan bir xil (buzilgan va'da to'smaydi).
      telegramToxtatgan: suhbat !== null && !canAgentNudge(suhbat),
      bugun,
    });

    return {
      shartnoma_raqami: asosiy.contractNo,
      malumot_eskirgan: eskirgan,
      yangilangan: eskirgan && eskiVaqt ? eskiVaqt.toISOString() : null,
      mijoz: {
        ism: client.firstName,
        toliq_ism: client.fullName,
        telefonlar: [...new Set([client.phone, ...client.extraPhones].filter((p): p is string => Boolean(p)))],
        boglanmaslik: client.doNotContact,
      },
      shartnomalar: shartnomaQatorlari,
      telegram,
      xotira,
      qongiroqlar,
      qongiroq_mumkin: qaror.mumkin,
      sabablar: qaror.sabablar,
    };
  }
}
