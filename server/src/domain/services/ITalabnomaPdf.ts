import type { Rekvizit } from '@/domain/services/rekvizit';

/** Talabnomaga tushadigan barcha o'zgaruvchan qiymatlar. */
export interface TalabnomaMalumot {
  /** null — hali yuborilmagan (ko'rinish), `ET-__` chiqadi. */
  raqam: number | null;
  /** Yuborilgan kun (Toshkent), `YYYY-MM-DD`. */
  sanaIso: string;
  fullName: string;
  contractNo: string;
  contractDate: Date | null;
  objectName: string;
  objectAddress: string;
  summa: number;
  rekvizit: Rekvizit;
}

export interface TalabnomaRenderOpts {
  muhrsiz?: boolean;
}

/** Talabnoma PDF'ini yasaydi (muhr, imzo va blank foni bilan). */
export interface ITalabnomaPdf {
  /**
   * Muhr/imzo/fon fayllari va brauzer bormi. Yo'q bo'lsa funksiya o'chiq
   * turadi — muhrsiz «rasmiy» xat ketgandan ko'ra yubormaslik yaxshi.
   */
  tayyormi(): Promise<boolean>;
  /** `muhrsiz` — chop etish uchun nusxa: muhr va imzo rasmlarisiz (fon qoladi). */
  render(m: TalabnomaMalumot, opts?: TalabnomaRenderOpts): Promise<Buffer>;
}
