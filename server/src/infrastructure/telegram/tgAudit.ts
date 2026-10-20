import { errorCode } from '@/infrastructure/telegram/telegramErrors';
import { tgMetod, tgTana } from '@/infrastructure/telegram/tgSanitize';
import { TELEGRAM_FLAG } from '@/shared/logEntry';
import { childLogger } from '@/shared/logger';

/**
 * Telegram chaqiruvlarining audit izi.
 *
 * NEGA O'RAM, HAR METODDA QO'LDA YOZISH EMAS: gateway'da 15 dan ortiq
 * metod bor va har biri bir necha TL so'rov yuboradi, ustiga kutubxona
 * o'zi ham chaqiradi. Qo'lda yozilsa, ertaga qo'shilgan yangi metod
 * jimgina izsiz qolardi. Klientning o'zini o'rasak — chetlab o'tib
 * bo'lmaydi.
 *
 * HAR CHAQIRUV IKKI QATOR beradi: so'rov va javob, bitta `id` bilan
 * bog'langan. Sababi — javobsiz qolgan so'rov ko'rinishi kerak. Bitta
 * qatorda yozilsa, osilib qolgan yoki ulanish uzilib ketgan chaqiruv
 * jurnalda umuman iz qoldirmaydi, aynan o'sha holat esa eng ko'p
 * tekshiriladigani.
 */

const log = childLogger('tg-api');

export interface TgYozuvchi {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface TgAuditDeps {
  /** Sinovda almashtiriladi. */
  yozuvchi?: TgYozuvchi;
  /** Sinovda almashtiriladi. */
  vaqt?: () => number;
  /**
   * Har chaqiruv natijasini kuzatuvchi (`xatoKod` — muvaffaqiyatda `null`).
   * Sessiya izi shu orqali "sessiya o'ldi"ni sezadi: kutubxonaning ICHKI
   * chaqiruvlari (`updates.GetState`) `translateError` dan o'tmaydi,
   * o'ramdan esa o'tadi.
   */
  kuzat?: (metod: string, xatoKod: string | null) => void;
}

/**
 * So'rov va javobni bog'laydigan qisqa belgi.
 *
 * NEGA TASODIFIY EMAS, HISOBLAGICH: sinov natijasi takrorlanadigan
 * bo'lishi kerak. Aylanadi — jurnalda faqat qo'shni qatorlarni
 * bog'lashga xizmat qiladi, global noyoblik shart emas.
 */
let hisoblagich = 0;
function yangiId(): string {
  hisoblagich = (hisoblagich + 1) % 0xffff;
  return hisoblagich.toString(16).padStart(4, '0');
}

/** Jurnal yozuvi asosiy ishni HECH QACHON buzmaydi. */
function yoz(fn: () => void): void {
  try {
    fn();
  } catch {
    // Ataylab jim: bu yerda xato otilsa, jurnal uchun qo'shilgan kod
    // Telegram chaqiruvini yiqitgan bo'lardi.
  }
}

/**
 * Qiymatni xavfsiz hisoblaydi: hisoblashning o'zi yiqilsa, zaxira
 * qiymat qaytadi.
 *
 * NEGA KERAK: `yoz()` faqat YOZUVNI himoya qiladi. Yozuvga tayyorlanadigan
 * qiymatlar esa undan tashqarida hisoblanardi — ular yiqilsa, jurnal uchun
 * qo'shilgan kod Telegram chaqiruvini butunlay to'xtatib qo'yardi yoki asl
 * xatoni almashtirib yuborardi.
 */
function xavfsiz<T>(fn: () => T, zaxira: T): T {
  try {
    return fn();
  } catch {
    return zaxira;
  }
}

/**
 * "Status kod".
 *
 * MTProto'da HTTP kodi yo'q. RPC xatosida kutubxona `code` beradi
 * (400, 401, 420, 500), lekin u `number | undefined`: ulanish uzilishi,
 * timeout va proksi nosozligi RPC xatosi emas va kodsiz keladi.
 */
function rpcKod(err: unknown): number | 'XATO' {
  const kod = (err as { code?: unknown } | null)?.code;
  return typeof kod === 'number' ? kod : 'XATO';
}

/**
 * Xato sababi. Avval Telegramning o'z belgisi (`FLOOD_WAIT_35`),
 * bo'lmasa xato matni. `errorCode` aynan shuning uchun bor —
 * kutubxona belgini `errorMessage` da beradi, `message` da esa
 * inglizcha matn turadi (telegramErrors.ts izohi).
 */
function xatoSababi(err: unknown): string {
  const kod = errorCode(err);
  if (kod) return kod;
  return err instanceof Error ? err.message : String(err ?? 'xato');
}

/**
 * Xato javobining tanasi.
 *
 * NEGA ALOHIDA FUNKSIYA, TO'G'RIDAN-TO'G'RI `tgTana(err)` EMAS:
 * `message` HAR QANDAY xato shaklida SANAB BO'LINMAYDI (non-enumerable),
 * shuning uchun `Object.entries` uni hech qachon ko'rmaydi — aynan shu
 * sababli `matn` sifatida qo'lda ko'chiriladi. `name` esa aralash holat:
 * teleproto'ning RPC xato klasslari (`FloodWaitError`, `UnauthorizedError`
 * va h.k.) konstruktorida `this.name = this.constructor.name` deb
 * o'zlari sanaladigan qilib qo'yishadi, ya'ni spread ularni allaqachon
 * olib keladi — lekin oddiy `new Error()` bunday qilmaydi. Shu farq
 * tufayli `name` ham `nom` sifatida qo'lda ko'chiriladi: qaysi xato
 * kelishidan qat'i nazar maydon doim mavjud bo'lsin uchun.
 *
 * `stack` ataylab olinmaydi: u ham SANAB BO'LINMAYDI, ya'ni spread uni
 * baribir olib kelolmasdi; qolaversa qatorni bir necha barobar
 * uzaytiradi va Telegram nima javob bergani haqida hech narsa aytmaydi.
 *
 * Yig'ilgan obyekt odatdagi tozalagichdan o'tkaziladi, ya'ni kesish va
 * yashirish qoidalari xato tanasiga ham xuddi javob tanasidek qo'llanadi.
 */
function xatoTanasi(err: unknown): unknown {
  if (!(err instanceof Error)) return tgTana(err);
  return tgTana({ nom: err.name, matn: err.message, ...err });
}

type Chaqiruv = (...args: unknown[]) => Promise<unknown>;

/**
 * Metodni o'raydi. `sorovIndeks` — so'rov obyekti nechanchi argumentda
 * turishi: `invoke(request, dcId)` da 0, `savePart(dcId, request, signal)`
 * da 1. Chalkashsa jurnalga metod nomi o'rniga DC raqami tushardi.
 */
function orab(asl: Chaqiruv, akkaunt: string, sorovIndeks: number, deps: TgAuditDeps): Chaqiruv {
  const yozuvchi = deps.yozuvchi ?? log;
  const vaqt = deps.vaqt ?? Date.now;

  return async function oralgan(...args: unknown[]): Promise<unknown> {
    const request = args[sorovIndeks];
    const id = yangiId();
    const metod = xavfsiz(() => tgMetod(request), "noma'lum");
    const boshlandi = vaqt();

    yoz(() =>
      yozuvchi.info(
        { flag: TELEGRAM_FLAG, akkaunt, yonalish: 'sorov', id, metod, body: tgTana(request) },
        `→ ${metod}`,
      ),
    );

    try {
      const natija = await asl(...args);
      const ms = vaqt() - boshlandi;
      yoz(() => deps.kuzat?.(metod, null));
      yoz(() =>
        yozuvchi.info(
          { flag: TELEGRAM_FLAG, akkaunt, yonalish: 'javob', id, metod, kod: 'OK', msMuddat: ms, body: tgTana(natija) },
          `← ${metod} OK ${ms}ms`,
        ),
      );
      return natija;
    } catch (err) {
      const ms = vaqt() - boshlandi;
      const kod = xavfsiz(() => rpcKod(err), 'XATO' as number | 'XATO');
      const xatoKod = xavfsiz(() => xatoSababi(err), 'xato');
      yoz(() => deps.kuzat?.(metod, xatoKod));
      yoz(() =>
        yozuvchi.error(
          {
            flag: TELEGRAM_FLAG,
            akkaunt,
            yonalish: 'javob',
            id,
            metod,
            kod,
            xatoKod,
            msMuddat: ms,
            body: xavfsiz(() => xatoTanasi(err), null),
          },
          `← ${metod} ${kod} ${xatoKod} ${ms}ms`,
        ),
      );
      // Xato O'ZGARTIRILMASDAN qayta otiladi: yuqoridagi kod FLOOD_WAIT,
      // PEER_ID_INVALID va 2FA holatlarini aynan shu obyektdan taniydi.
      throw err;
    }
  };
}

/** Berilgan obyektdagi metodni o'ram bilan almashtiradi. */
function almashtir(
  egasi: Record<string, unknown> | undefined,
  nom: string,
  akkaunt: string,
  sorovIndeks: number,
  deps: TgAuditDeps,
): void {
  if (!egasi || typeof egasi[nom] !== 'function') return;
  const asl = (egasi[nom] as Chaqiruv).bind(egasi);
  egasi[nom] = orab(asl, akkaunt, sorovIndeks, deps);
}

/**
 * Klient metodlarini o'raydi. `client.connect()` dan OLDIN chaqirilsin —
 * shunda ulanish paytidagi chaqiruvlar ham izga tushadi.
 *
 * `_media` — kutubxonaning ICHKI a'zosi: fayl bo'laklari (`SaveFilePart`)
 * alohida yuboruvchidan ketadi va `invoke` dan o'tmaydi. Topilmasa
 * jimgina o'tkazib yuboriladi: kutubxona yangilanib nom o'zgarsa iz
 * kambag'allashadi, ilova esa yiqilmaydi.
 */
export function tgAuditOrnat(client: unknown, akkaunt: string, deps: TgAuditDeps = {}): void {
  const c = client as Record<string, unknown>;

  almashtir(c, 'invoke', akkaunt, 0, deps);
  almashtir(c, 'invokeWithSender', akkaunt, 0, deps);
  almashtir(c._media as Record<string, unknown> | undefined, 'savePart', akkaunt, 1, deps);
}

/**
 * Telegramdan so'ralmasdan kelgan hodisa (yangi xabar, o'qildi belgisi).
 *
 * So'rovga javob emas, shuning uchun `id` bilan bog'lanmaydi va
 * davomiyligi o'lchanmaydi.
 */
export function tgHodisaYoz(
  akkaunt: string,
  metod: string,
  body: unknown,
  deps: TgAuditDeps = {},
): void {
  const yozuvchi = deps.yozuvchi ?? log;
  yoz(() =>
    yozuvchi.info(
      { flag: TELEGRAM_FLAG, akkaunt, yonalish: 'hodisa', metod, body: tgTana(body) },
      `← hodisa ${metod}`,
    ),
  );
}
