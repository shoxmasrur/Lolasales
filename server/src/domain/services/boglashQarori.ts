export type BoglashQarori =
  | { kind: 'boglash'; clientId: string }
  | { kind: 'tasdiq_kerak'; clientId: string; sabab: string }
  | { kind: 'topilmadi' }
  | { kind: 'crm_xato'; sabab: string };

/**
 * Odam yozgan raqam bo'yicha suhbatni avtomatik bog'lash mumkinmi — sof qaror.
 *
 * Sabab matni eng aniq bo'lsin deb, "boshqa suhbat" tekshiruvi telefon
 * moslikdan KEYIN turadi: telefon mos kelmasa, avvalo shu aytiladi.
 */
export function boglashQarori(input: {
  topilgan:
    | {
        kind: 'topildi'; clientId: string; telefonlar: string[]; boshqaSuhbatBor: boolean;
        /**
         * Mijozda allaqachon BOSHQA Telegram hisobi saqlangan. Avtomatik
         * bog'lash uni jimgina almashtirib yuborardi — operator ko'rsin.
         */
        boshqaTelegram: boolean;
      }
    | { kind: 'topilmadi' }
    | { kind: 'crm_xato'; sabab: string };
  /** `normalizePhone` qilingan yoki null. */
  telegramTelefon: string | null;
}): BoglashQarori {
  const { topilgan, telegramTelefon } = input;
  if (topilgan.kind === 'crm_xato') return { kind: 'crm_xato', sabab: topilgan.sabab };
  if (topilgan.kind === 'topilmadi') return { kind: 'topilmadi' };

  const { clientId } = topilgan;
  if (!telegramTelefon) {
    return { kind: 'tasdiq_kerak', clientId, sabab: 'Telegram raqami yashirin' };
  }
  if (!topilgan.telefonlar.includes(telegramTelefon)) {
    return { kind: 'tasdiq_kerak', clientId, sabab: "Telegram raqami CRM'dagiga mos emas" };
  }
  if (topilgan.boshqaTelegram) {
    return { kind: 'tasdiq_kerak', clientId, sabab: 'Mijozda boshqa Telegram hisobi bor' };
  }
  if (topilgan.boshqaSuhbatBor) {
    return { kind: 'tasdiq_kerak', clientId, sabab: 'Mijozning shu akkauntda boshqa suhbati bor' };
  }
  return { kind: 'boglash', clientId };
}
