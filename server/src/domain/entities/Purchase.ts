export const XARID_BOSQICHLARI = [
  'yangi', 'suhbatda', 'qiziqdi', 'karta_yuborildi', 'chek_keldi', 'qisman_toladi', 'toladi', 'rad_etdi',
] as const;
export type XaridBosqichi = (typeof XARID_BOSQICHLARI)[number];

export const BOSQICH_YORLIGI: Record<XaridBosqichi, string> = {
  yangi: 'Yangi',
  suhbatda: 'Suhbatda',
  qiziqdi: 'Qiziqdi',
  karta_yuborildi: 'Karta yuborildi',
  chek_keldi: 'Chek keldi',
  qisman_toladi: "Qisman to'ladi",
  toladi: "To'ladi",
  rad_etdi: 'Rad etdi',
};

export type BosqichAktori = 'agent' | 'tizim' | 'menejer';

export interface Purchase {
  id: string;
  clientId: string;
  courseId: string | null;
  stage: XaridBosqichi;
  stageChangedAt: Date;
  totalAmount: number | null;
  paidAmount: number;
  installment: boolean;
  linkSentAt: Date | null;
  remindedStages: XaridBosqichi[];
  createdAt: Date;
}

export function yakunlanganmi(stage: XaridBosqichi): boolean {
  return stage === 'toladi' || stage === 'rad_etdi';
}

const AGENT_OLDINGA: readonly XaridBosqichi[] = ['yangi', 'suhbatda', 'qiziqdi'];
const TIZIM_QOYADI: readonly XaridBosqichi[] = ['karta_yuborildi', 'chek_keldi', 'qisman_toladi', 'toladi'];
/**
 * Agent `rad_etdi` ni faqat pul hali kelmagan bosqichlardan qo'yadi:
 * `chek_keldi` (chek tekshiruvda) va `qisman_toladi` (pul to'langan) da
 * mijozning "kerak emas"i — menejer masalasi.
 */
const AGENT_RAD_ETADI: readonly XaridBosqichi[] = ['yangi', 'suhbatda', 'qiziqdi', 'karta_yuborildi'];

/** Bosqich o'tishi ruxsat etilsa yangi bosqich, aks holda null. */
export function bosqichOtishi(current: XaridBosqichi, requested: XaridBosqichi, actor: BosqichAktori): XaridBosqichi | null {
  if (current === requested) return null;
  if (actor === 'menejer') return requested;
  if (yakunlanganmi(current)) return null;
  if (actor === 'tizim') return TIZIM_QOYADI.includes(requested) ? requested : null;
  if (requested === 'rad_etdi') return AGENT_RAD_ETADI.includes(current) ? requested : null;
  const i = AGENT_OLDINGA.indexOf(current);
  const j = AGENT_OLDINGA.indexOf(requested);
  return i >= 0 && j > i ? requested : null;
}

export function tolovdanKeyingiBosqich(paid: number, total: number): 'qisman_toladi' | 'toladi' {
  return paid >= total ? 'toladi' : 'qisman_toladi';
}
