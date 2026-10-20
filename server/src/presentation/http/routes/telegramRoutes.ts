import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseBody, parseQuery } from '@/presentation/http/middleware/validate';
import { serializeCheckReport, serializeTelegramAccount } from '@/presentation/http/serializers';
import { personaNameOf } from '@/domain/entities/TelegramAccount';
import { PREMIUM_MUDDATLARI, premiumTugashi } from '@/domain/services/premium';
import { validateProxy } from '@/domain/entities/telegramProxy';
import type { TelegramProxy, TelegramProxyPatch } from '@/domain/entities/telegramProxy';
import { probeProxy } from '@/infrastructure/telegram/proxyProbe';
import { sessiyaIzi } from '@/infrastructure/telegram/sessiyaIzi';
import type { Request } from 'express';
import { STYLE_VERSIONS } from '@/domain/entities/UslubVersiyasi';
import { config } from '@/shared/config';
import { normalizePhone } from '@/shared/phone';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('telegram-routes');

/**
 * Berilgan proksi patchi bazadagi holatdan chinakam farq qiladimi.
 *
 * Parol uchligi bu yerda ham davom etadi: patch'da `password` maydoni
 * bo'lmasa (`undefined`), bu "bazadagiga tegilmagan" degani — solishtiruv
 * bazadagi qiymatni ishlatishi kerak, aks holda parolga tegilmagan har bir
 * saqlash "o'zgargan" deb hisoblanib, keraksiz reconnect'ga olib borardi.
 */
function proxyUnchanged(before: TelegramProxy | null, patch: TelegramProxyPatch | null): boolean {
  if (patch === null) return before === null;
  if (before === null) return false;
  const password = patch.password === undefined ? before.password : patch.password;
  return (
    before.host === patch.host &&
    before.port === patch.port &&
    before.username === patch.username &&
    before.password === password
  );
}

/**
 * Bo'sh satr `null` ga aylantiriladi: operator maydonni tozalaganda
 * akkaunt umumiy ismga qaytishi kerak. Tekshiruvni preprocess'siz
 * yozsak, `min(2)` tozalashni rad etib qo'yardi.
 */
const personaNameField = z
  .preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().min(2, 'Ism juda qisqa').max(40, 'Ism juda uzun').nullable(),
  )
  .optional();

const createSchema = z.object({
  label: z.string().min(2, 'Nom juda qisqa'),
  phone: z.string().min(9, 'Telefon raqami noto\'g\'ri'),
  apiId: z.coerce.number().int().positive().optional(),
  apiHash: z.string().min(10).optional(),
  dailyLimit: z.number().int().min(1).max(200).optional(),
  lookupLimit: z.number().int().min(1).max(500).optional(),
  personaName: personaNameField,
});

const codeSchema = z.object({
  phoneCodeHash: z.string().min(1),
  code: z.string().min(4, 'Kod juda qisqa'),
});

const passwordSchema = z.object({ password: z.string().min(1) });

const dialogsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const historyQuery = z.object({
  peerId: z.string().min(1),
  accessHash: z.string().optional(),
  kind: z.enum(['user', 'group', 'channel']).default('user'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  /** Shu id'dan eskiroq xabarlarni olish (yuqoriga varaqlash). */
  offsetId: z.coerce.number().int().positive().optional(),
});

/**
 * Proksi maydonlarining SHAKLI. Maydonlararo qoida (loginsiz parol,
 * bo'sh host) `validateProxy` da — u sof funksiya va alohida
 * tekshiriladi.
 *
 * `null` — proksini o'chirish.
 */
const proxyField = z
  .object({
    host: z.string(),
    port: z.coerce.number(),
    username: z.string().nullable().optional(),
    password: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const proxyTestSchema = z.object({
  host: z.string(),
  port: z.coerce.number(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
});

const updateSchema = z.object({
  label: z.string().min(2).optional(),
  dailyLimit: z.number().int().min(1).max(200).optional(),
  lookupLimit: z.number().int().min(1).max(500).optional(),
  isEnabled: z.boolean().optional(),
  personaName: personaNameField,
  proxy: proxyField,
  // Faqat `v1`/`v2` qabul qilinadi — boshqa qiymat qaysi qoida
  // bo'limi ishlatilishini noaniq qoldiradi (`STYLE_VERSIONS`).
  styleVersion: z.enum(STYLE_VERSIONS).optional(),
  // `null` — akkauntni standart dvigatelga (Claude) qaytarish. Qator
  // mavjudligi shakl darajasida (UUID) emas, marshrutda tekshiriladi —
  // bazada yo'q id bilan akkaunt "OpenAI'ga o'tdim" deb o'ylab qolardi-yu,
  // `AgentEngineFactory` baribir standart yo'lga tushardi (jimgina).
  llmModelId: z.string().uuid().nullable().optional(),
});

/** Haqiqatan mavjud kalendar sanasi, YYYY-MM-DD (2027-02-30 o'tmaydi). */
const sanaField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana YYYY-MM-DD ko\'rinishida bo\'lishi kerak')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Bunday sana yo\'q');

/**
 * Premium ikki xil kiritiladi: aniq tugash sanasi (`null` — Premium yo'q)
 * yoki sotib olingan sana + muddat — bunda tugash sanasini server
 * hisoblaydi (`premiumTugashi`), panel emas.
 */
const premiumSchema = z.union([
  z.object({ until: sanaField.nullable() }).strict(),
  z
    .object({
      boshlanish: sanaField,
      oy: z.number().refine(
        (v) => (PREMIUM_MUDDATLARI as readonly number[]).includes(v),
        'Muddat ro\'yxatda yo\'q',
      ),
    })
    .strict(),
]);

export function telegramRoutes(container: Container): Router {
  const router = Router();
  const { telegramAccounts, llmModels, audit } = container.repositories;
  const { telegram } = container.services;

  /**
   * Sessiyaga ta'sir qiladigan amalni KIM bosgani: foydalanuvchi, IP va
   * brauzer. Amaldan OLDIN chaqiriladi — amal yiqilsa ham iz qoladi.
   *
   * nginx ortida `req.ip` har doim 127.0.0.1, shuning uchun
   * `X-Forwarded-For` / `X-Real-IP` alohida yoziladi.
   */
  async function sessiyaAmali(req: Request, amal: string): Promise<void> {
    try {
      const id = String(req.params.id);
      const account = await telegramAccounts.findById(id);
      const sarlavha = (nom: string): string | null => {
        const v = req.headers[nom];
        return (Array.isArray(v) ? v.join(', ') : v) || null;
      };
      sessiyaIzi.http(account?.label ?? id, amal, {
        foydalanuvchi: req.user?.email ?? null,
        ip: req.ip ?? req.socket.remoteAddress ?? null,
        forwardedFor: sarlavha('x-forwarded-for') ?? sarlavha('x-real-ip'),
        userAgent: sarlavha('user-agent'),
      });
    } catch {
      // Iz yozilmasa ham amal bajarilishi kerak.
    }
  }

  router.get('/accounts', async (_req, res) => {
    const today = container.clock.todayIso();
    const [accounts, settings, suhbatlar] = await Promise.all([
      telegramAccounts.list(),
      container.settings.get(),
      container.repositories.clients.countConversationClientsByAccount(),
    ]);
    const suhbatSoni = new Map(suhbatlar.map((r) => [r.accountId, r.count]));
    res.json({
      items: accounts.map((a) => ({
        ...serializeTelegramAccount(a, today),
        connected: telegram.isConnected(a.id),
        // «Suhbatni boshlash» oynasida akkauntlar yukini solishtirish uchun.
        conversationClients: suhbatSoni.get(a.id) ?? 0,
      })),
      // Akkauntda ism ko'rsatilmaganda qaysi ism ishlashini interfeys
      // ko'rsatishi kerak. Alohida /settings chaqiruvi boshqa ruxsat
      // talab qiladi, shuning uchun shu yerda beriladi.
      defaultPersonaName: settings.personaName,
    });
  });

  router.post('/accounts', requirePermission('telegram.manage'), async (req, res) => {
    const user = currentUser(req);
    const payload = parseBody(createSchema, req);

    const phone = normalizePhone(payload.phone);
    if (!phone) throw new ValidationError(`Telefon raqami noto'g'ri: ${payload.phone}`);

    const apiId = payload.apiId ?? config.TELEGRAM_API_ID;
    const apiHash = payload.apiHash ?? config.TELEGRAM_API_HASH;
    if (!apiId || !apiHash) {
      throw new ValidationError(
        'api_id va api_hash kerak. my.telegram.org → API development tools sahifasidan oling ' +
          'yoki .env faylga TELEGRAM_API_ID / TELEGRAM_API_HASH qo\'shing.',
      );
    }

    if (await telegramAccounts.findByPhone(phone)) {
      throw new ConflictError('Bu raqam allaqachon qo\'shilgan');
    }

    const account = await telegramAccounts.create({
      label: payload.label,
      phone,
      apiId,
      apiHash,
      dailyLimit: payload.dailyLimit,
      lookupLimit: payload.lookupLimit,
      personaName: payload.personaName ?? null,
    });

    await audit.record({
      actor: user.email,
      action: 'telegram.account_added',
      entity: 'telegram_account',
      entityId: account.id,
      payload: { label: account.label, phone },
    });

    res.status(201).json({ account: serializeTelegramAccount(account, container.clock.todayIso()) });
  });

  /** 1-qadam: Telegram SMS/ilova orqali kod yuboradi. */
  router.post('/accounts/:id/login/start', requirePermission('telegram.manage'), async (req, res) => {
    await sessiyaAmali(req, 'login/start');
    const result = await telegram.startLogin(String(req.params.id));
    container.events.publish({ type: 'telegram.status', accountId: String(req.params.id), status: 'awaiting_code' });
    res.json(result);
  });

  /** 2-qadam: kodni tasdiqlash. */
  router.post('/accounts/:id/login/code', requirePermission('telegram.manage'), async (req, res) => {
    await sessiyaAmali(req, 'login/code');
    const { phoneCodeHash, code } = parseBody(codeSchema, req);
    const result = await telegram.confirmCode(String(req.params.id), phoneCodeHash, code);
    container.events.publish({ type: 'telegram.status', accountId: String(req.params.id), status: result.status });
    res.json(result);
  });

  /** 3-qadam (agar 2FA yoqilgan bo'lsa): parol. */
  router.post('/accounts/:id/login/password', requirePermission('telegram.manage'), async (req, res) => {
    await sessiyaAmali(req, 'login/password');
    const { password } = parseBody(passwordSchema, req);
    const result = await telegram.confirmPassword(String(req.params.id), password);
    container.events.publish({ type: 'telegram.status', accountId: String(req.params.id), status: result.status });
    res.json(result);
  });

  /** QR orqali kirish: telefondagi Telegram → Qurilmalar → Qurilma ulash. */
  router.post('/accounts/:id/login/qr', requirePermission('telegram.manage'), async (req, res) => {
    await sessiyaAmali(req, 'login/qr');
    const result = await telegram.startQrLogin(String(req.params.id));
    container.events.publish({ type: 'telegram.status', accountId: String(req.params.id), status: 'awaiting_qr' });
    res.json({ status: result.status, url: result.url, expiresAt: result.expiresAt.toISOString() });
  });

  /** QR oynasi yopildi — tsiklni to'xtatish. */
  router.delete('/accounts/:id/login/qr', requirePermission('telegram.manage'), async (req, res) => {
    await sessiyaAmali(req, 'login/qr bekor');
    const stopped = await telegram.cancelQrLogin(String(req.params.id));
    if (stopped) {
      container.events.publish({ type: 'telegram.status', accountId: String(req.params.id), status: 'logged_out' });
    }
    res.status(204).end();
  });

  /** @SpamBot dan akkaunt cheklanganini so'rash. */
  router.post('/accounts/:id/spam-check', requirePermission('telegram.manage'), async (req, res) => {
    const account = await telegramAccounts.findById(String(req.params.id));
    if (!account) throw new NotFoundError('Telegram akkaunt', String(req.params.id));

    const updated = await container.services.spamWatcher.checkOne(account);
    res.json({ account: serializeTelegramAccount(updated, container.clock.todayIso()) });
  });

  /**
   * Akkauntning cheklovlarini to'liq tekshirish.
   *
   * `/spam-check` dan farqi: bu jonli probe + @SpamBot + bazadagi
   * FLOOD_WAIT/PEER_FLOOD yozuvlarini bitta hisobotga yig'adi.
   */
  router.post('/accounts/:id/check', requirePermission('telegram.manage'), async (req, res) => {
    const id = String(req.params.id);
    const report = await container.services.accountChecker.check(id);
    const account = await telegramAccounts.findById(id);
    if (!account) throw new NotFoundError('Telegram akkaunt', id);

    res.json({
      account: serializeTelegramAccount(account, container.clock.todayIso()),
      report: serializeCheckReport(report),
    });
  });

  /** Hamma yoqilgan akkauntni ketma-ket tekshirish (fon ishi). */
  router.post('/accounts/check-all', requirePermission('telegram.manage'), async (_req, res) => {
    res.json({ progress: container.services.accountChecker.startBulk() });
  });

  /** Ommaviy tekshiruv holati — sahifa shu manzilni so'rab turadi. */
  router.get('/accounts/check-all', async (_req, res) => {
    res.json({ progress: container.services.accountChecker.bulkProgress() });
  });

  /** Mijozlarni akkauntlar bo'yicha teng taqsimlash. */
  router.post('/assign-clients', requirePermission('telegram.manage'), async (req, res) => {
    const user = currentUser(req);
    const summary = await container.services.assigner.assignUnassigned(user.email);
    res.json(summary);
  });

  /** Akkauntning mijozlarini bo'shatib, boshqalarga taqsimlash. */
  router.post('/accounts/:id/reassign-clients', requirePermission('telegram.manage'), async (req, res) => {
    const user = currentUser(req);
    const summary = await container.services.assigner.reassignFrom(String(req.params.id), user.email);
    res.json(summary);
  });

  /** Qaysi akkauntda nechta mijoz bor. */
  router.get('/distribution', async (_req, res) => {
    const [distribution, unassigned, all, runtime] = await Promise.all([
      container.services.assigner.distribution(),
      container.repositories.clients.findUnassigned(100_000),
      telegramAccounts.list(),
      container.settings.get(),
    ]);
    const byId = new Map(all.map((a) => [a.id, a]));
    res.json({
      distribution: distribution.map((d) => ({
        ...d,
        personaName: personaNameOf(byId.get(d.accountId) ?? null, runtime.personaName),
      })),
      unassigned: unassigned.length,
    });
  });

  router.post('/accounts/:id/logout', requirePermission('telegram.manage'), async (req, res) => {
    await sessiyaAmali(req, 'logout');
    const user = currentUser(req);
    await telegram.logout(String(req.params.id));
    await audit.record({
      actor: user.email,
      action: 'telegram.logout',
      entity: 'telegram_account',
      entityId: String(req.params.id),
    });
    res.json({ ok: true });
  });

  /** Premium belgisi: tugash sanasini qo'yish, uzaytirish yoki olib tashlash. */
  router.put('/accounts/:id/premium', requirePermission('telegram.manage'), async (req, res) => {
    const body = parseBody(premiumSchema, req);
    const id = String(req.params.id);
    const before = await telegramAccounts.findById(id);
    if (!before) throw new NotFoundError('Telegram akkaunt', id);

    const until = 'until' in body ? body.until : premiumTugashi(body.boshlanish, body.oy);
    const account = await telegramAccounts.setPremium(id, until);

    await audit.record({
      actor: currentUser(req).email,
      action: 'telegram.premium_changed',
      entity: 'telegram_account',
      entityId: id,
      payload: { before: before.premiumUntil, after: until },
    });

    res.json({ account: serializeTelegramAccount(account, container.clock.todayIso()) });
  });

  router.patch('/accounts/:id', requirePermission('telegram.manage'), async (req, res) => {
    const body = parseBody(updateSchema, req);
    const id = String(req.params.id);
    const before = await telegramAccounts.findById(id);
    if (!before) throw new NotFoundError('Telegram akkaunt', id);
    // Proksi yoki `isEnabled` o'zgarishi qayta ulanishga olib keladi.
    // Faqat kalit NOMLARI: qiymatlar ichida proksi paroli bor.
    await sessiyaAmali(req, `sozlama: ${Object.keys(body).join(', ')}`);

    // Proksi shakli zod'dan o'tdi, endi maydonlararo qoida.
    // `proxy` bazaviy spread'dan chiqarib olinadi: aks holda TS uni
    // shartli spread'ning ikkala shoxobchasida (qo'shilgan/qo'shilmagan)
    // birlashtirib, xom zod tipini `TelegramProxyPatch` bilan aralashtirib
    // yuboradi.
    const { proxy: rawProxy, ...rest } = body;
    const proxyPatch = rawProxy === undefined ? undefined : rawProxy === null ? null : validateProxy(rawProxy);

    // `null` — standart dvigatelga qaytish, tekshirish shart emas.
    // Boshqa qiymatda qatorning haqiqatan bazada borligini tekshiramiz:
    // aks holda akkaunt "OpenAI modeliga o'tdim" deb saqlab qoladi-yu,
    // `AgentEngineFactory` topa olmay jimgina standart yo'lga tushadi —
    // operator buni interfeysdan bilmaydi.
    if (body.llmModelId !== undefined && body.llmModelId !== null) {
      const model = await llmModels.findById(body.llmModelId);
      if (!model) throw new ValidationError(`LLM model topilmadi: ${body.llmModelId}`);
    }

    const patch = {
      ...rest,
      ...(proxyPatch !== undefined && { proxy: proxyPatch }),
    };

    const account = await telegramAccounts.update(id, patch);

    if (body.proxy !== undefined) {
      const user = currentUser(req);
      await audit.record({
        actor: user.email,
        action: 'telegram.proxy_changed',
        entity: 'telegram_account',
        entityId: id,
        // Login va parol jurnalga TUSHMAYDI — jurnal keng o'qiladi.
        payload: {
          before: before.proxy ? `${before.proxy.host}:${before.proxy.port}` : null,
          after: account.proxy ? `${account.proxy.host}:${account.proxy.port}` : null,
        },
      });

      // Bir xil qiymatlar bilan qayta "Saqlash" bosilsa (masalan ikkinchi
      // marta bosish) tunnelni qayta qurishning hojati yo'q — aksincha
      // jonli MTProto ulanishini behuda uzib-ulaydi. LEKIN bu o'tkazib
      // yuborish faqat ISHLAYOTGAN ulanishni himoya qilish uchun: agar
      // akkaunt allaqachon `error` holatida bo'lsa, himoya qiladigan
      // ulanish yo'q. `reconnect()` ni bu yerdan tashqari yana
      // `TelegramConnectionWatcher` ham (har 2 daqiqada, `error`/uzilgan
      // akkauntlarni avtomatik tiklash uchun) chaqiradi — panelda alohida
      // "qayta ulash" tugmasi yo'q. Bu shart operator proksini
      // o'zgartirganda ISHLAYOTGAN ulanishni behuda uzib-ulamaslik uchun
      // kerak; `error` holatidagi akkauntni endi kuzatuvchi ham tikladi,
      // lekin shu yerda ham darhol urinish operatorni 5 daqiqalik
      // kuzatuvchi tsiklini kutishga majburlamaydi.
      if (!proxyUnchanged(before.proxy, proxyPatch ?? null) || before.status === 'error') {
        // Reconnect KUTILMAYDI: u ichida 5 marta 2s oraliq bilan qayta
        // urinadi va har biri 10s SOCKS muddatiga bog'liq — o'lik proksida
        // bu ~58s cho'zilishi mumkin, nginx esa 60s'dan keyin darvoza
        // xatosini qaytaradi, holbuki saqlash o'zi muvaffaqiyatli bo'lgan
        // edi. Panel holatni har 10 soniyada qayta so'raydi va reconnect
        // natijasini (muvaffaqiyat yoki `error`) o'sha yerdan ko'rsatadi —
        // so'rovni bloklash hech narsa qo'shmaydi.
        //
        // `.catch` — faqat kutilmagan rad etishning ushlanmay qolishining
        // oldini olish uchun: `reconnect` o'z ichida SOCKS/ulanish
        // xatolarini allaqachon ushlab, jurnallab, akkauntni `error`
        // holatiga o'tkazadi (`MtprotoTelegramGateway.reconnect`).
        telegram.reconnect(id).catch((err) => {
          log.error({ accountId: id, err }, 'Proksi almashtirilgach reconnect kutilmaganda rad etildi');
        });
      }
    }

    // Uslub almashtirish shu akkauntdagi HAMMA mijozga yuboriladigan
    // ohangni o'zgartiradi (v1/v2 qoidalari butunlay boshqa) — proksi
    // kabi audit jurnaliga tushishi kerak. Qiymat haqiqatan o'zgarganda
    // (masalan qayta "Saqlash" bosilganda emas) yoziladi.
    if (body.styleVersion !== undefined && before.styleVersion !== account.styleVersion) {
      const user = currentUser(req);
      await audit.record({
        actor: user.email,
        action: 'telegram.style_changed',
        entity: 'telegram_account',
        entityId: id,
        payload: {
          before: before.styleVersion,
          after: account.styleVersion,
        },
      });
    }

    // Model biriktirish/uzish ham HAMMA suhbatga ta'sir qiladi — dvigatel
    // (va uning narxi) shu akkauntning barcha keyingi navbatlarida
    // o'zgaradi. Uslub bilan bir xil qoida: faqat haqiqiy o'zgarishda
    // yoziladi.
    if (body.llmModelId !== undefined && before.llmModelId !== account.llmModelId) {
      const user = currentUser(req);
      await audit.record({
        actor: user.email,
        action: 'telegram.llm_changed',
        entity: 'telegram_account',
        entityId: id,
        payload: {
          before: before.llmModelId,
          after: account.llmModelId,
        },
      });
    }

    res.json({ account: serializeTelegramAccount(account, container.clock.todayIso()) });
  });

  /**
   * Proksini SAQLAMASDAN sinab ko'rish.
   *
   * Akkauntdan mustaqil: operator ma'lumotni bazaga tushirmasdan
   * oldin tekshira olsin. Javobda proksining chiqish IP'si bo'ladi —
   * shunchaki tunnel ochilgani IP haqiqatan almashganini isbotlamaydi.
   */
  router.post('/proxy-test', requirePermission('telegram.manage'), async (req, res) => {
    const input = parseBody(proxyTestSchema, req);
    const proxy = validateProxy(input);
    res.json(await probeProxy(proxy));
  });

  /**
   * Kunlik hisoblagichlarni (yangi suhbat VA qidiruv) qo'lda nolga tushirish.
   *
   * Telegramning o'z cheklovlari bundan qaytmaydi — bu faqat bizning ichki
   * hisoblagichimiz. Shuning uchun amal audit jurnaliga yoziladi va ikkala
   * hisoblagichning tozalashdan OLDINGI qiymati ham yozib qo'yiladi: keyin
   * akkaunt cheklanib qolsa, nima sababdan ekanini shu jurnaldan ko'rish
   * mumkin bo'lsin.
   */
  router.post('/accounts/:id/reset-quota', requirePermission('telegram.manage'), async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);
    const before = await telegramAccounts.findById(id);

    const account = await telegramAccounts.resetSentToday(id, container.clock.todayIso());

    await audit.record({
      actor: user.email,
      action: 'telegram.quota_reset',
      entity: 'telegram_account',
      entityId: id,
      payload: {
        sentToday: before?.sentToday ?? null,
        dailyLimit: account.dailyLimit,
        lookupsToday: before?.lookupsToday ?? null,
        lookupLimit: account.lookupLimit,
      },
    });

    res.json({ account: serializeTelegramAccount(account, container.clock.todayIso()) });
  });

  // ─── Akkauntning Telegramdagi yozishmalari (jonli ko'rish) ───────────────
  //
  // Bu ma'lumot bizning bazamizda saqlanmaydi — har so'rovda Telegramning
  // o'zidan olinadi. Shuning uchun sahifa har doim akkauntning haqiqiy
  // holatini ko'rsatadi.

  /**
   * "O'tkazib yuborilgan xabarlarni tiklash".
   *
   * Qayta ulanganda avtomatik ishlaydi, lekin qo'lda ham kerak: uzilish
   * sezilmay qolgan yoki tiklash paytida akkaunt hali ulanmagan bo'lishi
   * mumkin.
   */
  router.post('/accounts/:id/sync-missed', requirePermission('telegram.manage'), async (req, res) => {
    const hours = Number((req.body as { hours?: unknown })?.hours);
    const result = await container.services.missedSync.syncAccount(
      String(req.params.id),
      Number.isFinite(hours) && hours > 0 ? hours : undefined,
    );
    res.json(result);
  });

  router.get('/accounts/:id/dialogs', requirePermission('telegram.inbox'), async (req, res) => {
    const { limit } = parseQuery(dialogsQuery, req);
    const dialogs = await telegram.listDialogs(String(req.params.id), { limit });
    res.json({ items: dialogs });
  });

  router.get('/accounts/:id/history', requirePermission('telegram.inbox'), async (req, res) => {
    const q = parseQuery(historyQuery, req);
    const messages = await telegram.getHistory(
      String(req.params.id),
      { peerId: q.peerId, accessHash: q.accessHash ?? null, kind: q.kind },
      { limit: q.limit, offsetId: q.offsetId },
    );
    res.json({ items: messages });
  });

  router.delete('/accounts/:id', requirePermission('telegram.manage'), async (req, res) => {
    const user = currentUser(req);
    await telegram.logout(String(req.params.id)).catch(() => undefined);
    await telegramAccounts.remove(String(req.params.id));
    await audit.record({
      actor: user.email,
      action: 'telegram.account_removed',
      entity: 'telegram_account',
      entityId: String(req.params.id),
    });
    res.json({ ok: true });
  });

  return router;
}
