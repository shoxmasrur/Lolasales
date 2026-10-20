export type NomalumHolat = 'kutilmoqda' | 'hujjat_kutilmoqda' | 'tasdiq_kutilmoqda' | 'operatorda' | 'mijoz_emas' | 'boglandi';

export interface NomalumSuhbat {
  readonly conversationId: string;
  readonly holat: NomalumHolat;
  readonly agentJavoblari: number;
  readonly urinishlar: number;
  /** Yozilgan shartnoma raqami necha marta topilmagani (`urinishlar` dan alohida). */
  readonly topilmagan: number;
  readonly shartnomaRaqami: string | null;
  readonly topilganClientId: string | null;
  readonly telegramTelefon: string | null;
  readonly sabab: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/*
 * Noma'lum suhbatni operatorga chiqarganda `conversations.human_reason` ga
 * yoziladigan matnlar. Bitta joyda, chunki bog'lash (`MijozgaBoglashUseCase`)
 * aynan SHU matnlarni taniydi va operator tasdiqlagach bayroqni tushiradi —
 * aks holda bog'langan odamga asosiy agent ham javob bera olmasdi
 * (`canAgentReply` yopiq qolardi). Boshqa sabablar (chek, agent xatosi)
 * tegilmaydi: ular bog'lashdan qat'i nazar operatorniki.
 */
export const NOMALUM_SABAB_TASDIQ = 'Noma\'lum mijoz — shartnoma topildi, bog\'lashni tasdiqlang';
export const NOMALUM_SABAB_OPERATOR = 'Noma\'lum mijoz — operator javob bersin';
export const NOMALUM_SABAB_ESKI_XABAR = 'Noma\'lum mijoz: eski xabar — operator javob bersin';
/** Hujjat (pasport / shartnoma 1-beti) rasmi keldi — operator ko'rib tasdiqlaydi. */
export const NOMALUM_SABAB_HUJJAT = 'Noma\'lum mijoz hujjat yubordi — tekshirib, bog\'lashni tasdiqlang';

const NOMALUM_SABABLARI: ReadonlySet<string> = new Set([
  NOMALUM_SABAB_TASDIQ,
  NOMALUM_SABAB_OPERATOR,
  NOMALUM_SABAB_ESKI_XABAR,
  NOMALUM_SABAB_HUJJAT,
]);

/** `humanReason` shu funksiya (noma'lum mijoz oqimi) qo'ygan belgimi. */
export function nomalumSababimi(humanReason: string | null): boolean {
  return humanReason !== null && NOMALUM_SABABLARI.has(humanReason);
}
