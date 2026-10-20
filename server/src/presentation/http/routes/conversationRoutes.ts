import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseBody, parseQuery } from '@/presentation/http/middleware/validate';
import { config } from '@/shared/config';
import { canReply } from '@/domain/entities/TelegramAccount';
import { chekTekshiruviFaolmi, type PaymentCheck } from '@/domain/entities/PaymentCheck';
import { kutilganChekSummasi } from '@/domain/services/karta';
import { KARTA_KUTILADI_SABABLARI } from '@/application/services/KartaYuboruvchi';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { CONVERSATION_STATES, type ConversationState } from '@/domain/entities/Conversation';

// Telegramning o'z chegarasi 2 GB, lekin dashboard uchun MEDIA_MAX_MB yetarli.
const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MEDIA_MAX_MB * 1024 * 1024 },
});

const listQuery = z.object({
  search: z.string().optional(),
  state: z.enum(CONVERSATION_STATES as [ConversationState, ...ConversationState[]]).optional(),
  needsHuman: z.enum(['true', 'false']).optional(),
  unreadOnly: z.enum(['true', 'false']).optional(),
  blocked: z.enum(['true', 'false']).optional(),
  receiptPending: z.enum(['true', 'false']).optional(),
  telegramAccountId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const receiptConfirmSchema = z.object({
  /** Chekdagi summa, so'm. */
  amount: z.number().int().positive().max(1_000_000_000),
});

const receiptRejectSchema = z.object({
  reason: z.string().trim().min(1).max(300),
});

const resetSchema = z.object({
  /** Kampaniya nishonlarini ham "pending" ga qaytarish (qayta yuborish uchun). */
  resetCampaigns: z.boolean().default(false),
});

const sendSchema = z.object({
  body: z.string().min(1, 'Xabar bo\'sh').max(4000, 'Xabar juda uzun'),
  draftMessageId: z.string().uuid().nullable().optional(),
  disableAgent: z.boolean().optional(),
});

const instructSchema = z.object({
  instruction: z.string().trim().min(1, 'Topshiriq bo\'sh').max(1000, 'Topshiriq juda uzun'),
});

const editMessageSchema = z.object({
  body: z.string().min(1, 'Xabar bo\'sh').max(4000, 'Xabar juda uzun'),
});

const patchSchema = z.object({
  state: z.enum(CONVERSATION_STATES as [ConversationState, ...ConversationState[]]).optional(),
  agentEnabled: z.boolean().optional(),
  needsHuman: z.boolean().optional(),
  humanReason: z.string().nullable().optional(),
  /**
   * Suhbatni qaysi Telegram akkauntdan davom ettirish.
   *
   * Odatda o'zgarmaydi ("bitta mijoz — bitta akkaunt"), lekin akkaunt
   * o'chirilgan yoki bloklangan bo'lsa suhbat akkauntsiz qolib ketadi va
   * boshqa yo'l bilan tuzatib bo'lmaydi. Operator ongli ravishda tanlaydi.
   */
  telegramAccountId: z.string().uuid().optional(),
});

export function conversationRoutes(container: Container): Router {
  const router = Router();
  const { conversations, messages, clients, audit, paymentChecks } = container.repositories;

  /** Chek tasdig'i oynasidagi standart summa — chek bog'langan (yo'q bo'lsa faol) xariddan. */
  const kutilganSumma = async (check: PaymentCheck): Promise<number | null> => {
    const { purchases, courses } = container.repositories;
    const xarid =
      (check.purchaseId ? await purchases.findById(check.purchaseId) : null) ??
      (await purchases.findActiveByClient(check.clientId));
    if (!xarid) return null;
    const course = xarid.courseId ? await courses.findById(xarid.courseId) : null;
    return kutilganChekSummasi(course, xarid);
  };

  /**
   * Barcha yozishmalarni tozalab, sinovni noldan boshlash.
   *
   * `/:id` yo'llaridan OLDIN turishi shart — aks holda "reset" suhbat id'si
   * sifatida o'qiladi.
   */
  router.post('/reset', requirePermission('conversations.reset'), async (req, res) => {
    const user = currentUser(req);
    const { resetCampaigns } = parseBody(resetSchema, req);

    const summary = await conversations.resetAll({ resetCampaigns });

    await audit.record({
      actor: user.email,
      action: 'conversations.reset',
      entity: 'conversation',
      entityId: null,
      payload: { ...summary, resetCampaigns },
    });

    container.events.publish({ type: 'stats.invalidate' });

    res.json({ summary });
  });

  router.get('/', async (req, res) => {
    const q = parseQuery(listQuery, req);
    const page = await conversations.list({
      search: q.search,
      state: q.state,
      needsHuman: q.needsHuman === 'true' ? true : undefined,
      unreadOnly: q.unreadOnly === 'true' ? true : undefined,
      blocked: q.blocked === 'true' ? true : undefined,
      receiptPending: q.receiptPending === 'true' ? true : undefined,
      telegramAccountId: q.telegramAccountId,
      clientId: q.clientId,
      limit: q.limit,
      offset: q.offset,
    });
    res.json(page);
  });

  // DIQQAT: `/:id` dan OLDIN turishi shart — aks holda "filters" so'zi
  // suhbat id'si deb qabul qilinadi va so'rov 404 bilan tugaydi.
  //
  // Alohida endpoint kerak, chunki akkauntlar ro'yxati `/telegram/accounts`
  // da turadi va u `telegram.view` ruxsatini talab qiladi — faqat suhbatlar
  // bilan ishlaydigan operatorda bunday ruxsat bo'lmasligi mumkin.
  router.get('/filters', async (_req, res) => {
    res.json(await conversations.filterOptions());
  });

  /**
   * "Tasdiqlash" — menejer chekdagi summani kiritdi. Summa xaridga qo'shiladi,
   * bosqich `qisman_toladi`/`toladi`, agent rahmat aytadi va kurs qoidasi
   * bajarilsa tizim guruh havolasini yuboradi.
   */
  router.post('/:id/receipt-confirm', requirePermission('receipts.confirm'), async (req, res) => {
    const user = currentUser(req);
    const { amount } = parseBody(receiptConfirmSchema, req);
    const outcome = await container.services.paymentCheckService.confirmReceipt(String(req.params.id), user.email, amount);
    if (outcome.kind === 'no_review') {
      res.status(409).json(outcome);
      return;
    }
    res.json(outcome);
  });

  /** "Rad etish" — menejer sababni yozadi, agent shunga tayanib qayta chek so'raydi. */
  router.post('/:id/receipt-reject', requirePermission('receipts.confirm'), async (req, res) => {
    const user = currentUser(req);
    const { reason } = parseBody(receiptRejectSchema, req);
    const outcome = await container.services.paymentCheckService.rejectReceipt(String(req.params.id), user.email, reason);
    if (outcome.kind === 'no_review') {
      res.status(409).json(outcome);
      return;
    }
    res.json(outcome);
  });

  /**
   * "Chek emas" — rasm/fayl to'lov cheki emas. Tekshiruv yopiladi, chek
   * eskalatsiyasi yechiladi, bosqich chekdan oldingisiga qaytadi; mijozga
   * hech narsa yozilmaydi.
   */
  router.post('/:id/receipt-dismiss', requirePermission('receipts.confirm'), async (req, res) => {
    const user = currentUser(req);
    const outcome = await container.services.paymentCheckService.dismissReceipt(String(req.params.id), user.email);
    if (outcome.kind === 'no_review') {
      res.status(409).json(outcome);
      return;
    }
    res.json(outcome);
  });

  /**
   * "Kartani yuborish" — agent "mana karta" degan, lekin karta tizimdan
   * ketmagan (qo'lda tasdiqlash rejimi, takror himoyasi, kurs yo'q) yoki
   * mijoz qiziqib turibdi. Kartani tizim Sozlamalardagi aniq qiymatdan
   * yuboradi; yuborib bo'lmasa sabab tanada (`kurs_yoq`/`karta_yoq`/…).
   * Yuborish oynasi tekshirilmaydi — bu menejer amali.
   */
  router.post('/:id/send-card', requirePermission('receipts.confirm'), async (req, res) => {
    const id = String(req.params.id);
    const conversation = await conversations.findById(id);
    if (!conversation) throw new NotFoundError('Suhbat', id);
    let javob: { kind: 'sent' } | { kind: 'not_sent'; reason: string } | { kind: 'failed'; reason: string };
    try {
      const natija = await container.services.kartaYuboruvchi.yubor(id, conversation.clientId);
      javob = natija.sent ? { kind: 'sent' } : { kind: 'not_sent', reason: natija.reason };
    } catch (err) {
      // Kill switch, akkaunt limiti yoki Telegram xatosi — tugma qayta bosilishi mumkin.
      javob = { kind: 'failed', reason: err instanceof Error ? err.message : 'noma\'lum xato' };
    }
    await container.repositories.audit.record({
      actor: currentUser(req).email,
      action: 'card.manual_send',
      entity: 'conversation',
      entityId: id,
      payload: javob,
    });
    res.json(javob);
  });

  /**
   * "Havolani yuborish" — avtomatik yuborish yiqilgan bo'lsa. Kurs qoidasi
   * va "bir marta" belgisi servisda qaytadan tekshiriladi.
   */
  router.post('/:id/send-link', requirePermission('receipts.confirm'), async (req, res) => {
    const user = currentUser(req);
    const outcome = await container.services.paymentCheckService.sendLink(String(req.params.id), user.email);
    // Natija turi (sent / already_sent / not_eligible / no_link / failed) tanada — UI shuni ko'rsatadi.
    res.json(outcome);
  });

  router.get('/:id', async (req, res) => {
    const id = String(req.params.id);
    const conversation = await conversations.findById(id);
    if (!conversation) throw new NotFoundError('Suhbat', id);

    const { purchases } = container.repositories;
    const [client, purchase, allAccounts, openCheck] = await Promise.all([
      clients.findById(conversation.clientId),
      purchases
        .findActiveByClient(conversation.clientId)
        .then(async (p) => p ?? (await purchases.findLatestByClient(conversation.clientId))),
      container.repositories.telegramAccounts.list(),
      paymentChecks.findOpenByConversation(id),
    ]);
    // "Havolani yuborish" tugmasi: qoida bajarilgan, havola bor, lekin hali ketmagan.
    const linkPending = await container.services.paymentCheckService.havolaKutyaptimi(conversation.clientId);

    // Suhbatni davom ettirish uchun tanlash mumkin bo'lgan akkauntlar.
    // Faqat id va yorliq beriladi — sessiya va api_hash hech qachon
    // API orqali chiqmaydi.
    const now = container.clock.now();
    const accountOptions = allAccounts
      .filter((a) => canReply(a, now))
      .map((a) => ({ id: a.id, label: a.label, phone: a.phone }));

    res.json({
      conversation,
      client,
      purchase,
      accountOptions,
      // Ochiq chek tekshiruvi — "Tasdiqlash"/"Rad etish" tugmalari shunga qarab
      // ko'rinadi. `aniqlanmagan` ham kiradi: operator uni chek deb topishi mumkin.
      // Muddati o'tgan (tugmasiz qolib ketgan) tekshiruvda tugma yashiriladi.
      receiptReview:
        openCheck && chekTekshiruviFaolmi(openCheck, container.clock.now())
          ? {
              id: openCheck.id,
              messageId: openCheck.messageId,
              createdAt: openCheck.createdAt,
              expectedAmount: await kutilganSumma(openCheck),
            }
          : null,
      linkPending,
      // "Kartani yuborish" tugmasi: suhbat karta kutib menejerda yoki mijoz qiziqib turibdi.
      cardPending:
        (conversation.needsHuman && !!conversation.humanReason && KARTA_KUTILADI_SABABLARI.includes(conversation.humanReason)) ||
        purchase?.stage === 'qiziqdi',
    });
  });

  router.get('/:id/messages', async (req, res) => {
    const id = String(req.params.id);
    const limit = Number(req.query.limit ?? 100);
    const offset = Number(req.query.offset ?? 0);
    const page = await messages.listByConversation(id, { limit, offset });
    res.json(page);
  });

  router.post('/:id/messages', requirePermission('conversations.send'), async (req, res) => {
    const user = currentUser(req);
    const payload = parseBody(sendSchema, req);

    const message = await container.useCases.sendManual.execute({
      conversationId: String(req.params.id),
      body: payload.body,
      userId: user.id,
      userEmail: user.email,
      draftMessageId: payload.draftMessageId ?? null,
      disableAgent: payload.disableAgent,
    });

    res.status(201).json({ message });
  });

  router.patch(
    '/:id/messages/:messageId',
    requirePermission('conversations.edit_message'),
    async (req, res) => {
      const user = currentUser(req);
      const payload = parseBody(editMessageSchema, req);

      const message = await container.useCases.editMessage.execute({
        conversationId: String(req.params.id),
        messageId: String(req.params.messageId),
        body: payload.body,
        userId: user.id,
        userEmail: user.email,
      });

      res.json({ message });
    },
  );

  router.delete(
    '/:id/messages/:messageId',
    requirePermission('conversations.delete_message'),
    async (req, res) => {
      const user = currentUser(req);

      const message = await container.useCases.deleteMessage.execute({
        conversationId: String(req.params.id),
        messageId: String(req.params.messageId),
        userId: user.id,
        userEmail: user.email,
      });

      res.json({ message });
    },
  );

  /** Operator rasm/fayl yuboradi (izoh bilan yoki izohsiz). */
  router.post(
    '/:id/media',
    requirePermission('conversations.send'),
    uploadMedia.single('file'),
    async (req, res) => {
      const user = currentUser(req);
      const file = req.file;
      if (!file) throw new ValidationError('Fayl yuborilmadi');

      const conversation = await conversations.findById(String(req.params.id));
      if (!conversation) throw new NotFoundError('Suhbat', String(req.params.id));

      const body = req.body as { caption?: string; asDocument?: string };

      const message = await container.services.dispatcher.sendMedia({
        conversation,
        data: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype || null,
        caption: (body.caption ?? '').slice(0, 1024),
        author: 'human',
        authorUserId: user.id,
        asDocument: body.asDocument === 'true',
      });

      if (conversation.needsHuman) {
        await conversations.update(conversation.id, { needsHuman: false, humanReason: null });
      }

      await container.repositories.audit.record({
        actor: user.email,
        action: 'message.media_sent',
        entity: 'conversation',
        entityId: conversation.id,
        payload: { fileName: file.originalname, bytes: file.size },
      });

      res.status(201).json({ message });
    },
  );

  /**
   * Operator suhbatni ochdi — dashboardda hisoblagich nolga tushadi va
   * mijozning Telegramida ham "o'qildi" belgisi qo'yiladi.
   */
  router.post('/:id/read', async (req, res) => {
    const id = String(req.params.id);
    await conversations.markRead(id);

    const conversation = await conversations.findById(id);
    if (conversation) {
      await container.services.dispatcher.markReadInTelegram(conversation);
    }

    container.events.publish({ type: 'conversation.updated', conversationId: id });
    res.json({ ok: true });
  });

  router.patch('/:id', requirePermission('conversations.manage'), async (req, res) => {
    const user = currentUser(req);
    const patch = parseBody(patchSchema, req);

    // Akkaunt almashtirilayotgan bo'lsa — u haqiqatan yoza olishini
    // tekshiramiz. Aks holda suhbat bir xatodan ikkinchisiga ko'chardi:
    // "akkaunt tanlanmagan" o'rniga "akkaunt yubora olmaydi".
    if (patch.telegramAccountId) {
      const account = await container.repositories.telegramAccounts.findById(patch.telegramAccountId);
      if (!account) throw new NotFoundError('Telegram akkaunt', patch.telegramAccountId);
      if (!canReply(account, container.clock.now())) {
        throw new ValidationError(
          `"${account.label}" akkaunti hozir yoza olmaydi — ulanmagan, o'chirilgan yoki cheklangan.`,
        );
      }
    }

    const updated = await conversations.update(String(req.params.id), patch);

    // Yopilgan suhbatda ochiq to'lov tekshiruvi qolmasin: chek tekshiruvini
    // endi hech kim tugma bilan yopmaydi, u esa eslatma va agent qoidalariga
    // ta'sir qilib turardi.
    if (patch.state === 'closed') {
      await container.services.paymentCheckService.cancel(updated.id);
    }

    // Agent AYNAN SHU PATCH bilan o'chirilayotgan bo'lsa, ketayotgan
    // navbatni ham uzamiz: bayroqning o'zi faqat KEYINGI navbatni
    // to'xtatadi, hozir yozilayotgan javob esa tugab, mijozga ketardi —
    // operator tugmani bosgan bo'lsa ham.
    //
    // `=== false` ataylab: bu endpoint boshqa maydonlarni ham yangilaydi va
    // `undefined` (agentga tegilmagan) uzishga sabab bo'lmasligi kerak.
    //
    // Tartib muhim — uzish bazaga YOZGANDAN KEYIN: uzilgan navbat biror
    // joyda qayta urinilsa, u allaqachon `false` bo'lgan bayroqni o'qiydi
    // va o'zi to'xtaydi. Teskarisida oraliqda boshlangan navbat eski
    // `true` ni ko'rib davom etardi.
    if (patch.agentEnabled === false) {
      container.services.agent.abort(updated.id);
    }

    await container.repositories.audit.record({
      actor: user.email,
      action: 'conversation.updated',
      entity: 'conversation',
      entityId: updated.id,
      payload: patch,
    });

    container.events.publish({ type: 'conversation.updated', conversationId: updated.id });
    res.json({ conversation: updated });
  });

  /**
   * Agent texnik xatodan keyin to'xtab qolgan suhbatni davom ettirish.
   *
   * Eski `/agent-reply` shu yerda edi, lekin u `needsHuman` holatida jim
   * qolardi (`canAgentReply` false qaytaradi) — ya'ni aynan kerak paytda
   * ishlamasdi va UI'da umuman ishlatilmagan.
   */
  router.post('/:id/agent-retry', requirePermission('conversations.agent_toggle'), async (req, res) => {
    const user = currentUser(req);
    const result = await container.useCases.retryAgentTurn.execute({
      conversationId: String(req.params.id),
      userEmail: user.email,
    });
    res.json(result);
  });

  /**
   * Agentga topshiriq: mavzuni operator yozadi, xabarni agent tuzib yuboradi
   * va suhbatni davom ettiradi. Ruxsat "Qayta urinish" bilan bir xil —
   * tugma suhbatni agentga qaytaradi va agentni yoqadi.
   */
  router.post(
    '/:id/agent-instruction',
    requirePermission('conversations.agent_toggle'),
    async (req, res) => {
      const user = currentUser(req);
      const payload = parseBody(instructSchema, req);
      const result = await container.useCases.instructAgent.execute({
        conversationId: String(req.params.id),
        instruction: payload.instruction,
        userId: user.id,
        userEmail: user.email,
      });
      res.json(result);
    },
  );

  return router;
}
