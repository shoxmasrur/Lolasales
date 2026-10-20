import { api, ApiError } from '@/lib/api';

/**
 * Elektron talabnoma — API turlari va so'rovlari.
 *
 * Hammasi `/api/talabnomalar` ostida (server: `talabnomaRoutes.ts`).
 * Ko'rish — `talabnoma.view`, yuborish/qayta/bekor — `talabnoma.send`.
 */

export type TalabnomaHolati = 'yuborilmoqda' | 'yuborildi' | 'xato' | 'bekor';

export const TALABNOMA_HOLATLARI: readonly TalabnomaHolati[] = ['yuborilmoqda', 'yuborildi', 'xato', 'bekor'];

export const HOLAT_LABEL: Record<TalabnomaHolati, string> = {
  yuborilmoqda: 'Yuborilmoqda',
  yuborildi: 'Yuborildi',
  xato: 'Xato',
  bekor: 'Bekor qilingan',
};

export const HOLAT_COLOR: Record<TalabnomaHolati, string> = {
  yuborilmoqda: 'bg-sky-500/15 text-sky-300',
  yuborildi: 'bg-emerald-500/15 text-emerald-300',
  xato: 'bg-red-500/15 text-red-300',
  bekor: 'bg-ink-700/60 text-ink-400',
};

export interface Rekvizit {
  kompaniya: string;
  turi: string;
  inn: string;
  oked: string;
  hisob: string;
  mfo: string;
  bank: string;
}

/** Shartnomaning CRM holati — server `HolatKorinishi` (kanonik kalit + CRM'dagi nom). */
export interface ShartnomaHolati {
  kalit: string;
  nomi: string;
}

/**
 * «Yuborishga tayyor» ro'yxatida bo'ladigan holatlar (server
 * `YOZILADIGAN_KALITLAR`) — filtr variantlari shu tartibda.
 */
export const YOZILADIGAN_HOLATLAR: readonly ShartnomaHolati[] = [
  { kalit: 'sold', nomi: 'Сотилди' },
  { kalit: 'for_payment', nomi: 'К оплате' },
  { kalit: 'cancellation_process', nomi: 'Проц. отказ' },
];

/** Bekor qilinayotgan shartnoma — sariq belgi bilan ajratiladi. */
export const BEKOR_JARAYONI = 'cancellation_process';

export type RekvizitNatija = { ok: true; rekvizit: Rekvizit } | { ok: false; sabab: string };

/** «Yuborishga tayyor» qatori — server `TayyorQator`. */
export interface TayyorQator {
  contractId: string;
  clientId: string;
  contractNo: string;
  /** ISO yoki null. */
  contractDate: string | null;
  objectName: string | null;
  objectAddress: string | null;
  companyInn: string | null;
  /** Kechikkan oylik to'lovlar — talabnoma summasi shu. */
  debtMonthly: number;
  fullName: string;
  firstName: string | null;
  /** Mijoz nomidan qarindoshi yozadi. */
  qarindoshOrqali: boolean;
  /**
   * `null` — kompaniya INN'i hali sinxronlanmagan: rekvizit yuborishda
   * (CRM sinxidan keyin) tekshiriladi, yuborish to'silmaydi.
   */
  rekvizit: RekvizitNatija | null;
  /**
   * Hujjatga kerak, bazada hali yo'q maydonlar (masalan `"kompaniya INN'i,
   * obyekt manzili"`). Yuborish to'silmaydi — server avval CRM'dan
   * sinxlab, ularni to'ldiradi.
   */
  malumotYetishmaydi: string | null;
  /** Shartnomaning CRM holati; `null` — bazada holat yo'q. */
  shartnomaHolati: ShartnomaHolati | null;
}

/** «CRM'dan yangilash» fon vazifasi — server `CrmYangilashVazifasi`. */
export interface CrmYangilashHolati {
  holat: 'bosh' | 'ishlayapti' | 'tugadi' | 'xato';
  jami: number;
  bajarildi: number;
  yangilandi: number;
  xatolar: number;
  boshlangan: string | null;
  tugagan: string | null;
  sabab: string | null;
}

/** Talabnoma yozuvi — server `Talabnoma` (yuborish/qayta urinish javobi). */
export interface Talabnoma {
  id: string;
  contractId: string;
  clientId: string;
  raqam: number | null;
  holat: TalabnomaHolati;
  summa: number;
  rekvizit: Rekvizit;
  pdfPath: string | null;
  messageId: string | null;
  kuchgaKirish: string | null;
  muddatSanasi: string | null;
  sentAt: string | null;
  /** Yuborgan operatorning id'si. */
  sentBy: string | null;
  xatoSababi: string | null;
  createdAt: string;
  /** Oxirgi holat o'zgarishi — osilgan `yuborilmoqda` shu bo'yicha taniladi. */
  updatedAt: string;
}

/** Ro'yxat qatori — server `TalabnomaQatori`. */
export interface TalabnomaQatori extends Talabnoma {
  /** Yuborgan operatorning ismi (server `users` bilan qo'shib beradi). */
  sentByName: string | null;
  fullName: string;
  contractNo: string;
  /** Shartnomaning HOZIRGI obyekti va CRM holati (yuborilgan paytdagisi emas). */
  objectName: string | null;
  shartnomaHolati: ShartnomaHolati | null;
}

/** «Yuborilgan» filtrlari uchun variantlar — server `TalabnomaFiltrVariantlari`. */
export interface TalabnomaFiltrVariantlari {
  holatlar: ShartnomaHolati[];
  obyektlar: string[];
}

/** Server `qaytaUrinishgaOl` dagi chegara bilan bir xil. */
const OSILGAN_MS = 10 * 60 * 1000;

/**
 * 10 daqiqadan beri o'zgarmagan `yuborilmoqda` — jarayon yiqilgan (server
 * qayta ishga tushgan). Server uni qayta urinishga beradi; aks holda
 * shartnoma sahifadan hech qanday amalsiz band bo'lib qolardi.
 */
export function osilganmi(t: Pick<Talabnoma, 'holat' | 'updatedAt'>, hozir: number = Date.now()): boolean {
  return t.holat === 'yuborilmoqda' && hozir - new Date(t.updatedAt).getTime() > OSILGAN_MS;
}

export interface TalabnomaPage {
  items: TalabnomaQatori[];
  total: number;
  limit: number;
  offset: number;
}

/** `ET-01`; raqam hali berilmagan bo'lsa `ET-__` (server `talabnomaRaqami` bilan bir xil). */
export function etRaqam(raqam: number | null): string {
  return raqam === null ? 'ET-__' : `ET-${String(raqam).padStart(2, '0')}`;
}

export const talabnomaApi = {
  holat: () => api.get<{ tayyor: boolean }>('/talabnomalar/holat'),
  tayyorlar: () => api.get<TayyorQator[]>('/talabnomalar/tayyor'),
  yubor: (contractId: string) => api.post<Talabnoma>(`/talabnomalar/tayyor/${contractId}/yubor`),
  /**
   * `holat` — talabnomaning o'z holati; `shartnomaHolati` (kalit) va
   * `obyekt` — shartnomaning hozirgi CRM holati va obyekti; `clientId` —
   * faqat shu mijozniki («Batafsil» oynasi). Bo'sh — filtr yo'q.
   */
  list: (p: {
    holat?: TalabnomaHolati | '';
    shartnomaHolati?: string;
    obyekt?: string;
    clientId?: string;
    page: number;
    limit: number;
  }) =>
    api.get<TalabnomaPage>('/talabnomalar', p),
  variantlar: () => api.get<TalabnomaFiltrVariantlari>('/talabnomalar/variantlar'),
  qayta: (id: string) => api.post<Talabnoma>(`/talabnomalar/${id}/qayta`),
  bekor: (id: string) => api.post<{ ok: true }>(`/talabnomalar/${id}/bekor`),
  crmYangilashHolati: () => api.get<CrmYangilashHolati>('/talabnomalar/crm-yangilash'),
  /** Boshlaydi; ketayotgan bo'lsa yangisi boshlanmaydi — joriy holat qaytadi. */
  crmYangila: () => api.post<CrmYangilashHolati>('/talabnomalar/crm-yangilash'),
};

/** PDF yo'llari — `/api` ga nisbatan (`TalabnomaPdfKorinish` o'zi qo'shadi). */
export const korinishPdfYoli = (contractId: string): string => `/talabnomalar/tayyor/${contractId}/pdf`;
export const talabnomaPdfYoli = (id: string): string => `/talabnomalar/${id}/pdf`;
/** Chop etish uchun nusxa (muhr va imzosiz) — faqat `yuborildi`. */
export const chopEtishPdfYoli = (id: string): string => `/talabnomalar/${id}/pdf/chop`;

/**
 * Server xatosini operatorga tushunarli o'zbekcha matnga aylantiradi.
 *
 * NEGA KOD BO'YICHA: server xabarlarining bir qismi ichki prefiks bilan
 * keladi (`REKVIZIT: …`, `MALUMOT_YETISHMAYDI: …`) — operatorga prefiks
 * emas, sababning o'zi kerak. Noma'lum kodda server matni o'zi ko'rsatiladi.
 */
export function talabnomaXatoMatni(err: unknown): string {
  if (!(err instanceof ApiError)) return err instanceof Error ? err.message : String(err);
  switch (err.code) {
    case 'ENDI_KERAK_EMAS':
      return "Talabnoma endi kerak emas — mijoz to'lov qilgan yoki holati o'zgargan";
    case 'TALABNOMA_YETIB_BORGAN':
      return "Talabnoma mijozga yetib borgan — bekor qilib bo'lmaydi. «Qayta urinish» uni yuborildi deb belgilaydi";
    case 'TALABNOMA_BOR':
      return 'Bu shartnomaga talabnoma allaqachon yuborilgan';
    case 'REKVIZIT':
      return err.message.replace(/^REKVIZIT:\s*/, '');
    case 'TELEGRAM_NOMI_MOS_EMAS':
      return 'Mijozning Telegram nomi mos emas — avval tekshiring';
    case 'CHOP_ETIB_BOLMAYDI':
      return 'Faqat yuborilgan talabnomani chop etish mumkin';
    case 'MALUMOT_YETISHMAYDI':
      return `Shartnomada ma'lumot yetishmaydi: ${err.message.replace(/^MALUMOT_YETISHMAYDI:\s*/, '')}`;
    default:
      return err.message;
  }
}

/**
 * Bu xatolardan keyin «tayyor» ro'yxati eskirgan: qator endi ro'yxatda
 * bo'lmasligi kerak (to'lov kelgan yoki boshqa operator yuborib qo'ygan).
 */
export function royxatEskirdimi(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'ENDI_KERAK_EMAS' || err.code === 'TALABNOMA_BOR');
}
