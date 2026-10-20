import {
  BulkConversationStart,
  type BulkStartJob,
} from '@/application/services/BulkConversationStart';
import type { StartConversationUseCase } from '@/application/usecases/messaging/StartConversationUseCase';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { BulkStartPlanner } from '@/application/services/BulkStartPlanner';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-parallel --workspace=server
 *
 * Telegramga ham, bazaga ham chiqmaydi.
 *
 * NEGA KERAK: ilgari tanlangan akkauntlar soni yuborish tsikliga umuman
 * ta'sir qilmasdi — uch akkaunt bitta navbatda kutib turardi. Bu sinov
 * har akkauntning O'Z oqimida ishlashini va bir oqimning cheklovga
 * tushishi qolganlarini to'xtatmasligini qo'riqlaydi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

/** 05:00 UTC = 10:00 Toshkent. */
const NOW = new Date('2026-08-14T05:00:00Z');

const BOSH_COUNTS = {
  ready: 0, needs_lookup: 0, name_mismatch: 0, already_started: 0,
  no_phone: 0,
  do_not_contact: 0, blocked: 0,
};

interface Sozlama {
  /** Nechta akkaunt tanlanadi. */
  akkauntlar: number;
  /** Har akkauntga nechta mijoz. */
  harBiriga: number;
  /** clientId → shu mijozda `execute` nima qilsin. */
  xulq?: (clientId: string, accountId: string) => 'started' | 'skipped' | 'peer_flood' | 'aborted';
  /**
   * clientId → `execute` ichida necha ms ushlab tursin.
   *
   * Oqimlar orasidagi tartibni aniq qilish uchun: kim avval `nextAt`
   * qo'yishi, kim keyin o'tkazib yuborishi kerakligini vaqtga
   * qoldirmaslik kerak.
   */
  sekin?: (clientId: string) => number;
  minDelaySec?: number;
  maxDelaySec?: number;
  spreadUntil?: string;
  /**
   * Nechanchi `settings.get()` chaqiruvida o'tkinchi baza xatosi qaytsin
   * (1 dan boshlab sanaladi).
   *
   * NEGA AYNAN SHU JOY: `RuntimeSettings.get()` keshsiz baza so'rovi va u
   * tsikl ichida, mijoz uchun qo'yilgan `try/catch` dan TASHQARIDA
   * chaqiriladi — ya'ni bitta uzilish butun oqimni rad javobiga olib
   * boradi.
   */
  sozlamaXatosi?: number;
  /**
   * `listConnected()` dan CHIQARILADIGAN akkauntlar (`list()` da qoladi).
   *
   * Haqiqiy farqni takrorlaydi: reja `canAcceptClients` bilan tanlaydi
   * (yoqilgan va banda emas), sig'im ro'yxati esa `canSend` bilan
   * (ustiga ulangan, cheklovsiz, kvotasi bor). Uzilib qolgan akkaunt
   * guruh oladi, lekin sig'im ro'yxatida yo'q.
   */
  ulanmagan?: string[];
  /** Akkauntning kunlik limiti — sur'at shu sondan chiqadi. */
  kunlikLimit?: number;
  /**
   * Bog'lanish MUMKIN, lekin operator qo'lda chegaralagani uchun bugungi
   * taqsimotga tushmagan mijozlar (`planManualSplit` yig'indidan
   * ortiqchasini ataylab biriktirmaydi).
   *
   * Ular `findReassignableForBulkStart` natijasida BOR, lekin
   * `assignments` da YO'Q — soxta reja shu farqni takrorlaydi.
   */
  qoldirilgan?: string[];
}

interface Qurilma {
  bulk: BulkConversationStart;
  clientIds: string[];
  /** Har chaqiruv: mijoz, akkaunt, chaqirilgan vaqt (ms). */
  chaqiruvlar: Array<{ clientId: string; accountId: string; vaqt: number }>;
}

function build(s: Sozlama): Qurilma {
  const accountIds = Array.from({ length: s.akkauntlar }, (_, i) => `a${i + 1}`);
  const clientIds: string[] = [];
  const egasi = new Map<string, string>();
  for (const accountId of accountIds) {
    for (let n = 0; n < s.harBiriga; n += 1) {
      const id = `${accountId}-c${n}`;
      clientIds.push(id);
      egasi.set(id, accountId);
    }
  }

  const chaqiruvlar: Qurilma['chaqiruvlar'] = [];

  const startConversation = {
    execute: async (clientId: string, opts?: { noAutoAssign?: boolean }) => {
      const biriktirilgan = egasi.get(clientId) ?? null;
      const accountId = biriktirilgan ?? '?';
      chaqiruvlar.push({ clientId, accountId, vaqt: Date.now() });

      // `ClientTelegramResolver` ning HAQIQIY qoidasi: `noAutoAssign`
      // faqat akkaunti YO'Q mijozni to'xtatadi. Akkaunti bor mijoz
      // (masalan oldingi ishdan saqlanib qolgan) baribir yuboradi.
      // Soxta `execute` hammani "yuborildi" desa, sinov taqsimotdan
      // tashqarida qolgan mijozga xabar ketayotganini KO'RMASDI.
      if (!biriktirilgan && opts?.noAutoAssign) {
        return {
          status: 'skipped',
          reason: 'Mijozga akkaunt biriktirilmagan',
          conversation: null,
        };
      }

      const ushlab = s.sekin?.(clientId) ?? 0;
      if (ushlab > 0) await new Promise((r) => setTimeout(r, ushlab));

      const natija = s.xulq?.(clientId, accountId) ?? 'started';
      if (natija === 'peer_flood') {
        const { TelegramError } = await import('@/shared/errors');
        throw new TelegramError('Spam cheklovi', 'PEER_FLOOD');
      }
      // Operator "To'xtatish"ni AYNAN model javob yozayotganda bosgani —
      // `execute` ichidagi uzilish `sleep` uzilishidan boshqa yo'ldan
      // qaytadi va uni alohida qo'riqlash kerak.
      if (natija === 'aborted') {
        const { AbortedError } = await import('@/shared/errors');
        throw new AbortedError();
      }
      if (natija === 'skipped') {
        return { status: 'skipped', reason: 'Sinov uchun o\'tkazib yuborildi', conversation: null };
      }
      return { status: 'started' };
    },
  } as unknown as StartConversationUseCase;

  let sozlamaChaqiruv = 0;
  const settings = {
    get: async () => {
      sozlamaChaqiruv += 1;
      if (s.sozlamaXatosi !== undefined && sozlamaChaqiruv === s.sozlamaXatosi) {
        throw new Error('Bazaga ulanib bo\'lmadi');
      }
      return {
        killSwitch: false,
        windowStart: '00:00',
        windowEnd: '23:59',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        minDelaySec: s.minDelaySec ?? 0,
        maxDelaySec: s.maxDelaySec ?? 0,
        outreachDailyLimit: 1000,
        personaName: 'Madina',
      };
    },
  } as unknown as RuntimeSettings;

  const clients = {
    findById: async (id: string) => ({ id, fullName: `Mijoz ${id}`, telegramAccountId: egasi.get(id) ?? null }),
    // Har oqim O'ZINING ro'yxati bilan chaqiradi — bo'luvchi shu guruhdagi
    // xabar ketadiganlar soni bo'lishi kerak.
    previewBulkStart: async (ids: string[]) => ({
      total: ids.length,
      counts: { ...BOSH_COUNTS, ready: ids.length },
      mismatches: [], accountPlan: [], reassigned: 0,
    }),
    findReassignableForBulkStart: async (ids: string[]) => ids,
    assignAccounts: async (a: Array<{ clientId: string; accountId: string }>) => a.length,
    countByAccount: async () => [],
  } as unknown as IClientRepository;

  const accountRows = accountIds.map((id) => ({
    id, label: `Akkaunt ${id}`, personaName: null,
    isEnabled: true, status: 'connected', floodWaitUntil: null,
    spamStatus: 'clean', spamUntil: null, counterDate: null,
    // Kunlik limit ATAYLAB ulkan: `spreadUntil` berilmagan sinovlarda
    // oraliq `meanDelayMs(00:00, 23:59, dailyLimit)` dan chiqadi. 1000
    // bo'lsa har pauza ~86 soniya bo'lib, sinov soniyalar emas daqiqalar
    // davom etardi. Sur'atni tekshiradigan sinovlar `spreadUntil` beradi.
    sentToday: 0, dailyLimit: s.kunlikLimit ?? 1_000_000,
    lookupsToday: 0, dailyLookupLimit: 1_000_000,
  }));

  const ulanmagan = new Set(s.ulanmagan ?? []);
  const accounts = {
    listConnected: async () => accountRows.filter((a) => !ulanmagan.has(a.id)),
    list: async () => accountRows,
  } as unknown as ITelegramAccountRepository;

  // Chegaradan tashqarida qolganlar taqsimotdan CHIQARILADI, lekin
  // "bog'lanish mumkin" ro'yxatida qoladi.
  const qoldirilgan = new Set(s.qoldirilgan ?? []);
  const taqsimot = new Map([...egasi].filter(([id]) => !qoldirilgan.has(id)));

  const planner = {
    plan: async () => ({
      assignments: new Map(taqsimot),
      accountPlan: accountIds.map((id) => ({
        accountId: id, label: `Akkaunt ${id}`, personaName: 'Madina',
        count: s.harBiriga, remainingToday: 1000, overQuota: 0,
      })),
      reassigned: taqsimot.size,
      // `findReassignableForBulkStart` natijasi. Ro'yxatga qo'shilgan
      // begona mijoz bu yerda YO'Q — u baza so'rovining o'zidan chiqib
      // ketgan (chiquvchi xabari bor, bog'lanish taqiqlangan va h.k.).
      reassignable: new Set(egasi.keys()),
    }),
  } as unknown as BulkStartPlanner;

  const bulk = new BulkConversationStart(
    startConversation,
    settings,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-08-14' } as unknown as IClock,
    planner,
    clients,
    accounts,
    { labelOf: (id: string | null) => (id ? `Akkaunt ${id}` : null) } as unknown as AccountLabels,
  );

  return { bulk, clientIds, chaqiruvlar };
}

async function tugashiniKut(bulk: BulkConversationStart, urinish = 500): Promise<BulkStartJob> {
  for (let i = 0; i < urinish; i += 1) {
    const job = bulk.current();
    if (job && job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  const oxirgi = bulk.current();
  if (!oxirgi) throw new Error('ish umuman boshlanmadi');
  return oxirgi;
}

async function paceniKut(bulk: BulkConversationStart): Promise<BulkStartJob> {
  for (let i = 0; i < 500; i += 1) {
    const job = bulk.current();
    if (job && (job.accounts.length > 0 || job.status !== 'running')) return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('oqimlar hech qachon yaratilmadi');
}

// ─── 1. Har akkauntga o'z oqimi va o'z sur'ati ───────────────────────────
// 10:00 → 19:00 = 540 daqiqa. 60 mijoz, 3 akkaunt, har biriga 20 ta.
// Har OQIM: 540 / 20 = 27 daqiqa. JAMI: 540 / 60 = 9 daqiqa.
{
  const { bulk, clientIds } = build({ akkauntlar: 3, harBiriga: 20 });
  bulk.start(clientIds, 'p1', { accountIds: ['a1', 'a2', 'a3'], spreadUntil: '19:00' });

  const job = await paceniKut(bulk);
  check('uchta akkaunt qatori', job.accounts.length === 3, String(job.accounts.length));
  check('har oqimda 20 ta', job.accounts.every((a) => a.total === 20),
    JSON.stringify(job.accounts.map((a) => a.total)));
  check('oqim sur\'ati 27 daqiqa', job.accounts[0]?.paceMinutes === 27,
    String(job.accounts[0]?.paceMinutes));
  check('jami sur\'at 9 daqiqa', job.paceMinutes === 9, String(job.paceMinutes));

  bulk.stop();
  await tugashiniKut(bulk);
}

// ─── 2. Oqimlar ROSTDAN ustma-ust ishlaydi ───────────────────────────────
// Ketma-ket tsiklda a1 ning ikkinchi mijozi a3 ning birinchisidan KEYIN
// kelardi. Parallelda esa har oqim o'z navbatini kutmay ketadi.
// Pauza nolga qo'yilgan (`spreadUntil` yo'q, minDelaySec 0), shuning
// uchun sinov bir zumda tugaydi.
{
  const { bulk, clientIds, chaqiruvlar } = build({ akkauntlar: 3, harBiriga: 2 });
  bulk.start(clientIds, 'p2', { accountIds: ['a1', 'a2', 'a3'] });

  const job = await tugashiniKut(bulk);
  check('hammasi yuborildi', job.started === 6, String(job.started));

  // Har oqim o'z ichida tartibli.
  const a1 = chaqiruvlar.filter((c) => c.accountId === 'a1').map((c) => c.clientId);
  check('a1 tartibi saqlandi', String(a1) === 'a1-c0,a1-c1', String(a1));

  // Uchala oqim ham birinchi mijozini boshqalarning ikkinchisidan OLDIN
  // boshlagan bo'lishi kerak — ya'ni chaqiruvlar aralashgan.
  const birinchiUchtasi = new Set(chaqiruvlar.slice(0, 3).map((c) => c.accountId));
  check('dastlabki uch chaqiruv uch xil akkauntdan', birinchiUchtasi.size === 3,
    JSON.stringify(chaqiruvlar.slice(0, 3).map((c) => c.accountId)));
}

// ─── 3. Hisoblagich poygada yo'qolmaydi ──────────────────────────────────
// Uch oqim bir vaqtda o'tkazib yuborsa, o'tkazib yuborish tafsiloti
// `await` talab qiladi — eski `job.done + 1` mantiqida shu yerda
// oshirishlar yo'qolardi.
{
  const { bulk, clientIds } = build({ akkauntlar: 3, harBiriga: 5, xulq: () => 'skipped' });
  bulk.start(clientIds, 'p3', { accountIds: ['a1', 'a2', 'a3'] });

  const job = await tugashiniKut(bulk);
  check('15 tasi o\'tkazib yuborildi', job.skipped === 15, String(job.skipped));
  check('done ham 15', job.done === 15, String(job.done));
  check('har qatorda 5 tadan', job.accounts.every((a) => a.skipped === 5),
    JSON.stringify(job.accounts.map((a) => a.skipped)));
}

// ─── 4. To'xtatish hamma oqimni uzadi ────────────────────────────────────
{
  const { bulk, clientIds } = build({
    akkauntlar: 3, harBiriga: 10, minDelaySec: 300, maxDelaySec: 300,
  });
  bulk.start(clientIds, 'p4', { accountIds: ['a1', 'a2', 'a3'] });

  // Birinchi xabarlar ketishini kutamiz, keyin to'xtatamiz.
  for (let i = 0; i < 200 && (bulk.current()?.done ?? 0) < 3; i += 1) {
    await new Promise((r) => setTimeout(r, 10));
  }
  const boshlandi = Date.now();
  bulk.stop();
  const job = await tugashiniKut(bulk);

  check('holat to\'xtatildi', job.status === 'stopped', job.status);
  check(`darhol to'xtadi (${Date.now() - boshlandi} ms)`, Date.now() - boshlandi < 2000,
    `${Date.now() - boshlandi} ms`);
  check('hammasi yuborilmadi', job.done < 30, String(job.done));
  // Oqim to'xtaganda tsikldan `return` qilsa, tsikldan KEYINGI yakuniy
  // qator yangilanishi o'tkazib yuborilardi va jadvalda akkaunt abadiy
  // "ishlayapti" bo'lib turardi — ish esa allaqachon to'xtagan.
  check('birorta qator "ishlayapti" bo\'lib qolmadi',
    job.accounts.every((a) => a.status === 'stopped'),
    JSON.stringify(job.accounts.map((a) => a.status)));
}

// ─── 5. Akkaunt tanlanmagan → eski ketma-ket yo'l ────────────────────────
{
  const { bulk, clientIds, chaqiruvlar } = build({ akkauntlar: 2, harBiriga: 3 });
  bulk.start(clientIds, 'p5');

  const job = await tugashiniKut(bulk);
  check('eski yo\'lda tugadi', job.status === 'done', job.status);
  check('akkaunt qatorlari bo\'sh', job.accounts.length === 0, String(job.accounts.length));
  check('tartib ro\'yxatdagidek', String(chaqiruvlar.map((c) => c.clientId)) === String(clientIds),
    String(chaqiruvlar.map((c) => c.clientId)));
}

// ─── 6. Rejaga kirmagan mijoz qoldiq oqimida, qator yaratmaydi ───────────
{
  const { bulk, clientIds, chaqiruvlar } = build({ akkauntlar: 2, harBiriga: 2 });
  // Ro'yxatga rejaga kirmaydigan begona mijoz qo'shamiz. U baza
  // so'rovidan ham chiqib ketgan, ya'ni `reassignable` da YO'Q.
  bulk.start([...clientIds, 'begona'], 'p6', { accountIds: ['a1', 'a2'] });

  const job = await tugashiniKut(bulk);
  check('ikkita qator (qoldiq qator emas)', job.accounts.length === 2, String(job.accounts.length));
  check('jami 5 ta ishlandi', job.done === 5, String(job.done));
  // Bunday mijoz `execute` GACHA yetishi SHART: uning haqiqiy sababi
  // ("Suhbat allaqachon boshlangan", "bog'lanish taqiqlangan") faqat
  // o'sha yerda aniqlanadi va operator shu sabab bilan CRM'ni
  // solishtiradi. Uni majburan o'tkazib yuborsak, sabab umumiy matnga
  // almashib, tashxis qiymati yo'qolardi.
  check('baza so\'rovidan chiqqan mijoz `execute` gacha yetdi',
    chaqiruvlar.some((c) => c.clientId === 'begona'),
    String(chaqiruvlar.map((c) => c.clientId)));
  check('unga xabar ketmadi', job.started === 4, String(job.started));
  check('u o\'tkazib yuborilganlar qatorida', job.skipped === 1, String(job.skipped));
}

// ─── 7. Bitta akkauntning cheklovi qolganlarini to'xtatmaydi ─────────────
// Cheklov akkauntga beriladi. Sog'lom ikki akkauntning ishini bekorga
// to'xtatish operatorning butun kunini yo'qotardi.
//
// Sabab matni ham qo'riqlanadi: cheklovga tushgan oqim `flood` qo'ygach,
// tsikldan keyingi yakuniy yangilanish uni `stopped` qilib bosib o'tsa,
// operator akkaunt nega to'xtaganini umuman ko'rmasdi.
{
  const { bulk, clientIds } = build({
    akkauntlar: 3,
    harBiriga: 5,
    // a2 ning birinchi mijozida cheklov keladi.
    xulq: (clientId) => (clientId === 'a2-c0' ? 'peer_flood' : 'started'),
  });
  bulk.start(clientIds, 'p7', { accountIds: ['a1', 'a2', 'a3'] });

  const job = await tugashiniKut(bulk);

  check('ish yiqilmadi', job.status === 'done', `${job.status} — ${job.error}`);
  check('a1 va a3 to\'liq ketdi', job.started === 10, String(job.started));

  const a2 = job.accounts.find((a) => a.accountId === 'a2');
  check('a2 flood holatida', a2?.status === 'flood', String(a2?.status));
  check('a2 sababi yozildi', (a2?.error ?? '').includes('PEER_FLOOD'), String(a2?.error));
  check('a2 ning qolgani o\'tkazib yuborildi', a2?.skipped === 5, String(a2?.skipped));

  const a1 = job.accounts.find((a) => a.accountId === 'a1');
  check('a1 tugadi', a1?.status === 'done', String(a1?.status));
  check('hammasi hisobga olindi', job.done === 15, String(job.done));
}

// ─── 8. Eski ketma-ket yo'lda ham cheklov ishni yiqitadi ─────────────────
// Akkaunt tanlanmagan yo'l qo'riqchi: ilgari tsikl `run()` ichida edi va
// `return` butun ishni tugatardi. Oqimga ko'chirilgach shu xulq
// saqlanishi SHART.
{
  const { bulk, clientIds } = build({
    akkauntlar: 1, harBiriga: 5,
    xulq: (clientId) => (clientId === 'a1-c2' ? 'peer_flood' : 'started'),
  });
  bulk.start(clientIds, 'p8');

  const job = await tugashiniKut(bulk);
  check('eski yo\'lda ham yiqildi', job.status === 'failed', job.status);
  check('eski yo\'lda sabab saqlandi', (job.error ?? '').includes('Spam cheklovi'), String(job.error));
  check('cheklovdan keyingilarga yozilmadi', job.started === 2, String(job.started));
}

// ─── 9. `execute` ichidagi uzilish qatorni ochiq qoldirmaydi ─────────────
// Signal aynan shu yo'l uchun `execute` ga uzatiladi. Oqim vaqtining
// ko'p qismi yo `sleep` da, yo `execute` ichida o'tadi — 4-sinov faqat
// birinchisini isbotlaydi.
{
  const { bulk, clientIds } = build({
    akkauntlar: 2, harBiriga: 3,
    // Uzilish ENG BIRINCHI mijozda: aks holda ikkinchi oqim o'z uchtasini
    // tugatib ulgurib, qatori haqli ravishda `done` bo'lardi va sinov
    // vaqtga bog'liq bo'lib qolardi.
    xulq: (clientId) => (clientId === 'a1-c0' ? 'aborted' : 'started'),
  });
  bulk.start(clientIds, 'p9', { accountIds: ['a1', 'a2'] });

  const job = await tugashiniKut(bulk);
  check('uzilishda holat to\'xtatildi', job.status === 'stopped', job.status);
  check('uzilish xato deb sanalmadi', job.failed === 0, String(job.failed));
  check('uzilishda ham qator yopildi', job.accounts.every((a) => a.status !== 'running'),
    JSON.stringify(job.accounts.map((a) => a.status)));
}

// ─── 10. Hamma akkaunt cheklovga tushsa — ish yiqiladi ───────────────────
// Bu endi umumiy muammo belgisi: operator sababni tekshirishi kerak.
{
  const { bulk, clientIds } = build({
    akkauntlar: 2, harBiriga: 3, xulq: () => 'peer_flood',
  });
  bulk.start(clientIds, 'p10', { accountIds: ['a1', 'a2'] });

  const job = await tugashiniKut(bulk);
  check('ish yiqildi', job.status === 'failed', job.status);
  check('sabab ko\'rsatildi', (job.error ?? '').includes('cheklov'), String(job.error));
  check('ikkala qator ham flood', job.accounts.every((a) => a.status === 'flood'),
    JSON.stringify(job.accounts.map((a) => a.status)));
}

// ─── 11. Operator chegarasidan tashqarida qolganga xabar KETMAYDI ────────
// Kunlik ish: kecha taqsimot saqlangan, bugun operator `perAccount` bilan
// "faqat shuncha" degan. Chegaradan tashqarida qolgan mijozda KECHAGI
// akkaunt saqlanib turadi, ya'ni `noAutoAssign` uni to'xtatmaydi — u
// o'sha akkauntdan yana birinchi xabar yuborardi va akkaunt operator
// so'ragan sondan ko'p murojaat qilib, `PEER_FLOOD` ga yaqinlashardi.
{
  const { bulk, clientIds, chaqiruvlar } = build({
    akkauntlar: 1, harBiriga: 3, qoldirilgan: ['a1-c2'],
  });
  bulk.start(clientIds, 'p11', { accountIds: ['a1'], perAccount: { a1: 2 } });

  const job = await tugashiniKut(bulk);

  check('chegaradan tashqaridagi mijoz `execute` ga UMUMAN yetmadi',
    !chaqiruvlar.some((c) => c.clientId === 'a1-c2'),
    String(chaqiruvlar.map((c) => c.clientId)));
  check('faqat ikkitasiga xabar ketdi', job.started === 2, String(job.started));
  check('uchinchisi o\'tkazib yuborildi', job.skipped === 1, String(job.skipped));
  check('hammasi hisobga olindi', job.done === 3, String(job.done));
  check('sababi operatorga ko\'rinadi',
    job.skippedItems.some(
      (x) => x.clientId === 'a1-c2'
        && x.reason === 'Bugungi taqsimotga kirmadi — operator qo\'lda chegaralagan',
    ),
    JSON.stringify(job.skippedItems));
  check('tafsilotda ism bor',
    job.skippedItems.some((x) => x.clientId === 'a1-c2' && x.fullName === 'Mijoz a1-c2'),
    JSON.stringify(job.skippedItems));
}

// ─── 12. Bir oqimning kutilmagan xatosi qolganlarini egasiz qoldirmaydi ──
// Ilgari `Promise.all` birinchi rad javobida DARHOL qaytardi: `run()`
// tugab, `start()` ishni "failed" qilib yopardi, qolgan oqimlar esa
// hech kim kutmagan holda ishlashda davom etardi. `isRunning()` shu
// zahoti `false` bo'lgani uchun operator YANGI ish boshlashi mumkin edi
// va egasiz oqimlar yangi ishning hisoblagichlariga yozib, o'sha
// akkauntlardan sur'atsiz xabar yuborardi — aynan `PEER_FLOOD` ga
// olib boradigan yo'l.
{
  const { bulk, clientIds, chaqiruvlar } = build({
    akkauntlar: 3,
    harBiriga: 4,
    // Har mijozdan keyin ~1 soniya: xato kelganda qolgan oqimlarda hali
    // ishlanmagan mijozlar qolishi kerak, aks holda sinov hech narsani
    // isbotlamasdi.
    minDelaySec: 1,
    maxDelaySec: 1,
    // 1–3 — `run()` va uchala oqimning boshlanish siljishi; 5–7 — uchala
    // oqimning birinchi iteratsiyasi. 8-chaqiruv esa allaqachon tsikl
    // ichida, ya'ni xato ishning O'RTASIDA keladi.
    sozlamaXatosi: 8,
  });
  bulk.start(clientIds, 'p12', { accountIds: ['a1', 'a2', 'a3'] });

  const job = await tugashiniKut(bulk);
  check('kutilmagan xatoda ish yiqildi', job.status === 'failed', `${job.status} — ${job.error}`);
  check('yakuniy holatda birorta qator "ishlayapti" emas',
    job.accounts.every((a) => a.status !== 'running'),
    JSON.stringify(job.accounts.map((a) => a.status)));

  // Ish yakuniy holatga o'tgach TIRIK oqim qolmasligi kerak.
  const yopilganda = chaqiruvlar.length;
  await new Promise((r) => setTimeout(r, 1500));
  check('ish yopilgach hech bir oqim xabar yubormadi',
    chaqiruvlar.length === yopilganda,
    `${yopilganda} → ${chaqiruvlar.length}`);
}

// ─── 13. Sig'im ro'yxatida yo'q akkaunt ham o'z sur'atini oladi ──────────
// Reja `canAcceptClients` bilan tanlaydi (yoqilgan va banda emas), sig'im
// ro'yxati esa `canSend` bilan (ustiga ulangan, cheklovsiz, kvotasi bor).
// Uzilib qolgan akkaunt guruh oladi, lekin sig'im ro'yxatiga tushmaydi —
// ilgari uning `dailySends` i 0 bo'lib, sur'at UMUMAN hisoblanmasdi.
//
// NEGA XAVFLI: `spreadUntil` ixtiyoriy. Usiz sur'at faqat kunlik oynadan
// chiqadi va u 0 bo'lsa oraliq `minDelaySec…maxDelaySec` pastki
// chegarasiga tushadi — ~27 daqiqa o'rniga ~1 daqiqa. Akkaunt ish
// o'rtasida qayta ulangan zahoti oqim shu tezlikda xabar yog'dirardi.
{
  // Oyna 00:00–23:59 = 1439 daqiqa, kunlik limit 100 → 14.39 daqiqa.
  const { bulk, clientIds } = build({
    akkauntlar: 2, harBiriga: 5, kunlikLimit: 100, ulanmagan: ['a2'],
  });
  bulk.start(clientIds, 'p13', { accountIds: ['a1', 'a2'] });

  const job = await paceniKut(bulk);
  const a2 = job.accounts.find((a) => a.accountId === 'a2');
  check('ulanmagan akkauntga ham qator berildi', a2 !== undefined,
    JSON.stringify(job.accounts.map((a) => a.accountId)));
  check('ulanmagan akkauntning sur\'ati o\'z limitidan chiqdi', a2?.paceMinutes === 14,
    String(a2?.paceMinutes));

  const a1 = job.accounts.find((a) => a.accountId === 'a1');
  check('ulangan akkauntning sur\'ati o\'zgarmadi', a1?.paceMinutes === 14,
    String(a1?.paceMinutes));
  check('jami sur\'at ikkala oqimni hisobga oldi', job.paceMinutes === 7,
    String(job.paceMinutes));

  bulk.stop();
  await tugashiniKut(bulk);
}

// ─── 14. Bir oqimdagi o'tkazib yuborish boshqasining vaqtini o'chirmaydi ─
// "Keyingi xabar" vaqti ISH darajasida bitta, oqimlar esa uchta.
// O'tkazib yuborishda `patch({ nextAt: null })` deb TO'G'RIDAN yozish
// boshqa oqimning haqiqiy vaqtini o'chirib yuborardi. O'tkazib yuborish
// esa kamdan-kam emas — operator vaqtni doimiy noto'g'ri ko'rardi.
{
  // a2 birinchi xabarini darhol yuboradi va uzoq pauzaga (10:00 → 19:00,
  // ikkita mijoz = 270 daqiqa) kirib, `nextAt` qo'yadi. a1 esa 200 ms
  // kechikib, ketma-ket ikkitasini o'tkazib yuboradi.
  const { bulk, clientIds } = build({
    akkauntlar: 2, harBiriga: 2,
    xulq: (clientId) => (clientId.startsWith('a1-') ? 'skipped' : 'started'),
    sekin: (clientId) => (clientId.startsWith('a1-') ? 200 : 0),
  });
  bulk.start(clientIds, 'p14', { accountIds: ['a1', 'a2'], spreadUntil: '19:00' });

  // a1 ikkala mijozini o'tkazib yuborguncha kutamiz.
  let job = bulk.current();
  for (let i = 0; i < 500 && (job?.skipped ?? 0) < 2; i += 1) {
    await new Promise((r) => setTimeout(r, 10));
    job = bulk.current();
  }
  check('a1 ikkalasini ham o\'tkazib yubordi', job?.skipped === 2, String(job?.skipped));

  const a1 = job?.accounts.find((a) => a.accountId === 'a1');
  const a2 = job?.accounts.find((a) => a.accountId === 'a2');
  check('a2 pauzada va o\'z vaqtini saqlab turibdi', a2?.nextAt !== null && a2?.nextAt !== undefined,
    String(a2?.nextAt));
  check('o\'tkazib yuborgan oqimning o\'z vaqti tozalangan', a1?.nextAt === null, String(a1?.nextAt));
  check('ish darajasidagi vaqt a2 niki bo\'lib qoldi', job?.nextAt === a2?.nextAt,
    `${String(job?.nextAt)} ≠ ${String(a2?.nextAt)}`);

  bulk.stop();
  await tugashiniKut(bulk);
}

console.log(failed ? `\n${failed} ta sinov yiqildi` : '\nHammasi o\'tdi');
process.exit(failed ? 1 : 0);
