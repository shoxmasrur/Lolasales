import { AsyncLocalStorage } from 'node:async_hooks';
import type { AppLogItem, IAppLogRepository } from '@/domain/repositories/IAppLogRepository';
import type { LogEntry } from '@/shared/logEntry';
import { logEntryToRow } from '@/shared/logEntry';

/**
 * `repo.append` ishlab turgan butun asinxron amal davomida faol bo'ladi.
 *
 * NEGA ODDIY BAYROQ YETMAYDI: rozetka "otib yubor va unut" ishlaydi —
 * sinxron qism darhol qaytadi. `pool.ts`ning sekin so'rov ogohlantirishi
 * `query()`ning `finally`ida, ya'ni `await`dan KEYIN, promise davomida
 * chaqiriladi — o'sha payt oddiy bayroq allaqachon tozalangan bo'lardi.
 * `AsyncLocalStorage` esa Node'da promise zanjiri bo'ylab (shu jumladan
 * `await`lardan keyin ham) saqlanib qoladi, shu bilan birga ALOQASI YO'Q
 * boshqa jurnal qatorlarini (masalan, boshqa so'rov paytida kelgan `warn`)
 * to'sib qo'ymaydi — ular boshqa (bo'sh) kontekstda ishlaydi.
 *
 * CHEKKA HOLAT — ENDI TUZATILGAN: kontekst faqat promise davomiga emas,
 * shu davrda YARATILGAN resurslarga (masalan `pg` mijozining socket'i)
 * ham meros bo'lib o'tadi. Shuning uchun `pool.ts`dagi
 * `pool.on('error', ...)` — modul yuklanishida, kontekstdan TASHQARIDA
 * ro'yxatdan o'tgan ishlovchi — agar shu socket `append` davomida
 * yaratilgan bo'lsa, baribir shu kontekst ICHIDA ishga tushishi mumkin.
 * Bu rekursiya xavfi EMAS (baza bilan aloqa allaqachon uzilgan holatda
 * sodir bo'ladi), lekin himoya buni "append ichidan chaqirildi" deb
 * xato talqin qilib, xatoni `app_log`ga yozmay tashlab yuborardi (faqat
 * `stdout`/journald'da qolardi, operator dashboardda topolmasdi).
 * Pastdagi `alsKontekstidanTashqarida` shu holatlar uchun chiqish yo'li —
 * `pool.ts` uni `pool.on('error', ...)` atrofida ishlatadi.
 */
const ichkarida = new AsyncLocalStorage<true>();

/**
 * Yuqoridagi CHEKKA HOLAT uchun chiqish yo'li: `pool.on('error', ...)`
 * kabi modul yuklanishida ro'yxatdan o'tgan, lekin `append` davomida
 * YARATILGAN resursga (masalan socket) tegishli ishlovchilar uchun.
 *
 * Agar ishlovchi `ichkarida` konteksti ICHIDA ishga tushsa (chunki uning
 * socket'i o'sha kontekstda tug'ilgan), ichidagi `log.error` chaqiruvi
 * rekursiya himoyasiga tushib, `app_log`ga umuman yozilmay qoladi — xato
 * faqat `stdout`da qoladi, dashboardda ko'rinmaydi. `AsyncLocalStorage.exit`
 * callbackni shu konteksdan VAQTINCHA chiqarib bajaradi, shuning uchun
 * ichkaridagi jurnal chaqiruvi kontekstni bo'sh deb ko'radi va odatdagidek
 * bazaga yoziladi.
 */
export function alsKontekstidanTashqarida<T>(fn: () => T): T {
  return ichkarida.exit(fn);
}

/**
 * Jurnal qatorini bazaga yozadigan rozetka.
 *
 * DIQQAT — bu funksiya ichida HECH QACHON `log.*` chaqirilmaydi.
 * Bazaga yozish yiqilganda uni pino orqali yozsak, u yana shu
 * rozetkaga qaytadi, yana yiqiladi va ilova cheksiz halqada o'ladi.
 * Yagona chiqish yo'li — `process.stderr`.
 *
 * REKURSIYA IKKI YO'LDAN KELISHI MUMKIN, IKKALASI HAM YOPILGAN:
 *  1. `repo.append` ichida (masalan `pool.ts`ning sekin so'rov
 *     ogohlantirishi) yana pino chaqirilib, u yana shu rozetkaga uradi —
 *     `ichkarida` konteksti buni to'xtatadi.
 *  2. `onWritten` (hodisa shinasiga yuboradi) o'zi yiqilib, shinaning
 *     xato ishlovchisi buni `log.error` bilan yozsa — bu ham xuddi shu
 *     `ichkarida` konteksti ichida turgani uchun to'xtaydi.
 */
export function createDbLogSink(
  repo: IAppLogRepository,
  onWritten: (item: AppLogItem) => void,
): (entry: LogEntry) => void {
  // Bir marta ogohlantiramiz va qayta tiklamaymiz: baza uzilganda har
  // qator uchun bir xil matn chiqarishning ma'nosi yo'q.
  let ogohlantirilgan = false;

  const birMartaYoz = (xabar: string, err: unknown): void => {
    if (ogohlantirilgan) return;
    ogohlantirilgan = true;
    process.stderr.write(`${xabar}: ${String(err)}\n`);
  };

  return (entry: LogEntry): void => {
    // Qayta kirish: shu chaqiruv `repo.append`ning o'zi ichidan (to'g'ridan
    // yoki bilvosita) kelgan — tashlab yuboramiz.
    if (ichkarida.getStore()) return;

    const row = logEntryToRow(entry);
    if (!row) return;

    try {
      ichkarida.run(true, () => {
        // Kutilmaydi: jurnal asosiy ishni sekinlashtirmasligi kerak.
        void repo
          .append(row)
          .then((item) => {
            try {
              onWritten(item);
            } catch (err) {
              // Baza yozuvi muvaffaqiyatli bo'ldi — xato hodisa
              // ishlovchisida, shuni aytamiz, "baza"ni ayblamaymiz.
              birMartaYoz("Jurnal hodisasini yetkazib bo'lmadi", err);
            }
          })
          .catch((err: unknown) => {
            birMartaYoz("Jurnalni bazaga yozib bo'lmadi", err);
          });
      });
    } catch (err) {
      // `repo.append` (yoki mock) sinxron uloqtirishi ham mumkin — bu
      // holat ham chaqiruvchiga (pino oqimiga) hech qachon otilmasligi kerak.
      birMartaYoz("Jurnalni bazaga yozib bo'lmadi", err);
    }
  };
}
