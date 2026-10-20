import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IPhoneCallRepository } from '@/domain/repositories/IPhoneCallRepository';
import type { IClock } from '@/domain/services/support';
import { QONGIROQ_NATIJALARI, type QongiroqNatijasi as Natija } from '@/domain/entities/PhoneCall';
import { kechikkanSumma } from '@/domain/entities/Contract';
import { faqatYoziladiganlar } from '@/domain/entities/shartnomaHolati';
import { ShartnomaTopilmadi } from '@/application/services/QongiroqBrifi';

/** Spec: 120 kundan uzoq va'da qabul qilinmaydi (eng uzun muhlat — 4 oy). */
const VADA_ENG_UZOQ_KUN = 120;

export class NotogriKirish extends Error {
  constructor(matn: string) {
    super(matn);
    this.name = 'NotogriKirish';
  }
}

export interface QongiroqNatijasiKirish {
  readonly shartnoma_raqami: string;
  readonly qongiroq_id: string;
  readonly agent_kaliti: string;
  readonly agent_ismi: string;
  readonly boshlandi: string;
  readonly davomiylik_soniya: number;
  readonly natija: Natija;
  readonly xulosa?: string;
  readonly vada?: { readonly kun: string; readonly summa?: number };
  readonly transkript?: string;
  readonly telefon?: string;
}

export interface QongiroqNatijasiJavob {
  readonly qongiroq_id: string;
  readonly saqlandi: 'yangi' | 'yangilandi';
  readonly vada: 'yozildi' | 'ozgarmadi' | 'faqat_qongiroqda' | 'yoq';
}

export interface QongiroqNatijasiDeps {
  readonly phoneCalls: Pick<IPhoneCallRepository, 'findByExternal' | 'upsert' | 'setPromiseId'>;
  readonly contracts: Pick<IContractRepository, 'findByContractNo' | 'findByClientId'>;
  readonly conversations: Pick<IConversationRepository, 'findByClientId'>;
  readonly promises: Pick<IPaymentPromiseRepository, 'findActiveByConversation' | 'findById' | 'updateStatus' | 'create'>;
  readonly clock: Pick<IClock, 'todayIso'>;
}

const ZONALI_VAQT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const kunQosh = (iso: string, kun: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + kun);
  return d.toISOString().slice(0, 10);
};
const sanami = (v: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/**
 * Ovozli agentning qo'ng'iroq natijasini saqlaydi (spec 3-bo'lim).
 *
 * Va'da Telegram suhbati bor mijozda mavjud va'da tizimiga yoziladi —
 * kuzatuv, buzilganini aniqlash, rahmat va hisobot o'zi ishlaydi. Almashtirish
 * qoidasi Telegram agenti (`AgentRunner.recordPromise`) bilan bir xil:
 * bir xil kun va summa — yangi yozilmaydi; farq qilsa — eskisi bekor.
 * Suhbatsiz mijozda va'da faqat qo'ng'iroq yozuvida qoladi (kuzatuvsiz).
 */
export class QongiroqNatijasi {
  constructor(private readonly d: QongiroqNatijasiDeps) {}

  async yoz(k: QongiroqNatijasiKirish, userId: string): Promise<QongiroqNatijasiJavob> {
    this.tekshir(k);

    const raqam = k.shartnoma_raqami.trim().toUpperCase();
    const shartnoma = await this.d.contracts.findByContractNo(raqam);
    if (!shartnoma) throw new ShartnomaTopilmadi(raqam);

    const qongiroqId = k.qongiroq_id.trim();
    const oldin = await this.d.phoneCalls.findByExternal(userId, qongiroqId);
    const qongiroq = await this.d.phoneCalls.upsert({
      externalId: qongiroqId,
      clientId: shartnoma.clientId,
      contractId: shartnoma.id,
      agentKey: k.agent_kaliti.trim(),
      agentName: k.agent_ismi.trim(),
      phone: k.telefon?.trim() || null,
      startedAt: new Date(k.boshlandi),
      durationSec: Math.round(k.davomiylik_soniya),
      outcome: k.natija,
      summary: k.xulosa?.trim() || null,
      transcript: k.transkript?.trim() || null,
      promiseDate: k.vada?.kun ?? null,
      promiseAmount: k.vada?.summa ?? null,
      createdByUserId: userId,
    });
    const saqlandi = oldin ? 'yangilandi' : 'yangi';

    if (!k.vada) {
      // Qayta yuborishda va'da olib tashlangan: shu qo'ng'iroq yaratgan ochiq va'da
      // qolib ketsa, kuzatuvchi mijozni yo'q va'da bo'yicha "buzdi" deb belgilaydi.
      // Boshqa manbadan (Telegram, boshqa qo'ng'iroq) kelgan va'daga tegilmaydi.
      if (oldin?.promiseId) {
        const eski = await this.d.promises.findById(oldin.promiseId);
        if (eski && eski.callId === qongiroq.id && (eski.status === 'pending' || eski.status === 'partial')) {
          await this.d.promises.updateStatus(eski.id, 'cancelled');
        }
        await this.d.phoneCalls.setPromiseId(qongiroq.id, null);
      }
      return { qongiroq_id: qongiroqId, saqlandi, vada: 'yoq' };
    }

    // Takroriy yuborish (tarmoq qayta urinishi): shu qo'ng'iroq o'sha va'da bilan
    // allaqachon yozilgan bo'lsa, ochiq va'dani qayta qidirmaymiz — u bekor
    // qilingan yoki boshqa manbadan almashgan bo'lishi mumkin, ikkinchi nusxa chiqmasin.
    if (
      oldin?.promiseId &&
      oldin.promiseDate === k.vada.kun &&
      oldin.promiseAmount === (k.vada.summa ?? null)
    ) {
      return { qongiroq_id: qongiroqId, saqlandi, vada: 'ozgarmadi' };
    }

    const suhbat = await this.d.conversations.findByClientId(shartnoma.clientId);
    if (!suhbat) return { qongiroq_id: qongiroqId, saqlandi, vada: 'faqat_qongiroqda' };

    const yoziladiganlar = faqatYoziladiganlar(await this.d.contracts.findByClientId(shartnoma.clientId));
    const summa = k.vada.summa ?? kechikkanSumma(yoziladiganlar);
    if (!(summa > 0)) return { qongiroq_id: qongiroqId, saqlandi, vada: 'faqat_qongiroqda' };

    const ochiq = await this.d.promises.findActiveByConversation(suhbat.id);
    if (ochiq) {
      const birXil =
        ochiq.promisedDate.toISOString().slice(0, 10) === k.vada.kun && Math.abs(ochiq.amount - summa) < 1;
      if (birXil) {
        await this.d.phoneCalls.setPromiseId(qongiroq.id, ochiq.id);
        return { qongiroq_id: qongiroqId, saqlandi, vada: 'ozgarmadi' };
      }
      await this.d.promises.updateStatus(ochiq.id, 'cancelled');
    }

    const vada = await this.d.promises.create({
      conversationId: suhbat.id,
      clientId: shartnoma.clientId,
      // Bir nechta shartnomada summa mijozning jami kechikishi; to'lovni kuzatuvchi
      // bitta shartnoma bo'yicha sanasa, boshqasiga to'langan pul ko'rinmay, soxta "buzdi" chiqadi.
      contractId: yoziladiganlar.length > 1 ? null : shartnoma.id,
      amount: summa,
      promisedDate: new Date(`${k.vada.kun}T00:00:00Z`),
      quote: `Telefon, ${k.agent_ismi.trim()}: ${k.xulosa?.trim() ?? ''}`.trim(),
      source: 'phone',
      callId: qongiroq.id,
    });
    await this.d.phoneCalls.setPromiseId(qongiroq.id, vada.id);
    return { qongiroq_id: qongiroqId, saqlandi, vada: 'yozildi' };
  }

  private tekshir(k: QongiroqNatijasiKirish): void {
    if (!(QONGIROQ_NATIJALARI as readonly string[]).includes(k.natija)) {
      throw new NotogriKirish(`natija noto'g'ri: ${String(k.natija)}`);
    }
    // Zonasiz vaqt serverning mahalliy zonasida o'qiladi — qo'ng'iroq soati siljib ketadi,
    // shuning uchun zona majburiy.
    if (!ZONALI_VAQT.test(k.boshlandi) || Number.isNaN(new Date(k.boshlandi).getTime())) {
      throw new NotogriKirish('boshlandi — vaqt zonasi bilan to\'liq ISO 8601 vaqt bo\'lishi kerak');
    }
    if (!(k.davomiylik_soniya >= 0)) throw new NotogriKirish('davomiylik_soniya manfiy bo\'lmasin');
    if (k.natija === 'gaplashildi' && !k.xulosa?.trim()) {
      throw new NotogriKirish('natija "gaplashildi" bo\'lsa xulosa majburiy');
    }
    if (k.vada) {
      if (k.natija !== 'gaplashildi') throw new NotogriKirish('vada faqat natija "gaplashildi" bo\'lganda beriladi');
      const bugun = this.d.clock.todayIso();
      if (!sanami(k.vada.kun)) throw new NotogriKirish('vada.kun — YYYY-MM-DD');
      if (k.vada.kun < bugun) throw new NotogriKirish('vada.kun o\'tgan sana bo\'lmasin');
      if (k.vada.kun > kunQosh(bugun, VADA_ENG_UZOQ_KUN)) {
        throw new NotogriKirish(`vada.kun ${VADA_ENG_UZOQ_KUN} kundan uzoq bo'lmasin`);
      }
      if (k.vada.summa !== undefined && !(k.vada.summa > 0)) throw new NotogriKirish('vada.summa musbat bo\'lsin');
    }
  }
}
