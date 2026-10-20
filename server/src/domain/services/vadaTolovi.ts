/**
 * Va'da bo'yicha "yangi pul" qanday sanaladi.
 *
 * Sodda qoida — "va'dadan keyingi sanadagi to'lovlar" — real ma'lumotda
 * yiqildi: CRM to'lovga MIJOZ to'lagan kunni qo'yadi, bizga esa u
 * sinxronda bir-ikki kun keyin ko'rinadi. Va'da shu oraliqda yozilgan
 * bo'lsa, kelgan pul "kelmagan" bo'lib qolardi.
 *
 * Shuning uchun ikkinchi yo'l ochildi: sanasi va'dadan oldin bo'lsa ham,
 * biz uni va'dadan KEYIN bilgan bo'lsak — yangi pul.
 *
 * Bu yo'l tor: shartnoma birinchi marta sinxronlanganda uning butun
 * to'lov tarixi bir zumda yoziladi (`upsertHistory`) va yillar oldingi
 * to'lov ham "hozir topildi" bo'lib ko'rinadi. Produksiyada real
 * kechikish 1-6 kun, shuning uchun oyna KECHIKISH_KUNI bilan chegaralangan.
 */

/** To'lov sanasi va'dadan shuncha kun oldin bo'lsa ham hisobga olinadi. */
export const KECHIKISH_KUNI = 7;

export interface TolovHodisasi {
  /** CRM'dagi to'lov sanasi (YYYY-MM-DD) — orqaga qo'yilishi mumkin. */
  readonly datePaidIso: string;
  readonly amount: number;
  /** Biz bu to'lovni qachon bilganimiz (`contract_payment_events.created_at`). */
  readonly discoveredAt: Date;
}

function kunAyir(iso: string, kun: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - kun);
  return d.toISOString().slice(0, 10);
}

/**
 * Bazadan to'lovlarni qaysi sanadan boshlab so'rash kerak.
 *
 * Oyna qoidadan KENGROQ: kech topilgan to'lov umuman kelmasa, quyidagi
 * tanlov uni ko'rmaydi ham.
 */
export function tolovOynasiBoshi(vadaYaratilgan: Date): string {
  return kunAyir(vadaYaratilgan.toISOString().slice(0, 10), KECHIKISH_KUNI);
}

/** Va'da berilganidan keyin kelgan to'lovlar yig'indisi. */
export function vadadanKeyingiTolov(
  events: readonly TolovHodisasi[],
  vadaYaratilgan: Date,
): number {
  const vadaIso = vadaYaratilgan.toISOString().slice(0, 10);
  const engErtaIso = kunAyir(vadaIso, KECHIKISH_KUNI);

  return events.reduce((jami, e) => {
    const sanaBoyicha = e.datePaidIso >= vadaIso;
    const kechTopilgan = e.discoveredAt > vadaYaratilgan && e.datePaidIso >= engErtaIso;
    return sanaBoyicha || kechTopilgan ? jami + e.amount : jami;
  }, 0);
}
