/**
 * Jurnal qatorlariga qo'shiladigan UMUMIY kontekst maydonlari.
 *
 * NEGA ALOHIDA FUNKSIYA, HAR JOYDA OBYEKT LITERALI EMAS: bu maydonlarning
 * butun foydasi kalitlar hamma joyda bir xil bo'lishida. Bir joyda
 * `akkaunt`, boshqasida `account` yozilsa, operator
 * `journalctl | grep '"akkaunt":"Madina"'` bilan qidira olmaydi va
 * boyitishning ma'nosi qolmaydi. Funksiya kalitlarni bitta joyda ushlab
 * turadi va tip tekshiruvi xato nom yozishga yo'l qo'ymaydi.
 *
 * Bo'sh qiymatlar tushirib qoldiriladi: `"shartnoma":null` qatorni
 * uzaytiradi va hech narsa aytmaydi.
 *
 * Chaqirish namunasi:
 *   log.warn({ ...kontekst({ shartnoma, akkaunt, mijoz }), err }, 'Xabar ketmadi');
 */
export interface LogKontekst {
  /** Shartnoma raqami — `contract.contractNo`, masalan `3090MSO25A5`. */
  shartnoma?: string | null;
  /** Telegram akkauntning ichki nomi — `account.label`, masalan `Madina`. */
  akkaunt?: string | null;
  /** Mijozning F.I.O. si. */
  mijoz?: string | null;
}

export function kontekst(k: LogKontekst): Record<string, string> {
  const out: Record<string, string> = {};
  // Tartib qotirilgan: qatorlarni ko'z bilan solishtirish osonroq bo'lsin.
  const q = (v: string | null | undefined): string | null => {
    const t = typeof v === 'string' ? v.trim() : '';
    return t === '' ? null : t;
  };

  const shartnoma = q(k.shartnoma);
  if (shartnoma) out.shartnoma = shartnoma;

  const akkaunt = q(k.akkaunt);
  if (akkaunt) out.akkaunt = akkaunt;

  const mijoz = q(k.mijoz);
  if (mijoz) out.mijoz = mijoz;

  return out;
}
