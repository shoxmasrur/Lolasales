import { alsKontekstidanTashqarida, createDbLogSink } from '@/infrastructure/logging/dbLogSink';
import type { AppLogItem, IAppLogRepository } from '@/domain/repositories/IAppLogRepository';
import type { LogEntry } from '@/shared/logEntry';

/**
 * Qo'lda ishga tushiriladi: npm run test:db-log-sink
 *
 * ENG MUHIM XOSSA — REKURSIYA YO'QLIGI: bazaga yozish yiqilsa va biz
 * buni `log.error` bilan yozsak, u yana bazaga urinadi, yana yiqiladi
 * va ilova cheksiz halqada o'ladi. Shuning uchun rozetka ichidagi xato
 * hech qachon pino orqali ketmaydi va faqat bir marta chiqariladi.
 *
 * Rekursiya ikki alohida yo'ldan kelishi mumkin (5- va 6-testlar):
 * `repo.append`ning o'zi ichidan (masalan `pool.ts`ning sekin so'rov
 * ogohlantirishi) va `onWritten` orqali (hodisa shinasi xato
 * ishlovchisi). Ikkalasi ham shu faylda alohida tekshiriladi —
 * himoyaning faqat bittasini yopib, ikkinchisini unutish oson.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  if (actual === kutilgan) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${String(actual)}  (kutilgan: ${String(kutilgan)})`);
  }
}

/** `process.stderr.write` ni vaqtincha ushlab turadi. */
function stderrniUshla(): { chiqish: string[]; qaytar: () => void } {
  const chiqish: string[] = [];
  const asl = process.stderr.write.bind(process.stderr);
  (process.stderr as unknown as { write: unknown }).write = (chunk: unknown): boolean => {
    chiqish.push(String(chunk));
    return true;
  };
  return { chiqish, qaytar: () => { (process.stderr as unknown as { write: unknown }).write = asl; } };
}

const ITEM = { id: '1', at: new Date(), level: 'error', msg: 'x' } as unknown as AppLogItem;
const ASOS = { time: 1, pid: 1, hostname: 'h' };

// ── 1. warn/error bazaga yoziladi va hodisa chiqadi ────────────────────
{
  let yozildi = 0;
  let hodisa = 0;
  const repo = { append: async () => { yozildi += 1; return ITEM; } } as unknown as IAppLogRepository;
  const sink = createDbLogSink(repo, () => { hodisa += 1; });

  sink({ ...ASOS, level: 50, msg: 'Xabar yuborilmadi' });
  await new Promise((r) => setTimeout(r, 0));

  eq('bazaga yozildi', yozildi, 1);
  eq('socket hodisasi chiqdi', hodisa, 1);
}

// ── 2. info bazaga TUSHMAYDI ───────────────────────────────────────────
{
  let yozildi = 0;
  const repo = { append: async () => { yozildi += 1; return ITEM; } } as unknown as IAppLogRepository;
  const sink = createDbLogSink(repo, () => undefined);

  sink({ ...ASOS, level: 30, msg: 'Xabar yuborildi' });
  await new Promise((r) => setTimeout(r, 0));

  eq('info tashlandi', yozildi, 0);
}

// ── 3. Baza sinxron uloqtirsa — xato TARQAMAYDI ────────────────────────
// `async` mock faqat rad etilgan promise qaytara oladi — `try`ning o'zi
// hech narsani ushlamaydi va tasdiq har qanday holatda ham to'g'ri
// chiqib qolardi. Sinxron uloqtiruvchi mock haqiqiy sinov beradi.
{
  const repo = { append: () => { throw new Error('baza uzildi'); } } as unknown as IAppLogRepository;
  const sink = createDbLogSink(repo, () => undefined);

  let tashladi = false;
  try {
    sink({ ...ASOS, level: 50, msg: 'x' });
    await new Promise((r) => setTimeout(r, 0));
  } catch {
    tashladi = true;
  }
  eq('xato tarqamadi', tashladi, false);
}

// ── 4. Ogohlantirish FAQAT BIR MARTA chiqadi ───────────────────────────
// O'nta yiqilishda o'nta qator chiqarish jurnalní ko'mib tashlardi.
{
  const repo = { append: async () => { throw new Error('baza uzildi'); } } as unknown as IAppLogRepository;
  const sink = createDbLogSink(repo, () => undefined);
  const ushla = stderrniUshla();

  for (let i = 0; i < 10; i += 1) sink({ ...ASOS, level: 50, msg: 'x' });
  await new Promise((r) => setTimeout(r, 0));
  ushla.qaytar();

  eq('stderr ga bir marta', ushla.chiqish.length, 1);
}

// ── 5. `repo.append` ichidan qayta chaqirilsa — HALQAGA TUSHMAYDI ─────
// `pool.ts`dagi `query()`ning `finally`si — `await`dan KEYIN, promise
// davomida — sekin so'rov bo'lsa `log.warn` chaqiradi. Shu warn yana
// rozetkaning o'ziga uradi. Chegaralangan hisoblagich bilan tekshiramiz:
// himoya ishlamasa test osilib qolish o'rniga tezda yiqiladi.
{
  let chaqirildi = 0;
  const ushla = stderrniUshla();
  let sink: (entry: LogEntry) => void = () => undefined;
  const repo = {
    append: async () => {
      chaqirildi += 1;
      if (chaqirildi > 20) throw new Error('cheksiz halqa aniqlandi — himoya ishlamayapti');
      // `pool.ts`dagi `await client.query(...)` kabi asinxron bo'shliq.
      await new Promise((r) => setTimeout(r, 1));
      // "Sekin so'rov" ogohlantirishini taqlid qiladi.
      sink({ ...ASOS, level: 40, msg: "sekin so'rov" });
      return ITEM;
    },
  } as unknown as IAppLogRepository;
  sink = createDbLogSink(repo, () => undefined);

  sink({ ...ASOS, level: 50, msg: 'x' });
  await new Promise((r) => setTimeout(r, 100));
  ushla.qaytar();

  eq('append ichidan qayta chaqirilganda faqat bir marta ishladi', chaqirildi, 1);
}

// ── 6. `onWritten` ichidan qayta chaqirilsa — HALQAGA TUSHMAYDI ───────
// `InMemoryEventBus.publish`ning xato ishlovchisi kabi: `onWritten`
// (hodisa ishlovchisi) yiqiladi va buni ushlagan kod `log.error`
// chaqiradi — bu ham xuddi shu rozetkaga qaytadi.
//
// CHEGARA SHART: bu yerda `append` HECH QANDAY `await` qilmaydi, shuning
// uchun himoya ishlamasa `.then` → `onWritten` → `sink` → `append` zanjiri
// mikrovazifalar navbatini to'ldirib, `setTimeout`ning o'ziga navbat
// bermaydi — jarayon osilib qoladi, "yiqiladi" emas. Shu sababli 5-testdagi
// kabi chegaralangan hisoblagich shart, aks holda regressiya sinov
// yurgizuvchisini abadiy to'xtatib qo'yadi.
{
  let chaqirildi = 0;
  const ushla = stderrniUshla();
  let sink: (entry: LogEntry) => void = () => undefined;
  const repo = {
    append: async () => {
      chaqirildi += 1;
      if (chaqirildi > 20) throw new Error('cheksiz halqa aniqlandi — himoya ishlamayapti');
      return ITEM;
    },
  } as unknown as IAppLogRepository;
  sink = createDbLogSink(repo, () => {
    // Hodisa shinasining xato ishlovchisi kabi — qayta rozetkaga uradi.
    sink({ ...ASOS, level: 50, msg: 'hodisa ishlovchisi yiqildi' });
    throw new Error('onWritten yiqildi');
  });

  sink({ ...ASOS, level: 50, msg: 'x' });
  await new Promise((r) => setTimeout(r, 50));
  ushla.qaytar();

  eq('onWritten ichidan qayta chaqirilganda faqat bir marta yozildi', chaqirildi, 1);
  eq('bu holatda ham stderr ga bir marta', ushla.chiqish.length, 1);
}

// ── 7. `alsKontekstidanTashqarida` — `append` ICHIDA tug'ilgan resurs
//      ishlovchisi (masalan `pool.on('error', ...)`) baribir bazaga yozadi ──
// `pool.on('error', ...)`ga o'xshab: shu socket `append` davomida
// yaratilgan bo'lsa, uning xato ishlovchisi `ichkarida` konteksti ICHIDA
// ishga tushadi. Himoyaning o'zi buni "append ichidan qayta chaqirilyapti"
// deb noto'g'ri talqin qilib, yozuvni tashlab yuborardi (4-dbLogSink
// topilmasi). `alsKontekstidanTashqarida` shu holatda ham yozuv
// `app_log`ga yetib borishini ta'minlaydi.
{
  let yozildi = 0;
  const repo = { append: async () => { yozildi += 1; return ITEM; } } as unknown as IAppLogRepository;
  const sink = createDbLogSink(repo, () => undefined);

  // `pool.ts`dagi holatni taqlid qilamiz: resurs `append`ning o'z
  // konteksti ICHIDA yaratilgan, keyin xato shu kontekstda uradi.
  const tashqiRepo = { append: async () => {
    // Konteksт ICHIDA turib, "tashqarida" ishlovchini chaqiramiz —
    // xuddi socket xatosi keyinroq, lekin shu meros olingan kontekstda
    // ishga tushgani kabi.
    alsKontekstidanTashqarida(() => sink({ ...ASOS, level: 50, msg: 'pool xatosi' }));
    return ITEM;
  } } as unknown as IAppLogRepository;
  const tashqiSink = createDbLogSink(tashqiRepo, () => undefined);

  tashqiSink({ ...ASOS, level: 40, msg: 'boshlang\'ich yozuv' });
  await new Promise((r) => setTimeout(r, 10));

  eq('append ichida tug\'ilgan resurs xatosi ham bazaga yozildi', yozildi, 1);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
