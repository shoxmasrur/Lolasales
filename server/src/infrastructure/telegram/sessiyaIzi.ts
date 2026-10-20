import { TELEGRAM_FLAG } from '@/shared/logEntry';
import { childLogger } from '@/shared/logger';

/**
 * Telegram sessiyasining hayot yo'li: qachon ochildi, kim kirdi, Telegram
 * uni qanday ko'radi va — eng muhimi — qachon, qaysi so'rovda, nima
 * sababdan o'ldi.
 *
 * NEGA ALOHIDA MODUL, `tg-api` AUDITI YETARLI EMAS: audit har bir so'rovni
 * yozadi, lekin "sessiya o'ldi" degan XULOSANI chiqarmaydi. 2026-09-24 dan
 * beri yangi ulangan akkauntlar 1–6 daqiqada `AUTH_KEY_UNREGISTERED` bilan
 * chiqib ketyapti va har safar sababni yuzlab qator ichidan qo'lda yig'ishga
 * to'g'ri keldi: sessiya necha soniya yashadi, oxirgi muvaffaqiyatli so'rov
 * qaysi edi, qaysi proksi/IP dan ketdi, o'sha payt deploy bo'lganmi. Bu
 * modul shularni BITTA qatorga — "o'lim hisoboti"ga yig'adi.
 *
 * MTProto'da HTTP'dagi "IP va User-Agent" yo'q. Ularning o'rnini bosadigani:
 *   • chiqish manzili — proksi (`host:port`) yoki to'g'ridan-to'g'ri server;
 *   • "user agent" — `initConnection` dagi `deviceModel` / `systemVersion` /
 *     `appVersion` / `langCode` va `api_id`;
 *   • Telegram BIZNI qanday ko'rayotgani — `account.getAuthorizations`
 *     javobi: IP, mamlakat, qurilma nomi va `unconfirmed` belgisi (egasi
 *     "bu men emas" deb bosishi mumkin bo'lgan holat).
 * Uchalasi ham shu yerda yoziladi.
 *
 * Holat XOTIRADA: jarayon qayta ishga tushsa nolga tushadi. Shuning uchun
 * har hisobotda `jarayonYoshiSek` bor — kichik son "bu ulanish deploydan
 * keyingi birinchi urinish" degani.
 */

const log = childLogger('tg-sessiya');

export interface SessiyaYozuvchi {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface SessiyaIziDeps {
  /** Sinovda almashtiriladi. */
  yozuvchi?: SessiyaYozuvchi;
  /** Sinovda almashtiriladi. */
  vaqt?: () => number;
  /** Sinovda almashtiriladi. */
  jarayonYoshiSek?: () => number;
}

/** Ulanish nima sababdan ochilgani. */
export type OchilishSababi = 'bootstrap' | 'reconnect' | 'login-kod' | 'login-qr';

/** `initConnection` da Telegramga aytiladigan "kim ekanimiz". */
export interface KlientImzosi {
  deviceModel: string | null;
  systemVersion: string | null;
  appVersion: string | null;
  langCode: string | null;
  systemLangCode: string | null;
}

export interface OchilishMalumoti {
  sabab: OchilishSababi;
  /** Bo'sh sessiya bilan ochildi — hali hech kim kirmagan (login boshlanishi). */
  yangi: boolean;
  apiId: number;
  imzo: KlientImzosi;
  /** `host:port` yoki `null` — to'g'ridan-to'g'ri server IP'sidan. */
  proksi: string | null;
  dc: number | null;
  dcManzil: string | null;
  /** Auth kalitining qisqa izi — kalit almashganini ko'rish uchun. */
  kalitIzi: string | null;
}

/** Telegramning "Qurilmalar" ro'yxatidagi bitta sessiya. */
export interface TelegramSessiyasi {
  /** Bu — BIZNING ulanishimiz. */
  joriy: boolean;
  rasmiyIlova: boolean;
  /** Egasi hali tasdiqlamagan — "bu men emas" bosilsa sessiya o'ladi. */
  tasdiqlanmagan: boolean;
  parolKutilmoqda: boolean;
  qurilma: string;
  platforma: string;
  tizim: string;
  apiId: number;
  ilova: string;
  yaratilgan: string | null;
  faol: string | null;
  ip: string;
  mamlakat: string;
  hudud: string;
}

/** Panelda login/logout tugmasini kim bosgani. */
export interface HttpManbasi {
  foydalanuvchi: string | null;
  ip: string | null;
  /** nginx ortida `ip` har doim 127.0.0.1 — haqiqiysi shu sarlavhada. */
  forwardedFor: string | null;
  userAgent: string | null;
}

interface Holat {
  ochilgan: number;
  ochilish: OchilishMalumoti;
  /** Sessiyada foydalanuvchi bor (eski sessiya yoki login tugagan). */
  kirgan: boolean;
  /** Shu jarayonda login qilingan bo'lsa — vaqti va usuli. */
  kirish: { vaqt: number; usul: string } | null;
  sorovlar: number;
  xatolar: number;
  oxirgiOk: { metod: string; vaqt: number } | null;
  korinish: { vaqt: number; joriy: TelegramSessiyasi | null; boshqalar: TelegramSessiyasi[] } | null;
  xizmatHodisasi: { vaqt: number; nom: string; body: unknown } | null;
  /** O'lim bir marta e'lon qilinadi — keyingi har so'rov ham xato beradi. */
  oldi: boolean;
  /** `ochilmoqda` qo'ygan, `ochildi` hali tasdiqlamagan. */
  ochilmoqda: boolean;
}

/**
 * Sessiya o'lganini bildiradigan kodlar va ularning ma'nosi.
 *
 * `USER_DEACTIVATED` aniq tenglik bilan solishtiriladi: `INPUT_USER_DEACTIVATED`
 * MIJOZNING akkaunti o'chirilganini bildiradi, biznikini emas
 * (telegramErrors.ts dagi tuzoq).
 */
const OLIM_KODLARI: Record<string, string> = {
  AUTH_KEY_UNREGISTERED:
    'Sessiya Telegram SERVERIDA bekor qilingan. Biz chiqarmaganmiz: egasi "Qurilmalar"da tugatgan, ' +
    'yangi kirish ogohlantirishida "bu men emas" bosgan yoki Telegram himoyasi uzgan.',
  AUTH_KEY_DUPLICATED:
    'Bitta sessiya bir vaqtda IKKI joydan ishlatilgan (deploy paytida eski jarayon hali ulangan, ' +
    'parallel CLI/eksport yoki IP almashgan). Telegram bunday kalitni butunlay bekor qiladi.',
  AUTH_KEY_INVALID: 'Auth kaliti yaroqsiz — saqlangan sessiya buzilgan yoki boshqa DC niki.',
  AUTH_KEY_PERM_EMPTY: 'Doimiy auth kaliti yo\'q — sessiya oxirigacha yaratilmagan.',
  SESSION_REVOKED: 'Egasi barcha boshqa seanslarni tugatgan yoki 2FA parolini o\'zgartirgan.',
  SESSION_EXPIRED: 'Sessiya muddati tugagan (uzoq vaqt ishlatilmagan).',
  USER_DEACTIVATED: 'Akkaunt o\'chirilgan.',
  USER_DEACTIVATED_BAN: 'Akkaunt Telegram tomonidan bloklangan.',
};

/** Xato matnidan o'lim kodini ajratadi, bo'lmasa `null`. */
/** O'lim kodining odam o'qiydigan izohi (ogohlantirish xabari uchun). */
export function olimIzohi(kod: string): string {
  return Object.prototype.hasOwnProperty.call(OLIM_KODLARI, kod) ? OLIM_KODLARI[kod]! : kod;
}

export function olimKodi(xatoKod: string | null | undefined): string | null {
  if (!xatoKod) return null;
  const kod = xatoKod.trim();
  return Object.prototype.hasOwnProperty.call(OLIM_KODLARI, kod) ? kod : null;
}

function sek(ms: number): number {
  return Math.round(ms / 100) / 10;
}

export class SessiyaIzi {
  private readonly holatlar = new Map<string, Holat>();
  private readonly oxirgiHttp = new Map<string, { vaqt: number; amal: string; kim: HttpManbasi }>();
  private readonly yozuvchi: SessiyaYozuvchi;
  private readonly vaqt: () => number;
  private readonly jarayonYoshi: () => number;

  constructor(deps: SessiyaIziDeps = {}) {
    this.yozuvchi = deps.yozuvchi ?? log;
    this.vaqt = deps.vaqt ?? Date.now;
    this.jarayonYoshi = deps.jarayonYoshiSek ?? (() => Math.round(process.uptime()));
  }

  /**
   * Jurnal yozuvi asosiy ishni HECH QACHON buzmaydi — bu modul har bir
   * Telegram so'rovining yo'lida turadi (tgAudit.ts dagi qoida).
   */
  private xavfsiz(fn: () => void): void {
    try {
      fn();
    } catch {
      // Ataylab jim.
    }
  }

  private yoz(
    daraja: 'info' | 'warn',
    akkaunt: string | null,
    hodisa: string,
    obj: Record<string, unknown>,
    msg: string,
  ): void {
    this.yozuvchi[daraja](
      { flag: TELEGRAM_FLAG, ...(akkaunt ? { akkaunt } : {}), oqim: 'sessiya', hodisa, ...obj },
      `SESSIYA ${msg}`,
    );
  }

  /** Jarayon boshlandi yoki to'xtayapti — deploy bilan o'limni bog'lash uchun. */
  jarayon(hodisa: 'boshlandi' | 'toxtayapti', obj: Record<string, unknown> = {}): void {
    this.xavfsiz(() =>
      this.yoz('info', null, `jarayon-${hodisa}`, { pid: process.pid, jarayonYoshiSek: this.jarayonYoshi(), ...obj },
        `jarayon ${hodisa}`),
    );
  }

  private yangiHolat(m: OchilishMalumoti, ochilmoqda: boolean): Holat {
    return {
      ochilgan: this.vaqt(),
      ochilish: m,
      kirgan: !m.yangi,
      kirish: null,
      sorovlar: 0,
      xatolar: 0,
      oxirgiOk: null,
      korinish: null,
      xizmatHodisasi: null,
      oldi: false,
      ochilmoqda,
    };
  }

  /**
   * Ulanish BOSHLANYAPTI — jurnalga yozmaydi, faqat hisobni ochadi.
   * `connect()` ning o'zi ham so'rov yuboradi: o'lik sessiya shu yerdayoq
   * xato bersa, hisobot yo'qolmasligi kerak.
   */
  ochilmoqda(akkaunt: string, m: OchilishMalumoti): void {
    this.xavfsiz(() => this.holatlar.set(akkaunt, this.yangiHolat(m, true)));
  }

  /** MTProto ulanishi ochildi. DC va kalit shu paytdagina aniq. */
  ochildi(akkaunt: string, m: OchilishMalumoti): void {
    this.xavfsiz(() => {
      const eski = this.holatlar.get(akkaunt);
      if (eski?.ochilmoqda) {
        // Hisoblagichlar saqlanadi — ulanish paytidagi so'rovlar ham sanalgan.
        eski.ochilish = m;
        eski.ochilmoqda = false;
      } else {
        this.holatlar.set(akkaunt, this.yangiHolat(m, false));
      }
      this.yoz('info', akkaunt, 'ochildi', { ...m, jarayonYoshiSek: this.jarayonYoshi() },
        `ochildi (${m.sabab}) ${m.proksi ? `proksi ${m.proksi}` : 'to\'g\'ridan-to\'g\'ri'} DC${m.dc ?? '?'}`);
    });
  }

  /** Login tugadi — sessiyada endi foydalanuvchi bor. */
  kirdi(akkaunt: string, usul: string, obj: Record<string, unknown> = {}): void {
    this.xavfsiz(() => {
      const h = this.holatlar.get(akkaunt);
      if (h) {
        h.kirgan = true;
        h.oldi = false;
        h.kirish = { vaqt: this.vaqt(), usul };
      }
      this.yoz('info', akkaunt, 'kirdi', { usul, ...obj, http: this.httpQisqa(akkaunt) }, `login tugadi (${usul})`);
    });
  }

  /**
   * Har bir Telegram so'rovining natijasi (`tgAudit` o'rami chaqiradi).
   * `xatoKod` — muvaffaqiyatda `null`.
   *
   * Sessiya AYNAN SHU so'rovda o'lgani aniqlansa — o'lim kodini qaytaradi
   * (ulanish bo'yicha bir marta), aks holda `null`. Chaqiruvchi shu
   * qiymatga qarab administratorni ogohlantiradi.
   */
  sorov(akkaunt: string, metod: string, xatoKod: string | null): string | null {
    let natija: string | null = null;
    this.xavfsiz(() => {
      const h = this.holatlar.get(akkaunt);
      if (!h) return;
      h.sorovlar += 1;
      if (xatoKod === null) {
        h.oxirgiOk = { metod, vaqt: this.vaqt() };
        return;
      }
      h.xatolar += 1;
      const kod = olimKodi(xatoKod);
      // Hali hech kim kirmagan ulanishda `AUTH_KEY_UNREGISTERED` — odatiy
      // javob (login tugamagan), o'lim emas.
      if (!kod || !h.kirgan || h.oldi) return;
      h.oldi = true;
      // Hisobotdan OLDIN: yozuv yiqilsa ham ogohlantirish ketishi kerak.
      natija = kod;
      this.olimHisoboti(akkaunt, h, kod, metod);
    });
    return natija;
  }

  private olimHisoboti(akkaunt: string, h: Holat, kod: string, metod: string): void {
    const hozir = this.vaqt();
    const obj = {
      xatoKod: kod,
      izoh: OLIM_KODLARI[kod],
      metod,
      // Shu jarayonda login qilingan bo'lsa — sessiya necha soniya yashagani.
      sessiyaYoshiSek: h.kirish ? sek(hozir - h.kirish.vaqt) : null,
      kirishUsuli: h.kirish?.usul ?? null,
      ulanishYoshiSek: sek(hozir - h.ochilgan),
      // Kichik son — deploy/restartdan keyingi birinchi ulanish.
      jarayonYoshiSek: this.jarayonYoshi(),
      sorovlarSoni: h.sorovlar,
      xatolarSoni: h.xatolar,
      oxirgiOk: h.oxirgiOk
        ? { metod: h.oxirgiOk.metod, sekOldin: sek(hozir - h.oxirgiOk.vaqt) }
        : null,
      ochilish: h.ochilish,
      // Telegram bizni oxirgi marta qanday ko'rgani: IP, mamlakat, tasdiqlanganmi.
      telegramKorinishi: h.korinish
        ? { sekOldin: sek(hozir - h.korinish.vaqt), joriy: h.korinish.joriy, boshqalar: h.korinish.boshqalar }
        : null,
      oxirgiXizmatHodisasi: h.xizmatHodisasi
        ? { sekOldin: sek(hozir - h.xizmatHodisasi.vaqt), nom: h.xizmatHodisasi.nom, body: h.xizmatHodisasi.body }
        : null,
      http: this.httpQisqa(akkaunt),
    };
    const yosh = obj.sessiyaYoshiSek !== null ? `, login ${obj.sessiyaYoshiSek}s oldin` : '';
    this.yoz('warn', akkaunt, 'oldi', obj,
      `O'LDI ${kod} (${metod}) — ulanish ${obj.ulanishYoshiSek}s${yosh}, jarayon ${obj.jarayonYoshiSek}s`);
  }

  /**
   * Biz O'ZIMIZ yopdik (operator "Chiqish" bosdi, begona QR, reconnect).
   * `logout` rost bo'lsa Telegramga `auth.LogOut` ham ketadi — bu holatda
   * keyingi `AUTH_KEY_UNREGISTERED` o'lim emas, kutilgan natija.
   */
  ozimizYopdik(akkaunt: string, sabab: string, logout: boolean): void {
    this.xavfsiz(() => {
      const h = this.holatlar.get(akkaunt);
      this.holatlar.delete(akkaunt);
      // Ochilmagan ulanishni yopish — yozishga arzimaydi (shutdown har akkauntni aylanadi).
      if (!h && !logout) return;
      this.yoz('info', akkaunt, logout ? 'ozimiz-logout' : 'yopildi', {
        sabab,
        ulanishYoshiSek: h ? sek(this.vaqt() - h.ochilgan) : null,
        sorovlarSoni: h?.sorovlar ?? 0,
        http: this.httpQisqa(akkaunt),
      }, logout ? `BIZ chiqardik (auth.LogOut): ${sabab}` : `ulanish yopildi: ${sabab}`);
    });
  }

  /** `account.getAuthorizations` javobi — Telegram tomonidagi ro'yxat. */
  telegramKorinishi(akkaunt: string, sessiyalar: TelegramSessiyasi[]): void {
    this.xavfsiz(() => {
      const joriy = sessiyalar.find((s) => s.joriy) ?? null;
      const boshqalar = sessiyalar.filter((s) => !s.joriy);
      const h = this.holatlar.get(akkaunt);
      if (h) h.korinish = { vaqt: this.vaqt(), joriy, boshqalar };
      const daraja = joriy?.tasdiqlanmagan ? 'warn' : 'info';
      this.yoz(daraja, akkaunt, 'telegram-korinishi', { joriy, boshqalar, jami: sessiyalar.length },
        joriy
          ? `Telegram ko'rishi: IP ${joriy.ip} (${joriy.mamlakat}), "${joriy.qurilma}" ${joriy.ilova}` +
            `${joriy.tasdiqlanmagan ? ' — TASDIQLANMAGAN' : ''}, boshqa qurilmalar: ${boshqalar.length}`
          : `Telegram ro'yxatida bizning sessiya topilmadi (jami ${sessiyalar.length})`);
    });
  }

  /** Telegramning o'zi yuborgan xavfsizlik hodisasi (yangi kirish, xizmat xabari). */
  xizmatHodisasi(akkaunt: string, nom: string, body: unknown): void {
    this.xavfsiz(() => {
      const h = this.holatlar.get(akkaunt);
      if (h) h.xizmatHodisasi = { vaqt: this.vaqt(), nom, body };
      this.yoz('warn', akkaunt, 'xizmat-hodisasi', { nom, body }, `xizmat hodisasi ${nom}`);
    });
  }

  /** Panelda login/logout amali — kim, qaysi IP va brauzerdan. */
  http(akkaunt: string, amal: string, kim: HttpManbasi): void {
    this.xavfsiz(() => {
      this.oxirgiHttp.set(akkaunt, { vaqt: this.vaqt(), amal, kim });
      this.yoz('info', akkaunt, 'http', { amal, ...kim },
        `panel: ${amal} — ${kim.foydalanuvchi ?? '?'} ${kim.forwardedFor ?? kim.ip ?? '?'}`);
    });
  }

  private httpQisqa(akkaunt: string): Record<string, unknown> | null {
    const h = this.oxirgiHttp.get(akkaunt);
    if (!h) return null;
    return { amal: h.amal, sekOldin: sek(this.vaqt() - h.vaqt), ...h.kim };
  }
}

/** Butun jarayon uchun yagona nusxa: gateway ham, HTTP marshrutlari ham shunga yozadi. */
export const sessiyaIzi = new SessiyaIzi();
