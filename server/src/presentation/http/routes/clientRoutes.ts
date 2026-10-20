import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import type { Container } from '@/composition/container';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseBody, parseQuery } from '@/presentation/http/middleware/validate';
import { normalizePhone } from '@/shared/phone';
import { AppError, NotFoundError, ValidationError } from '@/shared/errors';
import { canAcceptClients } from '@/domain/entities/TelegramAccount';
import { XARID_BOSQICHLARI } from '@/domain/entities/Purchase';
import { CLIENT_SOURCES } from '@/domain/entities/Client';
import { ALOQA_KALITLARI } from '@/domain/entities/aloqaHolati';
import { EKSPORT_USTUNLARI, eksportQatori } from '@/application/usecases/clients/eksportJadvali';
import type { ClientQuery } from '@/domain/repositories/IClientRepository';
import { childLogger } from '@/shared/logger';
import { qamrov } from '@/presentation/http/middleware/qamrov';
import { begonaniToxtatma, korinadiganVazifa } from '@/application/services/vazifaKorinishi';
import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';

const log = childLogger('client-routes');

const usernameSchema = z.object({
  // Telegram username: 5-32 belgi, harf/raqam/pastki chiziq. "@" ixtiyoriy.
  username: z
    .string()
    .trim()
    .regex(/^@?[a-zA-Z][a-zA-Z0-9_]{3,31}$/, 'Username noto\'g\'ri (masalan: @mijoz_ismi)'),
});

/**
 * Ommaviy amallar uchun yuqori chegara.
 *
 * Bu TEZLIKNI cheklamaydi — tezlik xabarlar orasidagi pauza va ish vaqti
 * oynasi bilan boshqariladi. Bu shunchaki "tasodifan butun bazani
 * yubormaslik" uchun oxirgi to'siq: 5000 ta id ~200 KB, so'rov tanasi
 * chegarasiga (2 MB) bemalol sig'adi.
 */
const BULK_MAX = 5000;

const blockPhoneSchema = z.object({
  phone: z.string().trim().min(1, 'Raqam majburiy'),
  // Sabab ixtiyoriy: shoshilinch holatda sababsiz ham bosiladi. Lekin UI
  // uni so'raydi — keyin "nega o'chirgansiz?" degan savol chiqishi tabiiy.
  reason: z.string().trim().max(500).optional().nullable(),
});

const unblockPhoneSchema = z.object({
  phone: z.string().trim().min(1, 'Raqam majburiy'),
});

const fromContractSchema = z.object({
  contractNo: z.string().trim().min(1, 'Shartnoma raqami majburiy'),
});

const bulkLookupSchema = z.object({
  clientIds: z
    .array(z.string().uuid())
    .min(1, 'Hech kim tanlanmagan')
    .max(BULK_MAX, `Bir vaqtda ${BULK_MAX} tagacha`),
  /**
   * Qidiruvni qaysi akkauntlar bajaradi. Bo'sh bo'lsa eski xatti-harakat:
   * mijozning biriktirilgan akkaunti (yoki avtomatik biriktirilgani).
   */
  accountIds: z.array(z.string().uuid()).optional(),
});

const bulkStartSchema = z.object({
  // 60-180 soniya oraliq bilan bir kunga ~300 tasi sig'adi. Ko'proq
  // tanlansa ish ish vaqti tugashi bilan to'xtaydi va ertaga davom
  // ettiriladi — bu to'xtatuvchi xato emas, oddiy holat.
  clientIds: z
    .array(z.string().uuid())
    .min(1, 'Hech kim tanlanmagan')
    .max(BULK_MAX, `Bir vaqtda ${BULK_MAX} tagacha`),
  /**
   * Telegramdagi ism mos kelmaganlarga ham yuborish.
   * Dashboardda ogohlantirish ko'rsatiladi va operator alohida belgilaydi —
   * shuning uchun sukut qiymati har doim `false`.
   */
  allowNameMismatch: z.boolean().optional().default(false),
  accountIds: z.array(z.string().uuid()).min(1, 'Kamida bitta Telegram akkaunt tanlang'),
  /**
   * Operator qo'lda kiritgan taqsimot: accountId → nechta mijoz.
   * Bo'lmasa tizim o'zi teng taqsimlaydi (eski xatti-harakat).
   */
  perAccount: z.record(z.string().uuid(), z.number().int().min(0)).optional(),
  /**
   * Taqsimot shu soatgacha cho'ziladi (HH:mm).
   *
   * Ixtiyoriy: bo'lmasa eski mantiq (akkauntlarning kunlik limitlari)
   * ishlaydi va to'g'ridan-to'g'ri kelgan eski so'rovlar buzilmaydi.
   *
   * `windowEnd` bilan solishtirmaymiz — ish oynasi sozlamasi so'rov
   * ketayotganda o'zgargan bo'lishi mumkin va bu 400 xato uchun juda
   * mayda sabab. Oyna tugaganda ish o'zi to'xtaydi.
   */
  spreadUntil: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Vaqt HH:mm ko'rinishida bo'lsin")
    .optional(),
});

/**
 * Bitta mijoz bilan suhbat boshlash.
 *
 * Tanasi bo'sh ham kelishi mumkin (eski chaqiruvlar hech narsa
 * yubormasdi), shuning uchun sxema butunlay ixtiyoriy.
 *
 * `allowNameMismatch` — ommaviy oqimdagi bayroqning aynan o'zi: operator
 * Telegramdagi ismni ko'rib, "baribir yuborilsin" deb belgilaganda keladi.
 * Har bir bunday holat `client.name_mismatch_override` bo'lib jurnalga
 * tushadi (`StartConversationUseCase` yozadi).
 */
const startOneSchema = z
  .object({ allowNameMismatch: z.boolean().optional() })
  .optional()
  .default({});

const bulkPreviewSchema = z.object({
  clientIds: z
    .array(z.string().uuid())
    .min(1, 'Hech kim tanlanmagan')
    .max(BULK_MAX, `Bir vaqtda ${BULK_MAX} tagacha`),
  // Oyna ochilganda hali hech narsa tanlanmagan bo'ladi — shuning uchun
  // ixtiyoriy. Bo'sh bo'lsa taqsimot hisoblanmaydi.
  accountIds: z.array(z.string().uuid()).optional(),
  /**
   * Operator qo'lda kiritgan taqsimot: accountId → nechta mijoz.
   * Bo'lmasa tizim o'zi teng taqsimlaydi (eski xatti-harakat).
   */
  perAccount: z.record(z.string().uuid(), z.number().int().min(0)).optional(),
});

/**
 * Bir nechta qiymat oladigan filtr parametri.
 *
 * Qiymatlar TAKRORLANGAN parametr bilan keladi (`?a=x&a=y`) — Express uni
 * massiv qilib beradi. Vergul bilan ajratilmaydi: CRM'dan kelgan xom
 * shartnoma holati nomida vergul bo'lishi mumkin. Bitta qiymatli eski
 * so'rov (`?a=x`) ham ishlayveradi. Bo'sh ro'yxat — "filtr yo'q".
 */
const kopQiymat = <T extends z.ZodTypeAny>(element: T) =>
  z
    .preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      const royxat = (Array.isArray(v) ? v : [v]).filter((x) => x !== '');
      return royxat.length ? [...new Set(royxat)] : undefined;
    }, z.array(element).max(50).optional());

export const listQuery = z.object({
  search: z.string().optional(),
  tab: z.enum(['all', 'new', 'in_conversation', 'no_telegram', 'needs_review', 'deleted']).optional(),
  telegramStatus: kopQiymat(
    z.enum([
      'unknown', 'searching', 'found', 'not_found',
      'privacy_restricted', 'name_mismatch', 'blocked', 'deactivated',
    ]),
  ),
  hasPhone: z.enum(['true', 'false']).optional(),
  hasDebt: z.enum(['true', 'false']).optional(),
  minDaysOverdue: z.coerce.number().int().optional(),
  objectName: z.string().optional(),
  virtualStatus: kopQiymat(z.string()),
  aloqa: z.enum(ALOQA_KALITLARI).optional(),
  stage: z.enum(XARID_BOSQICHLARI).optional(),
  source: z.enum(CLIENT_SOURCES as [string, ...string[]]).optional(),
  courseId: z.string().uuid().optional(),
  sort: z.enum(['debt', 'overdue', 'name', 'recent']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * So'rov satridan repozitoriy filtriga o'tkazish.
 *
 * NEGA BITTA JOYDA: bu obyekt uch marshrutda kerak — ro'yxat, "filtrdagi
 * hammasini belgilash" va Excel eksporti. Uch nusxa bo'lganda yangi
 * filtr bittasiga qo'shilib, ikkinchisida unutiladi: operator ekranda
 * ko'rmagan mijozlarni belgilab qo'yadi yoki faylda boshqa to'plamni
 * oladi. Ikkalasi ham jimgina xato.
 *
 * `sort`, `limit`, `offset` bu yerda YO'Q — ular har marshrutda
 * boshqacha (eksport saralashni oladi, sahifalashni olmaydi).
 */
export function listFiltrlari(q: z.infer<typeof listQuery>): ClientQuery {
  return {
    search: q.search,
    tab: q.tab,
    telegramStatus: q.telegramStatus,
    hasPhone: q.hasPhone === undefined ? undefined : q.hasPhone === 'true',
    hasDebt: q.hasDebt === 'true' ? true : undefined,
    minDaysOverdue: q.minDaysOverdue,
    objectName: q.objectName,
    virtualStatus: q.virtualStatus,
    aloqa: q.aloqa,
    stage: q.stage,
    source: q.source as ClientQuery['source'],
    courseId: q.courseId,
  };
}

// Express 5 da tanasiz DELETE so'rovida `req.body` — `undefined`.
// `.default({})` shuning uchun: sabab ixtiyoriy, so'rov esa tanasiz kelishi mumkin.
const deleteSchema = z
  .object({
    /** Nima uchun o'chirilgani — jurnalga tushadi. */
    reason: z.string().trim().max(500).optional(),
  })
  .default({});

const stageSchema = z.object({ stage: z.enum(XARID_BOSQICHLARI) });

const updateSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().nullable().optional(),
  extraPhones: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  doNotContact: z.boolean().optional(),
});

export function clientRoutes(container: Container): Router {
  const router = Router();
  const { clients, contracts, conversations, contractPayments, audit, phoneBlocks, purchases } =
    container.repositories;
  const { contractSync, qamrovTekshiruvchi } = container.services;

  /**
   * Obyekt cheklovi — ommaviy amallar uchun: so'rovdagi id'lardan faqat
   * qamrovdagilari. Cheklanganda javobga `chiqarildi` (nechtasi tushdi)
   * qo'shiladi; cheklanmaganda ro'yxat va javob avvalgidek.
   */
  async function qamrovdagilar(
    q: MijozQamrovi,
    clientIds: string[],
    { boshBolmasin }: { boshBolmasin: boolean },
  ): Promise<{ ids: string[]; qoshimcha: { chiqarildi?: number } }> {
    if (!q.cheklangan) return { ids: clientIds, qoshimcha: {} };
    const ids = await qamrovTekshiruvchi.idlarniKesish(q, clientIds);
    if (boshBolmasin && ids.length === 0) {
      throw new ValidationError('Tanlangan mijozlarning hech biri sizning obyektlaringizda emas');
    }
    return { ids, qoshimcha: { chiqarildi: clientIds.length - ids.length } };
  }

  /** Bazadagi shartnoma mijozi qamrovda bo'lmasa — `Shartnoma topilmadi` (404). */
  async function shartnomaMijoziniTekshir(q: MijozQamrovi, clientId: string, contractNo: string): Promise<void> {
    try {
      await qamrovTekshiruvchi.mijoz(q, clientId);
    } catch (err) {
      if (err instanceof NotFoundError) throw new NotFoundError('Shartnoma', contractNo);
      throw err;
    }
  }

  /**
   * Obyekt cheklovi: `/:id` va `/:id/*` — mijoz qamrovda bo'lmasa 404
   * (begona yozuv borligi oshkor qilinmaydi). Cheklanmaganda bazaga so'rov
   * yo'q. Savatdagi (o'chirilgan) mijoz cheklanganga ko'rinmaydi: qamrov
   * tirik shartnoma talab qiladi, o'chirishda esa shartnomalar ham
   * belgilanadi.
   */
  router.param('id', async (req, _res, next, id) => {
    try {
      await qamrovTekshiruvchi.mijoz(qamrov(req), String(id));
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (req, res) => {
    const q = parseQuery(listQuery, req);
    const page = await clients.search(
      { ...listFiltrlari(q), sort: q.sort, limit: q.limit, offset: q.offset },
      qamrov(req),
    );
    // Har bir mijozga joriy xarid (faol yoki oxirgi) qo'shiladi.
    const xaridlar = await purchases.findCurrentByClients(page.items.map((c) => c.id));
    res.json({ ...page, items: page.items.map((c) => ({ ...c, purchase: xaridlar.get(c.id) ?? null })) });
  });

  /**
   * Filtrga tushgan HAMMA mijozning id'lari.
   *
   * "Filtrdagi hammasini belgilash" tugmasi uchun. Ro'yxat so'rovi 200 ta
   * bilan cheklangan (u ekran uchun), bu esa to'liq to'plamni beradi —
   * aks holda operator "hammasini belgiladim" deb o'ylab, aslida faqat
   * birinchi 200 tasi bilan ishlardi.
   *
   * `/:id` dan OLDIN turishi shart.
   */
  router.get('/ids', requirePermission('clients.view'), async (req, res) => {
    const q = parseQuery(listQuery, req);
    // Filtr `listFiltrlari` orqali — ro'yxat bilan aynan bir xil
    // to'plam. Aks holda operator ekranda ko'rmagan mijozlarni
    // belgilab qo'yardi.
    const ids = await clients.searchIds(listFiltrlari(q), qamrov(req));
    res.json({ ids, total: ids.length });
  });

  /**
   * Filtrga tushgan mijozlar ro'yxati — `.xlsx` fayl.
   *
   * `/:id` dan OLDIN turishi shart, aks holda "export" mijoz id'si deb
   * o'qiladi.
   *
   * NEGA ALOHIDA RUXSAT: ekranda ko'rish qaytarib olinadi, fayl esa
   * yo'q — u kompyuterda, pochtada, Telegramda qolib ketadi. Ichida
   * telefon raqamlari va to'lov summalari bor.
   *
   * `limit`/`offset` ATAYLAB e'tiborga olinmaydi: operator ekranda
   * ko'rgan TO'PLAMNI oladi, birinchi sahifani emas — `/ids` bilan bir
   * xil qoida.
   */
  router.get('/export', requirePermission('clients.export'), async (req, res) => {
    const user = currentUser(req);
    // Tekshiruvlar birinchi baytdan OLDIN: oqim boshlangach javobni
    // JSON xatoga aylantirib bo'lmaydi, sarlavhalar ketib bo'lgan.
    const q = parseQuery(listQuery, req);
    const filters = { ...listFiltrlari(q), sort: q.sort };
    const mijozQamrovi = qamrov(req);

    const sana = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="mijozlar-${sana}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
    const sheet = workbook.addWorksheet('Mijozlar', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    // Kengliklar va sarlavha ALOHIDA beriladi: oqim rejimida `columns`
    // ichidagi `header` qatorni darhol yozib yuboradi va uni keyin
    // qalinlashtirib bo'lmaydi.
    sheet.columns = EKSPORT_USTUNLARI.map((u) => ({ width: u.kengligi }));
    const sarlavha = sheet.addRow(EKSPORT_USTUNLARI.map((u) => u.nom));
    sarlavha.font = { bold: true };
    sarlavha.commit();

    const kurslar = new Map((await container.repositories.courses.list()).map((c) => [c.id, c.name]));

    let soni = 0;
    try {
      for await (const bolak of clients.searchAll(filters, 500, mijozQamrovi)) {
        const xaridlar = await purchases.findCurrentByClients(bolak.map((c) => c.id));
        for (const mijoz of bolak) {
          const purchase = xaridlar.get(mijoz.id) ?? null;
          const kursNomi = purchase?.courseId ? (kurslar.get(purchase.courseId) ?? null) : null;
          sheet.addRow(eksportQatori(mijoz, { purchase, kursNomi })).commit();
        }
        soni += bolak.length;
      }

      sheet.commit();
      await workbook.commit();
    } catch (err) {
      // Sarlavhalar allaqachon ketgan — javobni ENDI JSON xatoga
      // aylantirib bo'lmaydi (`errorHandler` shu holatda
      // ERR_HTTP_HEADERS_SENT bilan yiqilardi). Mijoz yuklab olishni
      // bekor qilishi bu yerda ODDIY, kutilgan hodisa — xato darajasida
      // emas, ogohlantirish darajasida logga yozamiz va oqimni to'g'ridan
      // to'g'ri yopamiz.
      if (res.headersSent) {
        log.warn({ err, soni }, "Eksport oqimi uzildi (mijoz yuklab olishni bekor qilgan bo'lishi mumkin)");
        res.destroy();
        return;
      }
      throw err;
    }

    // Jurnal oqim TUGAGANDAN keyin: uzilib qolgan yuklash "eksport
    // qilindi" bo'lib ko'rinmasligi kerak. Xato bu yerda javobga
    // TA'SIR QILMAYDI — fayl mijozga allaqachon yetib bo'lgan, faqat
    // jurnalga tushmay qoladi; buni faqat logga yozamiz, aks holda
    // `errorHandler`ga yuborilib xuddi shu ERR_HTTP_HEADERS_SENT xatosini
    // berardi.
    await audit
      .record({
        actor: user.id,
        action: 'clients.exported',
        entity: 'client',
        entityId: null,
        payload: { count: soni, filters },
      })
      .catch((err) => log.error({ err, soni }, 'Eksport jurnalga tushmadi'));
  });

  // ─── Ommaviy Telegram tekshiruvi ────────────────────────────────────────
  //
  // Bittalab tekshirish sekin, hammasini birdan yuborish esa akkauntni
  // FLOOD_WAIT ga tushiradi. Shuning uchun fon vazifasi: ketma-ket, pauza
  // bilan. Progress socket orqali dashboardga uzatiladi.

  router.post('/telegram-lookup-bulk', requirePermission('clients.telegram_lookup'), async (req, res) => {
    const user = currentUser(req);
    const body = parseBody(bulkLookupSchema, req);
    const { accountIds } = body;
    const { ids: clientIds, qoshimcha } = await qamrovdagilar(qamrov(req), body.clientIds, { boshBolmasin: true });

    if (container.services.bulkLookup.isRunning()) {
      throw new ValidationError('Tekshiruv allaqachon ketyapti — tugashini kuting');
    }

    // Xotirada vazifa yo'q bo'lishi mumkin, lekin bazada tiklanishni
    // kutayotgani bor (server endigina ko'tarilgan). Mijozlarni akkauntlarga
    // biriktirishdan OLDIN tekshiramiz — aks holda biriktirish qo'llanib,
    // vazifa esa boshlanmay qolardi.
    await container.services.bulkJobStore.assertFree('lookup');

    // Akkaunt tanlangan bo'lsa, mijozlar AVVAL o'sha akkauntlarga
    // taqsimlanadi va biriktiriladi — qidiruv ularning biriktirilgan
    // akkaunti bo'yicha ketadi.
    //
    // Biriktirish shart, chunki topilgan `access_hash` aynan qidirgan
    // akkauntga bog'lanadi: boshqa akkauntdan ishlatilsa yaroqsiz bo'lib,
    // mijoz qaytadan qidirilardi va kvota ikki marta sarflanardi.
    let assigned = 0;
    if (accountIds?.length) {
      const plan = await container.services.bulkStartPlanner.plan(clientIds, accountIds, { maqsad: 'lookup' });
      if (!plan.accountPlan.length) {
        throw new ValidationError('Tanlangan akkauntlarning birortasi ham qidiruvga tayyor emas');
      }
      assigned = await container.repositories.clients.assignAccounts(
        [...plan.assignments].map(([clientId, accountId]) => ({ clientId, accountId })),
      );
    }

    const jobId = randomUUID();
    const job = await container.services.bulkLookup.start(clientIds, jobId, user.id);

    await container.repositories.audit.record({
      actor: user.email,
      action: 'clients.telegram_bulk_lookup',
      entity: 'client',
      entityId: null,
      payload: { count: clientIds.length, jobId, accounts: accountIds?.length ?? 0, assigned },
    });

    res.json({ job, ...qoshimcha });
  });

  /**
   * Qidiruvdan OLDINGI taqsimot — qaysi akkauntga nechta mijoz tushishi.
   *
   * Telegramga so'rov yubormaydi. Kunlik qidiruv kvotasi 50 ta, ya'ni
   * operator "hammasi tekshiriladi" deb o'ylab, yarmi kvota tugagani
   * uchun qolib ketishini bilmasligi mumkin edi.
   */
  router.post('/telegram-lookup-bulk/preview', requirePermission('clients.telegram_lookup'), async (req, res) => {
    const body = parseBody(bulkLookupSchema, req);
    const { accountIds } = body;
    const { ids: clientIds, qoshimcha } = await qamrovdagilar(qamrov(req), body.clientIds, { boshBolmasin: false });
    const plan = await container.services.bulkStartPlanner.plan(clientIds, accountIds ?? [], {
      maqsad: 'lookup',
    });
    res.json({ total: clientIds.length, accountPlan: plan.accountPlan, ...qoshimcha });
  });

  /** Joriy vazifa holati — socket uzilib qolsa zaxira sifatida. */
  router.get('/telegram-lookup-bulk', async (req, res) => {
    res.json({ job: korinadiganVazifa(container.services.bulkLookup.current(), currentUser(req).id, qamrov(req)) });
  });

  router.post('/telegram-lookup-bulk/stop', requirePermission('clients.telegram_lookup'), async (req, res) => {
    begonaniToxtatma(container.services.bulkLookup.current(), currentUser(req).id, qamrov(req));
    container.services.bulkLookup.stop();
    res.json({ job: container.services.bulkLookup.current() });
  });

  // ─── Ommaviy suhbat boshlash ────────────────────────────────────────────
  //
  // Bu eng xavfli amal: notanish odamga BIRINCHI xabar — Telegram spam
  // filtri uchun asosiy signal. Shuning uchun kampaniya rejalashtiruvchisi
  // bilan bir xil himoya: ish oynasi, tasodifiy 60-180 soniya pauza,
  // PEER_FLOOD da darhol to'xtash.

  /**
   * Boshlashdan OLDINGI tekshiruv.
   *
   * Tanlanganlarning nechtasiga xabar ketishi va qolgani nega o'tkazib
   * yuborilishini oldindan aytadi. Telegramga so'rov yubormaydi — javob
   * faqat bazadagi holatdan hisoblanadi, shuning uchun tugma bosilgan
   * zahoti ko'rsatsa bo'ladi.
   */
  router.post('/start-conversation-bulk/preview', requirePermission('clients.start_conversation'), async (req, res) => {
    const body = parseBody(bulkPreviewSchema, req);
    const { accountIds, perAccount } = body;
    const { ids: clientIds, qoshimcha } = await qamrovdagilar(qamrov(req), body.clientIds, { boshBolmasin: false });
    // Chegara dialogda ko'rsatiladigan son bilan yuborishda qo'llanadigan
    // qoida bitta manbadan kelishi uchun shu yerda o'qiladi.
    const { minDebt } = await container.settings.get();
    const [preview, plan] = await Promise.all([
      clients.previewBulkStart(clientIds, minDebt),
      container.services.bulkStartPlanner.plan(clientIds, accountIds ?? [], { manual: perAccount }),
    ]);
    res.json({
      preview: { ...preview, accountPlan: plan.accountPlan, reassigned: plan.reassigned },
      ...qoshimcha,
    });
  });

  router.post('/start-conversation-bulk', requirePermission('clients.start_conversation'), async (req, res) => {
    const user = currentUser(req);
    const body = parseBody(bulkStartSchema, req);
    const { allowNameMismatch, accountIds, perAccount, spreadUntil } = body;
    const { ids: clientIds, qoshimcha } = await qamrovdagilar(qamrov(req), body.clientIds, { boshBolmasin: true });

    if (container.services.bulkStart.isRunning()) {
      throw new ValidationError('Suhbat boshlash allaqachon ketyapti — tugashini kuting');
    }

    // Tanlangan akkaunt haqiqatan mijoz qabul qila oladimi. UI ham shu
    // qoidaga tayanadi, lekin so'rov to'g'ridan-to'g'ri ham kelishi mumkin.
    const all = await container.repositories.telegramAccounts.list();
    const usable = all.filter((a) => accountIds.includes(a.id) && canAcceptClients(a));
    // Uzunlikni solishtirish YARAMAYDI: `accountIds` xom so'rov massivi,
    // takrorlangan id kelishi mumkin (masalan `['x','x']`), `usable` esa
    // noyob akkauntlardan filtrlangan. Takror bo'lsa uzunliklar mos
    // kelmay qoladi va haqiqatan yaroqli akkaunt ham 400 bilan rad
    // etilardi. Shuning uchun har bir id alohida tekshiriladi.
    const usableIds = new Set(usable.map((a) => a.id));
    const yaroqsizSoni = accountIds.filter((id) => !usableIds.has(id)).length;
    if (yaroqsizSoni) {
      throw new ValidationError(
        `Tanlangan akkauntlardan ${yaroqsizSoni} tasi mijoz qabul qila olmaydi — o'chirilgan yoki bloklangan`,
      );
    }

    // Xotirada vazifa yo'q, lekin bazada tiklanishni kutayotgani bo'lishi
    // mumkin (server endigina ko'tarilgan) — boshlashdan OLDIN rad etamiz.
    // Egasi yo'q qotgan qator shu yerda yopiladi.
    await container.services.bulkJobStore.assertFree('start');

    const jobId = randomUUID();
    const job = await container.services.bulkStart.start(clientIds, jobId, {
      allowNameMismatch,
      accountIds,
      perAccount,
      spreadUntil,
      actor: user.email,
      boshlaganUserId: user.id,
    });

    await container.repositories.audit.record({
      actor: user.email,
      action: 'clients.bulk_start_conversation',
      entity: 'client',
      entityId: null,
      payload: {
        count: clientIds.length,
        jobId,
        allowNameMismatch,
        accountIds,
        accounts: usable.map((a) => a.label),
        spreadUntil: spreadUntil ?? null,
      },
    });

    res.json({ job, ...qoshimcha });
  });

  router.get('/start-conversation-bulk', async (req, res) => {
    res.json({ job: korinadiganVazifa(container.services.bulkStart.current(), currentUser(req).id, qamrov(req)) });
  });

  router.post('/start-conversation-bulk/stop', requirePermission('clients.start_conversation'), async (req, res) => {
    begonaniToxtatma(container.services.bulkStart.current(), currentUser(req).id, qamrov(req));
    container.services.bulkStart.stop();
    res.json({ job: container.services.bulkStart.current() });
  });

  /** Tab tugmalari yonidagi sonlar. `/:id` dan OLDIN turishi shart. */
  router.get('/tab-counts', async (req, res) => {
    res.json({ counts: await clients.tabCounts(qamrov(req)) });
  });

  /** Filtr ro'yxati uchun: bazada uchraydigan shartnoma holatlari. */
  router.get('/contract-statuses', async (req, res) => {
    res.json({ items: await clients.contractStatuses(qamrov(req)) });
  });

  /**
   * Shartnoma raqamini tekshirish — hech narsa saqlanmaydi.
   *
   * Oldindan ko'rish ataylab: bitta raqam xato terilsa, butunlay boshqa
   * odam qo'shilib ketardi va uni keyin o'chirish kerak bo'lardi.
   *
   * `/:id` dan OLDIN turishi shart — aks holda Express `from-contract` ni
   * mijoz id'si deb qabul qiladi.
   */
  router.post('/from-contract/preview', requirePermission('clients.create'), async (req, res) => {
    const { contractNo } = parseBody(fromContractSchema, req);
    const mijozQamrovi = qamrov(req);
    const preview = await container.useCases.createClientFromContract.preview(contractNo, mijozQamrovi);

    if (preview.outcome === 'disabled') {
      throw new ValidationError('Shartnomalar integratsiyasi o\'chirilgan');
    }
    if (preview.outcome === 'error') {
      throw new AppError(
        `Shartnomalar bazasi javob bermadi: ${preview.error ?? 'noma\'lum xato'}`,
        502,
        'UPSTREAM_ERROR',
      );
    }
    if (preview.outcome === 'not_found') throw new NotFoundError('Shartnoma', contractNo);
    // Obyekt cheklovi: bazadagi shartnomaning mijozi begona bo'lsa — topilmagan kabi.
    if (preview.existingClient) await shartnomaMijoziniTekshir(mijozQamrovi, preview.existingClient.id, contractNo);

    res.json({ preview });
  });

  /** Mijozni shartnoma raqami bo'yicha qo'shish. */
  router.post('/from-contract', requirePermission('clients.create'), async (req, res) => {
    const user = currentUser(req);
    const { contractNo } = parseBody(fromContractSchema, req);
    const mijozQamrovi = qamrov(req);
    const result = await container.useCases.createClientFromContract.execute(contractNo, user.email, mijozQamrovi);

    if (result.outcome === 'disabled') {
      throw new ValidationError('Shartnomalar integratsiyasi o\'chirilgan');
    }
    if (result.outcome === 'error') {
      throw new AppError(
        `Shartnomalar bazasi javob bermadi: ${result.error ?? 'noma\'lum xato'}`,
        502,
        'UPSTREAM_ERROR',
      );
    }
    if (result.outcome === 'not_found') throw new NotFoundError('Shartnoma', contractNo);
    // Obyekt cheklovi: bazadagi shartnomaning mijozi begona bo'lsa — topilmagan
    // kabi (`clientId` oshkor qilinmaydi). Bu yo'lda hech narsa yozilmagan.
    if (result.outcome === 'already_exists' && result.clientId) {
      await shartnomaMijoziniTekshir(mijozQamrovi, result.clientId, contractNo);
    }

    // `already_exists` xato EMAS: operator raqamni kiritib, mijoz
    // allaqachon borligini bilib oldi. Unga kerakli narsa — o'sha karta.
    res.json({ result });
  });

  /**
   * CRM uchun hisobot: qaysi mijozning qaysi raqami noto'g'ri chiqdi.
   *
   * Manbadagi xatoni biz tuzata olmaymiz — `app-api.xonsaroy.uz` ga
   * yozish huquqimiz yo'q. Shuning uchun Xonsaroy jamoasiga beriladigan
   * aniq ro'yxat kerak: shartnoma raqami bilan, ular mijozni shu bo'yicha
   * topadi.
   *
   * `/:id` dan OLDIN turishi shart, aks holda "phone-blocks" mijoz id'si
   * deb o'qilardi.
   */
  router.get('/phone-blocks', requirePermission('clients.export'), async (req, res) => {
    res.json({ rows: await phoneBlocks.report(qamrov(req)) });
  });

  router.get('/:id', async (req, res) => {
    const id = String(req.params.id);
    // O'chirilgan mijozning kartasi ham ochilishi kerak — savatdan
    // tiklashdan oldin xodim nimani qaytarayotganini ko'rsin.
    const client = await clients.findById(id, { includeDeleted: true });
    if (!client) throw new NotFoundError('Mijoz', id);
    // Obyekt cheklovi: savat cheklanganga yopiq (yopiq holatda yiqiladi).
    if (client.deletedAt && qamrov(req).cheklangan) throw new NotFoundError('Mijoz', id);

    const [clientContracts, conversation, blockedPhones] = await Promise.all([
      contracts.findByClientId(id, { includeDeleted: Boolean(client.deletedAt) }),
      conversations.findByClientId(id),
      // Uzilgan raqamlar kartada ko'rinadi: operator xato uzganini
      // qaytara olishi kerak, aks holda raqam izsiz yo'qolardi.
      phoneBlocks.listForClient(id),
    ]);

    // Grafik va kelib tushgan to'lovlar — ASOSIY shartnoma bo'yicha.
    // Mijozda bir nechta shartnoma bo'lsa, karta birinchisini ochib
    // ko'rsatadi; qolganlari ro'yxatda ko'rinadi.
    const primary = clientContracts[0] ?? null;
    const [schedule, recentPayments] = primary
      ? await Promise.all([
          contractPayments.listSchedule(primary.id),
          contractPayments.listRecentPayments(primary.id, 20),
        ])
      : [[], []];

    res.json({
      client,
      purchase: await purchases.findActiveByClient(id) ?? (await purchases.findLatestByClient(id)),
      contracts: clientContracts,
      conversation,
      blockedPhones,
      payments: {
        contractId: primary?.id ?? null,
        contractNo: primary?.contractNo ?? null,
        syncedAt: primary?.syncedAt ?? null,
        syncError: primary?.syncError ?? null,
        schedule,
        recent: recentPayments,
      },
      // Ikkalasi ham: agent mijozga `debtMonthly` ni aytadi, xodim esa
      // umumiy kechikkan to'lovni ham ko'rib turishi kerak.
      debtMonthly: clientContracts.reduce((s, c) => s + c.debtMonthly, 0),
      debtTotal: clientContracts.reduce((s, c) => s + c.debtTotal, 0),
      daysOverdue: clientContracts.reduce((m, c) => Math.max(m, c.daysOverdue), 0),
    });
  });

  /** Xarid bosqichini qo'lda o'zgartirish (menejer) — har qanday o'tish ruxsat. */
  router.patch('/:id/stage', requirePermission('clients.edit'), async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { stage } = parseBody(stageSchema, req);
    if (!(await clients.findById(id))) throw new NotFoundError('Mijoz', id);
    const purchase = await container.services.xaridXizmati.bosqich(id, stage, 'menejer', currentUser(req).id);
    // `null` — bosqich allaqachon shu; xarid o'zgarishsiz qaytariladi.
    res.json({ purchase: purchase ?? (await purchases.findActiveByClient(id)) });
  });

  router.patch('/:id', requirePermission('clients.edit'), async (req, res) => {
    const id = String(req.params.id);
    const patch = parseBody(updateSchema, req);

    if (patch.phone) {
      const normalized = normalizePhone(patch.phone);
      if (!normalized) throw new ValidationError(`Telefon raqami noto'g'ri: ${patch.phone}`);
      patch.phone = normalized;
    }
    if (patch.extraPhones) {
      patch.extraPhones = patch.extraPhones
        .map((p) => normalizePhone(p))
        .filter((p): p is string => Boolean(p));
    }

    const updated = await clients.update(id, patch);
    res.json({ client: updated });
  });

  /**
   * "Bu raqam mijozniki emas" — raqamni mijozdan uzadi.
   *
   * Mijozga yozdik, javob bergan odam boshqa kishi bo'lib chiqdi: raqam eski
   * egasidan chiqib, yangi odamga berilgan. Agent bunday holatda uzr aytadi
   * va begona odamga "boshqa yozilmaydi" deb va'da beradi.
   *
   * Qaror OPERATORNIKI: haqiqiy qarzdor ham xabardan qutulish uchun
   * "adashgansiz" deyishi mumkin, va tekshirilmagan da'vo bo'yicha
   * avtomatik o'chirish undiruvni jimgina yo'qotardi.
   */
  router.post('/:id/phones/block', requirePermission('clients.edit'), async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);
    const { phone, reason } = parseBody(blockPhoneSchema, req);

    const normalized = normalizePhone(phone);
    if (!normalized) throw new ValidationError(`Telefon raqami noto'g'ri: ${phone}`);

    await container.useCases.blockClientPhone.execute({
      clientId: id,
      phone: normalized,
      reason: reason ?? null,
      actor: user.id,
    });

    res.json({ client: await clients.findById(id), blocked: await phoneBlocks.listForClient(id) });
  });

  /** To'siq xato qo'yilgan bo'lsa — qaytarish. Raqam avtomatik tiklanmaydi. */
  router.delete('/:id/phones/block', requirePermission('clients.edit'), async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);
    const { phone } = parseBody(unblockPhoneSchema, req);

    const normalized = normalizePhone(phone);
    if (!normalized) throw new ValidationError(`Telefon raqami noto'g'ri: ${phone}`);

    await phoneBlocks.unblock(id, normalized);
    await audit.record({
      actor: user.id,
      action: 'client.phone_unblocked',
      entity: 'client',
      entityId: id,
      payload: { phone: normalized },
    });

    res.json({ blocked: await phoneBlocks.listForClient(id) });
  });

  /**
   * Mijozni o'chirish — YUMSHOQ.
   *
   * Bazadan hech narsa yo'qolmaydi: mijoz, shartnomalari, suhbatlari,
   * xabarlari va to'lov va'dalari `deleted_at` bilan belgilanadi va
   * ro'yxatlardan chiqib ketadi. Kerak bo'lsa "O'chirilgan" tabidan
   * qaytariladi. Kim, qachon va nima uchun o'chirgani jurnalda qoladi.
   */
  router.delete('/:id', requirePermission('clients.delete'), async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);
    const { reason } = parseBody(deleteSchema, req);

    const client = await clients.findById(id);
    if (!client) throw new NotFoundError('Mijoz', id);

    const summary = await clients.softDelete(id, user.email);

    await container.repositories.audit.record({
      actor: user.email,
      action: 'client.deleted',
      entity: 'client',
      entityId: id,
      payload: {
        mijoz: client.fullName,
        telefon: client.phone,
        eksportId: client.externalId,
        sabab: reason ?? null,
        belgilandi: {
          shartnomalar: summary.contracts,
          suhbatlar: summary.conversations,
          xabarlar: summary.messages,
          vadalar: summary.promises,
          kampaniyaNishonlari: summary.campaignTargets,
          profillar: summary.profiles,
        },
      },
    });

    container.events.publish({ type: 'stats.invalidate' });

    res.json({ ok: true, summary });
  });

  /** O'chirilgan mijozni qaytarish. */
  router.post('/:id/restore', requirePermission('clients.delete'), async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);

    const client = await clients.findById(id, { includeDeleted: true });
    if (!client) throw new NotFoundError('Mijoz', id);
    // Obyekt cheklovi: savat cheklanganga yopiq (yopiq holatda yiqiladi).
    if (client.deletedAt && qamrov(req).cheklangan) throw new NotFoundError('Mijoz', id);
    if (!client.deletedAt) throw new ValidationError('Bu mijoz o\'chirilmagan');

    const summary = await clients.restore(id);

    await container.repositories.audit.record({
      actor: user.email,
      action: 'client.restored',
      entity: 'client',
      entityId: id,
      payload: {
        mijoz: client.fullName,
        ochirilgan: client.deletedAt,
        ochirgan: client.deletedBy,
        qaytarildi: {
          shartnomalar: summary.contracts,
          suhbatlar: summary.conversations,
          xabarlar: summary.messages,
          vadalar: summary.promises,
          kampaniyaNishonlari: summary.campaignTargets,
          profillar: summary.profiles,
        },
      },
    });

    container.events.publish({ type: 'stats.invalidate' });

    res.json({ ok: true, client: await clients.findById(id), summary });
  });

  /** Mijozni Telegramdan qidirish (telefon raqami bo'yicha). */
  /**
   * Bitta shartnomani shartnomalar bazasidan darhol yangilaydi.
   *
   * Xodim kartada eskirgan raqamni ko'rsa kechani kutmasligi kerak —
   * bitta so'rov ~330 ms.
   */
  router.post('/:id/sync-contract', requirePermission('contracts.sync'), async (req, res) => {
    const user = currentUser(req);
    const clientId = String(req.params.id);
    const contractId = String((req.body as { contractId?: string } | undefined)?.contractId ?? '');
    if (!contractId) throw new ValidationError('contractId majburiy');

    // Boshqa mijozning shartnomasini yangilashga yo'l qo'ymaymiz.
    const owned = await contracts.findByClientId(clientId);
    if (!owned.some((c) => c.id === contractId)) throw new NotFoundError('Shartnoma', contractId);

    const result = await contractSync.syncOne(contractId);

    await audit.record({
      actor: user.email,
      action: 'contract.synced_manually',
      entity: 'contract',
      entityId: contractId,
      payload: { outcome: result.outcome, debtTotal: result.debtTotal, newPhones: result.newPhones.length },
    });

    res.json(result);
  });

  router.post('/:id/telegram-lookup', requirePermission('clients.telegram_lookup'), async (req, res) => {
    const id = String(req.params.id);
    const client = await clients.findById(id);
    if (!client) throw new NotFoundError('Mijoz', id);

    // Qo'lda bosilgan qidiruv — saqlangan natijani chetlab o'tadi (raqam
    // tuzatilgan yoki mijoz Telegramga endi kirgan bo'lishi mumkin).
    const outcome = await container.services.resolver.resolve(client, { force: true, purpose: 'lookup' });
    const refreshed = await clients.findById(id);
    res.json({ outcome: outcome.kind, client: refreshed });
  });

  /**
   * Mijozning Telegram username'ini QO'LDA biriktirish.
   *
   * Shartnomadagi raqam bilan mijoz Telegramda o'tirmasligi mumkin — u
   * butunlay boshqa raqamdan foydalanadi. Bunday holatda xodim username'ni
   * kiritadi va aloqa shu profil orqali ketadi.
   *
   * Ism tekshiruvi bu yerda QO'LLANMAYDI: username'ni odam o'zi ataylab
   * kiritgan, ya'ni bu allaqachon qo'lda tasdiqlash. Topilgan ism baribir
   * saqlanadi va kartada ko'rinadi.
   */
  router.post('/:id/telegram-username', requirePermission('clients.telegram_lookup'), async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);
    const { username } = parseBody(usernameSchema, req);

    const client = await clients.findById(id);
    if (!client) throw new NotFoundError('Mijoz', id);

    const accountId =
      client.telegramAccountId ?? (await container.services.assigner.ensureAssigned(id));
    if (!accountId) {
      throw new ValidationError('Yaroqli Telegram akkaunt yo\'q — avval akkaunt qo\'shing');
    }

    const result = await container.services.telegram.lookupByUsername(accountId, username);
    if (result.kind !== 'found') {
      throw new ValidationError(`@${username.replace(/^@/, '')} topilmadi — username'ni tekshiring`);
    }

    const telegramName = [result.peer.firstName, result.peer.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const updated = await clients.setTelegramIdentity(
      id,
      {
        telegramUserId: result.peer.telegramUserId,
        telegramUsername: result.peer.username,
        telegramAccessHash: result.peer.accessHash,
        telegramName: telegramName || null,
        // Username bo'yicha qidiruvni bajargan akkaunt.
        telegramHashAccountId: accountId,
      },
      'found',
    );

    await container.repositories.audit.record({
      actor: user.email,
      action: 'client.telegram_username_set',
      entity: 'client',
      entityId: id,
      payload: { mijoz: client.fullName, username: result.peer.username, telegramda: telegramName },
    });

    res.json({ client: updated });
  });

  /**
   * "Ism mos kelmadi" holatini QO'LDA tasdiqlash.
   *
   * Odamlar Telegramda ismini o'zgacha qo'yadi ("Ulug'bek", "SANJAR zarb
   * sadosi"), shuning uchun avtomatik tekshiruv har doim ham to'g'ri hukm
   * chiqara olmaydi. Xodim profilni ko'rib, "bu haqiqatan bizning
   * mijozimiz" desa — holat `found` ga o'tadi va agent ishlay boshlaydi.
   *
   * Identifikator allaqachon saqlangan, shuning uchun qayta qidirish shart emas.
   */
  router.post('/:id/telegram-confirm', requirePermission('clients.telegram_lookup'), async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);
    const client = await clients.findById(id);
    if (!client) throw new NotFoundError('Mijoz', id);

    if (client.telegramStatus !== 'name_mismatch') {
      throw new ValidationError('Bu mijozda tasdiqlash kutilayotgan profil yo\'q');
    }
    if (!client.telegramUserId) {
      throw new ValidationError('Telegram profili saqlanmagan — avval qaytadan qidiring');
    }

    const updated = await clients.setTelegramStatus(id, 'found');

    await container.repositories.audit.record({
      actor: user.email,
      action: 'client.telegram_confirmed',
      entity: 'client',
      entityId: id,
      payload: { mijoz: client.fullName, telegramda: client.telegramName, phone: client.phone },
    });

    res.json({ client: updated });
  });

  /** Shu mijoz bilan suhbatni boshlash (agent birinchi xabarni yozadi). */
  router.post('/:id/start-conversation', requirePermission('clients.start_conversation'), async (req, res) => {
    const user = currentUser(req);
    const { allowNameMismatch } = parseBody(startOneSchema, req);
    const result = await container.useCases.startConversation.execute(String(req.params.id), {
      allowNameMismatch,
      actor: user.email,
    });

    await container.repositories.audit.record({
      actor: user.email,
      action: 'conversation.started_manually',
      entity: 'client',
      entityId: String(req.params.id),
      payload: { status: result.status, allowNameMismatch: allowNameMismatch === true },
    });

    res.json(result);
  });

  return router;
}
