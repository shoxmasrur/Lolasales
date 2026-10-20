import type { HumanKind } from '@/domain/entities/Conversation';
import { OCHIQ_VADA_HOLATLARI } from '@/domain/entities/PaymentPromise';
import type { RecontactKind } from '@/domain/repositories/IRecontactRepository';
import { sukutKunlari } from '@/domain/services/sukut';
import { zonedParts } from '@/shared/datetime';

/**
 * Turlarning ustunlik tartibi: bitta suhbat faqat BITTA turga tushadi —
 * shu tartibda birinchi mos kelgani. Buzilgan va'da eng og'ir holat
 * (mijoz so'z berib bajarmagan), o'qilmagan xabar esa eng yengili.
 */
export const RECONTACT_KIND_ORDER: readonly RecontactKind[] = [
  'vada_buzilgan',
  'sana_yoq',
  'javobsiz',
  'oqilmagan',
];

/**
 * Oxirgi xabardan beri shuncha ISH KUNI o'tmasa ro'yxatga tushmaydi.
 *
 * NEGA 3: sukut kuzatuvchisi yangi jim qolganlarga o'zi yozadi (prodda
 * `silenceNudgeDays` = 1, `silenceNudgeMax` = 2). Qisqa chegara ikkalasini
 * bir suhbatda to'qnashtirardi — mijoz bir kunda agentdan ham, operator
 * yuborgan xabarni ham olardi. Chegara dizayn hujjatida qat'iy (2.2).
 */
export const QAYTA_ALOQA_ISH_KUNLARI = 3;

/** Mijozni bizga yozishdan to'sgan holatlar — `canAutoMessage` bilan bir xil. */
const BLOKLANGAN_HOLATLAR: readonly string[] = ['blocked', 'deactivated'];

/** Ro'yxatga umuman tushmaydigan suhbat holatlari. */
const YOPIQ_SUHBAT_HOLATLARI: readonly string[] = ['closed', 'refused'];

/** Snapshot'dagi va'da — sana ISO (`YYYY-MM-DD`), bazadagi `DATE` ustunidek. */
export interface QaytaAloqaVadasi {
  readonly date: string;
  readonly status: string;
  readonly amount: number;
}

/**
 * Bitta suhbat haqida qaror uchun kerak bo'lgan hamma narsa — bazadan
 * mustaqil. Repozitoriy uni bitta so'rovda yig'adi.
 */
export interface QaytaAloqaSnapshot {
  /** Oxirgi `in`/`out` xabar (operator topshirig'i — `note` — hisobga olinmaydi). */
  readonly lastMessage: {
    readonly direction: 'in' | 'out';
    readonly at: Date;
    /** Faqat `out` uchun ma'noli: mijoz o'qigan vaqt. */
    readonly readAt: Date | null;
  } | null;
  /** Mijoz bu suhbatda kamida bir marta yozganmi. */
  readonly mijozYozgan: boolean;
  readonly nudgeCount: number;
  /** Eng oxirgi yaratilgan va'da (holatidan qat'iy nazar). */
  readonly lastPromise: QaytaAloqaVadasi | null;
  /** O'chirilmagan `pending`/`partial` va'dalar — sanasi hali tekshirilmagan. */
  readonly ochiqVadalar: readonly QaytaAloqaVadasi[];
  /** "Сотилди" shartnomalar bo'yicha `debt_first + debt_monthly`. */
  readonly overdue: number;
  readonly state: string;
  readonly agentEnabled: boolean;
  readonly needsHuman: boolean;
  readonly humanKind: HumanKind | null;
  readonly telegramStatus: string | null;
  readonly doNotContact: boolean;
}

/** Debitor davridagi `silenceNudgeMax` sozlamasi o'rniga: endi qotirilgan (sozlama olib tashlangan). */
export const SUKUT_MAX_URINISH = 2;

export interface QaytaAloqaQoidalari {
  readonly minDebt: number;
  readonly silenceNudgeMax: number;
  readonly timeZone?: string;
}

export interface QaytaAloqaNatija {
  readonly kind: RecontactKind | null;
  /** Oxirgi xabardan beri ish kunlari (yakshanba sanalmaydi). Xabar yo'q bo'lsa 0. */
  readonly silentWorkDays: number;
}

/** "Ochiq va'da"ning yagona ta'rifi — `OCHIQ_VADA_HOLATLARI`. */
const OCHIQ: readonly string[] = OCHIQ_VADA_HOLATLARI;

/**
 * Suhbat qayta aloqa ro'yxatiga tushadimi va qaysi turga.
 *
 * Sof funksiya: ro'yxat ham, yuborish oldidan qayta tekshirish ham shu
 * yerdan o'tadi. Ikki joyda ikki xil qoida bo'lsa, ro'yxatda ko'ringan
 * suhbat yuborishda jimgina tushib qolardi (yoki aksincha).
 *
 * Shartlar dizayn hujjatining 2.2-bo'limi bilan AYNAN bir xil
 * (docs/superpowers/specs/2026-09-16-qayta-aloqa-royxati-design.md).
 */
export function qaytaAloqaTuri(
  s: QaytaAloqaSnapshot,
  hozir: Date,
  qoidalar: QaytaAloqaQoidalari,
): QaytaAloqaNatija {
  const silentWorkDays = s.lastMessage
    ? sukutKunlari(s.lastMessage.at, hozir, qoidalar.timeZone)
    : 0;
  const yoq: QaytaAloqaNatija = { kind: null, silentWorkDays };

  // ── Umumiy shartlar ────────────────────────────────────────────────
  if (!s.lastMessage) return yoq;
  if (s.overdue <= qoidalar.minDebt) return yoq;
  if (s.telegramStatus && BLOKLANGAN_HOLATLAR.includes(s.telegramStatus)) return yoq;
  if (s.doNotContact) return yoq;
  if (YOPIQ_SUHBAT_HOLATLARI.includes(s.state)) return yoq;
  if (!s.agentEnabled) return yoq;
  // Operator qo'lga olgan suhbatga tegilmaydi; buzilgan va'da — istisno,
  // aynan u ro'yxatning birinchi turi.
  if (s.needsHuman && s.humanKind !== 'broken_promise') return yoq;
  if (silentWorkDays < QAYTA_ALOQA_ISH_KUNLARI) return yoq;

  // Sanasi hali kelmagan faol va'da — `PromiseWatcher` ning ishi. Ikkalasi
  // yozsa, mijoz o'zi aytgan kundan oldin "qachon to'laysiz" degan xabar
  // olardi.
  const bugun = zonedParts(hozir, qoidalar.timeZone).isoDate;
  if (s.ochiqVadalar.some((v) => OCHIQ.includes(v.status) && v.date >= bugun)) return yoq;

  // ── Turlar ─────────────────────────────────────────────────────────
  const oxirgi = s.lastMessage;
  const lp = s.lastPromise;
  if (lp && (lp.status === 'broken' || (OCHIQ.includes(lp.status) && lp.date < bugun))) {
    return { kind: 'vada_buzilgan', silentWorkDays };
  }

  const oqilgan = oxirgi.direction === 'out' && oxirgi.readAt !== null;

  if (s.mijozYozgan && (oxirgi.direction === 'in' || oqilgan)) {
    return { kind: 'sana_yoq', silentWorkDays };
  }
  if (oqilgan && s.nudgeCount >= qoidalar.silenceNudgeMax) {
    return { kind: 'javobsiz', silentWorkDays };
  }
  if (oxirgi.direction === 'out' && oxirgi.readAt === null) {
    return { kind: 'oqilmagan', silentWorkDays };
  }
  return yoq;
}
