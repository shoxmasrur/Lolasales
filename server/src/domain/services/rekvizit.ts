/**
 * Talabnomadagi bank rekvizitlari — CRM'dagi kompaniyalar ro'yxatidan
 * shartnoma INN'i bo'yicha tanlanadi.
 *
 * Sof modul (config/tarmoq yo'q): xaritalash va tanlash shu yerda, chunki
 * noto'g'ri hisob raqami mijoz pulini boshqa kompaniyaga yuboradi —
 * qoida alohida, to'liq sinaladigan bo'lishi kerak.
 */

export interface CrmHisob {
  hisob: string;
  mfo: string;
  bank: string;
  asosiy: boolean;
  faol: boolean;
}

export interface CrmKompaniya {
  id: number;
  nomi: string;
  turi: string;
  inn: string | null;
  oked: string | null;
  obyektlarSoni: number;
  hisoblar: CrmHisob[];
}

export interface Rekvizit {
  kompaniya: string;
  turi: string;
  inn: string;
  oked: string;
  hisob: string;
  mfo: string;
  bank: string;
}

export type RekvizitNatija = { ok: true; rekvizit: Rekvizit } | { ok: false; sabab: string };

/**
 * Raqamli maydonlar formati. Bo'sh bo'lmagan, lekin buzuq qiymat (bir xona
 * kam hisob raqami) bo'sh qatordan xavfliroq: hujjat to'g'ri ko'rinadi,
 * to'lov esa qaytadi yoki boshqa hisobga tushadi.
 * INN: kompaniya — 9 xona; 14 xonali (YATT/JShShIR) ham ruxsat etiladi.
 */
const FORMAT: Partial<Record<keyof Rekvizit, RegExp>> = {
  inn: /^\d{9}(\d{5})?$/,
  oked: /^\d{5}$/,
  hisob: /^\d{20}$/,
  mfo: /^\d{5}$/,
};

type Xom = Record<string, unknown>;

const obyekt = (v: unknown): Xom => (v && typeof v === 'object' ? (v as Xom) : {});
const satr = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const satrYokiNull = (v: unknown): string | null => {
  const s = satr(v);
  return s === '' ? null : s;
};

/**
 * `GET /api/v1/crm/companies` javobini (yuqori darajadagi massiv) bizning
 * turlarga o'giradi. Massiv bo'lmasa — xato: javob shakli o'zgargan bo'lsa,
 * jim "topilmadi" deyish operatorni chalg'itadi.
 */
export function crmKompaniyalari(xom: unknown): CrmKompaniya[] {
  if (!Array.isArray(xom)) throw new Error("CRM kompaniyalar javobi ro'yxat emas");
  return xom.map((x) => {
    const k = obyekt(x);
    const details = Array.isArray(k.details) ? k.details : [];
    return {
      id: Number(k.id),
      nomi: satr(k.name),
      turi: satr(obyekt(k.type).kr),
      inn: satrYokiNull(k.inn),
      oked: satrYokiNull(k.oked),
      obyektlarSoni: Number(k.objects_count) || 0,
      hisoblar: details.map((d) => {
        const h = obyekt(d);
        return {
          hisob: satr(h.payment_account),
          mfo: satr(h.mfo),
          // Bank nomining oxirida bo'shliq kelishi bor; faqat bo'shliq
          // olinadi, matn (hatto oxiridagi vergul) o'zgartirilmaydi.
          bank: satr(obyekt(h.bank_name).uz),
          asosiy: h.is_primary === 1,
          faol: h.is_active === 1,
        };
      }),
    };
  });
}

/**
 * Tartib: INN bo'yicha → bir nechta yozuv bo'lsa obyekti borlari →
 * faol hisoblar → bir nechta bo'lsa yagona asosiysi. Har bir shubhali
 * joyda tanlamaymiz va sababini aytamiz — taxminiy hisob raqami
 * rekvizitsiz talabnomadan ko'ra xavfliroq.
 */
export function rekvizitTanla(kompaniyalar: CrmKompaniya[], inn: string | null): RekvizitNatija {
  const izlanadi = (inn ?? '').trim();
  if (izlanadi === '') return { ok: false, sabab: "Shartnomada kompaniya INN'i yo'q" };

  let mos = kompaniyalar.filter((k) => k.inn === izlanadi);
  if (mos.length === 0) return { ok: false, sabab: `INN ${izlanadi} bo'yicha kompaniya topilmadi` };

  // CRM'da bir kompaniya ikki marta kiritilgan holatlar bor (eski yozuv
  // obyektsiz qolgan) — obyekti bor yozuv haqiqiysi.
  if (mos.length > 1) {
    const obyektli = mos.filter((k) => k.obyektlarSoni > 0);
    if (obyektli.length === 1) mos = obyektli;
    else return { ok: false, sabab: `${mos[0]!.nomi}: bir nechta kompaniya yozuvi, aniq emas` };
  }
  const k = mos[0]!;

  const faollar = k.hisoblar.filter((h) => h.faol);
  let hisob: CrmHisob | undefined = faollar[0];
  if (faollar.length > 1) {
    const asosiylar = faollar.filter((h) => h.asosiy);
    if (asosiylar.length !== 1) {
      return { ok: false, sabab: `${k.nomi}: ${faollar.length} ta faol hisob, asosiysi aniq emas` };
    }
    hisob = asosiylar[0];
  }

  const rekvizit: Rekvizit = {
    kompaniya: k.nomi,
    turi: k.turi,
    inn: izlanadi,
    oked: k.oked ?? '',
    hisob: hisob?.hisob ?? '',
    mfo: hisob?.mfo ?? '',
    bank: hisob?.bank ?? '',
  };
  // Hujjatda bo'sh yoki buzuq qator bo'lmasligi kerak — birinchisini aytamiz.
  const bosh = (Object.keys(rekvizit) as Array<keyof Rekvizit>).find(
    (m) => rekvizit[m] === '' || (FORMAT[m] !== undefined && !FORMAT[m]!.test(rekvizit[m])),
  );
  if (bosh) return { ok: false, sabab: `${k.nomi}: rekvizit to'liq emas (${bosh})` };

  return { ok: true, rekvizit };
}
