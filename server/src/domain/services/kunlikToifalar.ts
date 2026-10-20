import { norozilikBormi } from '@/domain/services/norozilikLugati';
import { holatKorinishi, type HolatKorinishi } from '@/domain/entities/shartnomaHolati';

/**
 * Kunlik xulosa: bitta suhbat qaysi muammo toifalariga tushishi.
 *
 * Qoida SQL da emas, shu yerda: "uzoq suhbat", "takroriy" kabi ta'riflar
 * o'zgarib turadi va ularni testsiz o'zgartirish xavfli. SQL faqat xom
 * ma'lumot beradi.
 */

export type Toifa =
  | 'agent_xatosi'
  | 'odam_kerak'
  | 'crm_xatosi'
  | 'chek_tekshiruvi'
  | 'buzilgan_vada'
  | 'norozilik'
  | 'texnik_uzilish'
  | 'bajarilmagan_vada'
  | 'salbiy_javob'
  | 'takroriy'
  | 'xabar_tuzatilgan'
  | 'uzoq_suhbat';

/** Jiddiylik tartibi — ro'yxat ham, qatordagi belgilar ham shu tartibda. */
export const TOIFA_TARTIBI: readonly Toifa[] = [
  'agent_xatosi',
  'odam_kerak',
  'crm_xatosi',
  'chek_tekshiruvi',
  'buzilgan_vada',
  'norozilik',
  'texnik_uzilish',
  'bajarilmagan_vada',
  'salbiy_javob',
  'takroriy',
  'xabar_tuzatilgan',
  'uzoq_suhbat',
];

export const TOIFA_NOMI: Record<Toifa, string> = {
  agent_xatosi: 'Agent xatosi',
  odam_kerak: 'Odam kerak',
  crm_xatosi: 'CRM xatosi',
  chek_tekshiruvi: 'Chek tekshiruvi',
  buzilgan_vada: "Buzilgan va'da",
  norozilik: 'Norozilik',
  texnik_uzilish: 'Texnik uzilish',
  bajarilmagan_vada: "Bajarilmagan va'da",
  salbiy_javob: 'Salbiy javob',
  takroriy: 'Takroriy',
  xabar_tuzatilgan: 'Xabar tuzatilgan',
  uzoq_suhbat: 'Uzoq suhbat',
};

/** Shuncha xabardan keyin suhbat "uzoq" hisoblanadi. */
export const UZOQ_SUHBAT_XABAR = 12;
/** Chiqishlar orasidagi tanaffus shundan katta bo'lsa — yangi chiqish. */
export const CHIQISH_TANAFFUSI_DAQ = 30;

export type OdamKerakSababi = 'agent_error' | 'broken_promise' | 'crm_xato' | 'chek_tekshiruvi';

export interface XomSuhbat {
  readonly conversationId: string;
  readonly clientName: string;
  readonly contractNo: string | null;
  readonly state: string;
  readonly needsHuman: boolean;
  readonly humanKind: string | null;
  readonly humanReason: string | null;
  /** Agentning ichki eslatmasi (`conversations.summary`). */
  readonly eslatma: string | null;
  /** `conversations.updated_at` shu kun ichidami. */
  readonly bugunYangilangan: boolean;
  readonly telegramStatus: string;
  /** Suhbatdagi JAMI xabar soni (bugungi emas). */
  readonly jamiXabar: number;
  readonly vadaBor: boolean;
  readonly tolovBor: boolean;
  /** Shu kunga va'da muddati qo'yilgan va u hali `pending`. */
  readonly bugunVadaMuddati: boolean;
  readonly bugunTolovKeldi: boolean;
  /** Shu kuni `status='failed'` xabar bo'lgan. */
  readonly xatoXabar: boolean;
  /** Shu kuni tahrirlangan yoki qaytarib olingan chiquvchi xabar bor. */
  readonly tahrirlangan: boolean;
  /** Shu kungi muvaffaqiyatli chiquvchi xabarlar vaqti (ISO). */
  readonly chiqishVaqtlari: readonly string[];
  /** Shu kungi kiruvchi xabarlar matni. */
  readonly mijozMatnlari: readonly string[];
  readonly oxirgiMijozGapi: string | null;
  readonly oxirgiHarakatAt: string;
  /** Asosiy shartnoma (`contractNo` bilan bir xil tanlov) obyekti — qatorda ko'rinadi. */
  readonly obyekt: string | null;
  /** Mijozning BARCHA tirik shartnomalari obyektlari — Obyekt filtri shu bilan ishlaydi. */
  readonly obyektlar: readonly string[];
  /** Suhbat qaysi Telegram akkaunt orqali ketyapti (`conversations.telegram_account_id`). */
  readonly akkauntId: string | null;
  /** Akkauntning `label` i — boshqa sahifalardagi kabi. */
  readonly akkauntNomi: string | null;
  /** Asosiy shartnomaning CRM `virtual_status` i (xom). */
  readonly virtualStatus: string | null;
}

export interface MuammoliSuhbat {
  readonly conversationId: string;
  readonly clientName: string;
  readonly contractNo: string | null;
  readonly toifalar: Toifa[];
  readonly eslatma: string | null;
  /** Agentning eskalatsiya sababi (`XomSuhbat.humanReason`) — qatorda ko'rinishi uchun. */
  readonly sabab: string | null;
  readonly oxirgiMijozGapi: string | null;
  readonly oxirgiHarakatAt: string;
  readonly obyekt: string | null;
  /**
   * Mijozning barcha obyektlari, asosiysi birinchi — Obyekt filtri shu
   * ro'yxat bo'yicha ishlaydi, qatorda ham hammasi ko'rinadi.
   */
  readonly obyektlar: string[];
  readonly akkauntId: string | null;
  readonly akkauntNomi: string | null;
  /** CRM holati — talabnoma sahifasidagi kabi kalit va CRM nomi. */
  readonly holat: HolatKorinishi | null;
}

/**
 * Kartalar va ro'yxat uchun filtr. `null`/bo'sh — filtr yo'q.
 *
 * Ma'nosi `PgDailyRepository.kunStat` dagi SQL bilan BIR XIL bo'lishi shart:
 *   • obyekt — mijozning biror tirik shartnomasi shu obyektda (trim);
 *   • akkaunt — suhbat shu Telegram akkaunt orqali.
 */
export interface KunFiltri {
  readonly obyekt?: string | null;
  readonly akkaunt?: string | null;
}

export function filtrgaMos(x: XomSuhbat, f: KunFiltri): boolean {
  if (f.obyekt && !x.obyektlar.includes(f.obyekt)) return false;
  if (f.akkaunt && x.akkauntId !== f.akkaunt) return false;
  return true;
}

export interface KunFiltrVariantlari {
  readonly obyektlar: string[];
  readonly akkauntlar: { id: string; nomi: string }[];
}

/** Filtr variantlari — shu kungi (filtrsiz) suhbatlardan. */
export function kunFiltrVariantlari(xom: readonly XomSuhbat[]): KunFiltrVariantlari {
  const obyektlar = new Set<string>();
  const akkauntlar = new Map<string, string>();
  for (const x of xom) {
    for (const o of x.obyektlar) if (o) obyektlar.add(o);
    if (x.akkauntId && !akkauntlar.has(x.akkauntId)) {
      akkauntlar.set(x.akkauntId, x.akkauntNomi ?? x.akkauntId);
    }
  }
  return {
    obyektlar: [...obyektlar].sort((a, b) => a.localeCompare(b)),
    akkauntlar: [...akkauntlar]
      .map(([id, nomi]) => ({ id, nomi }))
      .sort((a, b) => a.nomi.localeCompare(b.nomi) || a.id.localeCompare(b.id)),
  };
}

/**
 * Nechta marta "chiqish" bo'lgani.
 *
 * Agent bitta javobni bir necha xabarga bo'lib yuboradi — ular bitta
 * chiqish. Yangi chiqish 30 daqiqadan uzun tanaffusdan keyin boshlanadi.
 */
export function chiqishlarSoni(vaqtlar: readonly string[]): number {
  if (vaqtlar.length === 0) return 0;

  const tartibli = [...vaqtlar].map((v) => Date.parse(v)).sort((a, b) => a - b);
  const tanaffus = CHIQISH_TANAFFUSI_DAQ * 60 * 1000;

  let soni = 1;
  for (let i = 1; i < tartibli.length; i += 1) {
    if (tartibli[i]! - tartibli[i - 1]! > tanaffus) soni += 1;
  }
  return soni;
}

const ODAM_KERAK_TOIFASI: Record<OdamKerakSababi, Toifa> = {
  agent_error: 'agent_xatosi',
  crm_xato: 'crm_xatosi',
  chek_tekshiruvi: 'chek_tekshiruvi',
  broken_promise: 'buzilgan_vada',
};

export function suhbatToifalari(x: XomSuhbat): Toifa[] {
  const topildi = new Set<Toifa>();

  // "Odam kerak" qachon belgilangani bazada saqlanmaydi — `updated_at` ga
  // tayanamiz, aks holda kechagi eskalatsiya bugun ham ro'yxatda turardi.
  if (x.needsHuman && x.bugunYangilangan) {
    // `human_kind` turlarni sanab chiqmaydi (059-migratsiya) — eng ko'p
    // uchraydigan eskalatsiya aynan sababsiz (`agent`ning o'zi `escalate`
    // qiladi). Bunday suhbat ham ko'rinishi kerak, aks holda "odam kerak"
    // sonida eng katta qism yo'qolib qoladi.
    const toifa = x.humanKind ? ODAM_KERAK_TOIFASI[x.humanKind as OdamKerakSababi] : undefined;
    topildi.add(toifa ?? 'odam_kerak');
  }

  if (x.mijozMatnlari.some(norozilikBormi)) topildi.add('norozilik');
  if (x.xatoXabar) topildi.add('texnik_uzilish');
  if (x.bugunVadaMuddati && !x.bugunTolovKeldi) topildi.add('bajarilmagan_vada');

  const salbiyHolat = x.state === 'refused' || x.state === 'unreachable';
  if (x.bugunYangilangan && (salbiyHolat || x.telegramStatus === 'blocked')) {
    topildi.add('salbiy_javob');
  }

  if (chiqishlarSoni(x.chiqishVaqtlari) >= 2) topildi.add('takroriy');
  if (x.tahrirlangan) topildi.add('xabar_tuzatilgan');

  const yopilgan = x.state === 'closed' || x.state === 'agreed';
  if (x.jamiXabar >= UZOQ_SUHBAT_XABAR && !x.vadaBor && !x.tolovBor && !yopilgan) {
    topildi.add('uzoq_suhbat');
  }

  return TOIFA_TARTIBI.filter((t) => topildi.has(t));
}

function obyektlarTartibi(x: XomSuhbat): string[] {
  const qolgan = x.obyektlar.filter((o) => o !== x.obyekt);
  return x.obyekt && x.obyektlar.includes(x.obyekt) ? [x.obyekt, ...qolgan] : [...qolgan];
}

/** Eng jiddiy toifasi yuqorida; teng bo'lsa — oxirgi harakat yangisidan. */
export function muammoliSuhbatlar(xom: readonly XomSuhbat[]): MuammoliSuhbat[] {
  return xom
    .map((x) => ({
      conversationId: x.conversationId,
      clientName: x.clientName,
      contractNo: x.contractNo,
      toifalar: suhbatToifalari(x),
      eslatma: x.eslatma,
      sabab: x.humanReason,
      oxirgiMijozGapi: x.oxirgiMijozGapi,
      oxirgiHarakatAt: x.oxirgiHarakatAt,
      obyekt: x.obyekt,
      obyektlar: obyektlarTartibi(x),
      akkauntId: x.akkauntId,
      akkauntNomi: x.akkauntNomi,
      holat: holatKorinishi(x.virtualStatus),
    }))
    .filter((r) => r.toifalar.length > 0)
    .sort((a, b) => {
      const av = TOIFA_TARTIBI.indexOf(a.toifalar[0]!);
      const bv = TOIFA_TARTIBI.indexOf(b.toifalar[0]!);
      return av - bv || b.oxirgiHarakatAt.localeCompare(a.oxirgiHarakatAt);
    });
}

export interface XomKunStat {
  readonly yozilganMijoz: number;
  readonly javobBerganMijoz: number;
  readonly vadaSoni: number;
  readonly vadaSummasi: number;
  readonly tushumSummasi: number;
}

export interface KunRaqamlari extends XomKunStat {
  /** Foiz (butun son); hech kimga yozilmagan bo'lsa null. */
  readonly javobUlushi: number | null;
  /** `boshqa` — `human_kind` noma'lum yoki NULL bo'lgan sababsiz eskalatsiyalar. */
  readonly odamKerak: Record<OdamKerakSababi, number> & { boshqa: number };
  readonly takroriySoni: number;
}

export function kunRaqamlari(stat: XomKunStat, xom: readonly XomSuhbat[]): KunRaqamlari {
  const odamKerak: Record<OdamKerakSababi, number> & { boshqa: number } = {
    agent_error: 0,
    broken_promise: 0,
    crm_xato: 0,
    chek_tekshiruvi: 0,
    boshqa: 0,
  };

  let takroriySoni = 0;
  for (const x of xom) {
    if (x.needsHuman && x.bugunYangilangan) {
      if (x.humanKind && x.humanKind in ODAM_KERAK_TOIFASI) {
        odamKerak[x.humanKind as OdamKerakSababi] += 1;
      } else {
        odamKerak.boshqa += 1;
      }
    }
    if (chiqishlarSoni(x.chiqishVaqtlari) >= 2) takroriySoni += 1;
  }

  return {
    yozilganMijoz: stat.yozilganMijoz,
    javobBerganMijoz: stat.javobBerganMijoz,
    javobUlushi: stat.yozilganMijoz
      ? Math.round((stat.javobBerganMijoz / stat.yozilganMijoz) * 100)
      : null,
    vadaSoni: stat.vadaSoni,
    vadaSummasi: stat.vadaSummasi,
    tushumSummasi: stat.tushumSummasi,
    odamKerak,
    takroriySoni,
  };
}
