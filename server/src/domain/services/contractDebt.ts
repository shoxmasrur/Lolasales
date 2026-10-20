/**
 * Kechikkan to'lovni to'lov grafigidan hisoblaydi.
 *
 * NEGA shartnomalar bazasidagi `total_debt` ishlatilmaydi: u
 * `transaction_price - total_paid`, ya'ni shartnoma bo'yicha umumiy qoldiq.
 * Mijozga aytiladigan summa esa MUDDATI O'TGAN va to'lanmagan qismlar
 * yig'indisi. Bittasini ikkinchisi o'rniga ishlatish mijozga bir necha
 * baravar katta raqam aytilishiga olib keladi.
 */

/**
 * `meter` — hisoblagichlar uchun to'lov (CRM'da `for_electrocity`). Oylik
 * to'lov EMAS: mijozga alohida aytiladi va kechikkan summaga qo'shilmaydi.
 * `other` — CRM'ning biz tanimaydigan turi; oylik qatoridek hisoblanadi.
 */
export type ScheduleType = 'initial_payment' | 'monthly' | 'meter' | 'other';

export interface ScheduleRow {
  readonly type: ScheduleType;
  readonly amount: number;
  readonly amountPaid: number;
  /** YYYY-MM-DD */
  readonly datePayment: string;
  readonly status: 'paid' | 'partially' | 'waiting';
}

export interface DebtBreakdown {
  readonly overdueTotal: number;
  readonly overdueMonthly: number;
  readonly overdueFirst: number;
  /**
   * Hisoblagichlar uchun to'lovdagi kechikish. `overdueTotal` ga KIRMAYDI:
   * tizim bo'ylab "kechikkan summa" — boshlang'ich + oylik
   * (`kechikkanSumma`), suhbat boshlash va yopish shunga tayanadi.
   */
  readonly overdueMeter: number;
  readonly daysOverdue: number;
  readonly missedMonths: number;
  /** YYYY-MM-DD yoki null (kelajakdagi to'lov qolmagan). */
  readonly nextPaymentDate: string | null;
  readonly nextPaymentAmount: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ikki YYYY-MM-DD orasidagi kun farqi. Vaqt mintaqasi ta'sir qilmasin deb UTC. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

/**
 * `todayIso` — YYYY-MM-DD (Asia/Tashkent bo'yicha, `IClock.todayIso()`).
 *
 * Sanalar satr sifatida solishtiriladi: YYYY-MM-DD formatida leksikografik
 * tartib xronologik tartib bilan bir xil, `Date` yaratish esa vaqt mintaqasi
 * siljishini olib kirardi.
 */
export function computeDebt(schedule: readonly ScheduleRow[], todayIso: string): DebtBreakdown {
  let overdueMonthly = 0;
  let overdueFirst = 0;
  let overdueMeter = 0;
  let missedMonths = 0;
  let earliestUnpaid: string | null = null;
  let nextDate: string | null = null;
  let nextAmount: number | null = null;

  for (const p of schedule) {
    const unpaid = Math.max(0, p.amount - p.amountPaid);
    const settled = p.status === 'paid';
    const overdue = p.datePayment < todayIso && !settled && unpaid > 0;

    // Hisoblagich qatori faqat o'z summasiga ta'sir qiladi: kechikish
    // kuni, qoldirilgan oylar va navbatdagi to'lov sanasi oylik grafik
    // bo'yicha qoladi — aks holda agent 3,87 mln ni "oylik to'lov" derdi.
    if (p.type === 'meter') {
      if (overdue) overdueMeter += unpaid;
      continue;
    }

    if (overdue) {
      if (p.type === 'initial_payment') {
        overdueFirst += unpaid;
      } else {
        overdueMonthly += unpaid;
        // "Nechta oy qoldirilgan" — faqat oylik to'lovlar sanaladi.
        // Boshlang'ich to'lov kechikishi bu sonni sun'iy oshirib yuborardi.
        if (p.type === 'monthly') missedMonths += 1;
      }
      if (!earliestUnpaid || p.datePayment < earliestUnpaid) earliestUnpaid = p.datePayment;
    }

    if (!settled && p.datePayment >= todayIso && (!nextDate || p.datePayment < nextDate)) {
      nextDate = p.datePayment;
      nextAmount = p.amount;
    }
  }

  return {
    overdueTotal: overdueMonthly + overdueFirst,
    overdueMonthly,
    overdueFirst,
    overdueMeter,
    daysOverdue: earliestUnpaid ? daysBetween(earliestUnpaid, todayIso) : 0,
    missedMonths,
    nextPaymentDate: nextDate,
    nextPaymentAmount: nextAmount,
  };
}
