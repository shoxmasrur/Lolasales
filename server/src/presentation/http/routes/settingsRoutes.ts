import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseBody } from '@/presentation/http/middleware/validate';
import { config } from '@/shared/config';
import { ValidationError } from '@/shared/errors';

const updateSchema = z.object({
  dailyLimit: z.number().int().min(1).max(200).optional(),
  minDelaySec: z.number().int().min(5).max(3600).optional(),
  maxDelaySec: z.number().int().min(5).max(7200).optional(),
  windowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  windowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  // Bo'sh ro'yxat `ishKunimi`/`evaluateWindow` uchun "1-6" sukutiga
  // tushadi, lekin operator ekranda "hech qanday kun tanlanmagan" deb
  // ko'radi — ikkalasi ziddiyatli. Shu chalkashlikni bazaga umuman
  // yozdirmaymiz: kamida bitta kun bo'lishi shart.
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).optional(),
  killSwitch: z.boolean().optional(),
  agentAutoReply: z.boolean().optional(),
  personaName: z.string().min(2).max(40).optional(),
  promiseReminder: z.boolean().optional(),
  promiseReminderUntil: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  promiseThanksUntil: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  eslatmaYoqilgan: z.boolean().optional(),
  // 1 soatdan 7 kungacha: undan ko'pi eslatma emas, yangi murojaat bo'lib tuyuladi.
  eslatmaSoat: z.number().int().min(1).max(168).optional(),
  // Akkaunt navbatidagi tanaffus. Yuqori chegara ataylab past (5 daqiqa):
  // undan katta qiymat kampaniyani amalda to'xtatib qo'yadi.
  gateMessageMinSec: z.number().int().min(0).max(300).optional(),
  gateMessageMaxSec: z.number().int().min(0).max(300).optional(),
  gateOtherMinSec: z.number().int().min(0).max(300).optional(),
  gateOtherMaxSec: z.number().int().min(0).max(300).optional(),
  // Minimal qarzdorlik chegarasi. Yuqori chegara 10 mln: undan katta
  // qiymat oylik to'lovdan oshib ketadi va butun kampaniyani jimgina
  // o'chirib qo'yardi.
  minDebt: z.number().int().min(0).max(10_000_000).optional(),
  paymentCards: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        number: z.string().regex(/^\d{16}$/),
        holder: z.string().trim().min(1).max(80),
        bank: z.string().trim().min(1).max(80),
        active: z.boolean(),
      }),
    )
    .max(20)
    .optional(),
  kompaniyaNomi: z.string().trim().min(1).max(80).optional(),
});

// Token uzunligi cheklanadi: bazaga tasodifan butun fayl yopishtirilmasin.
// Pastki chegara YO'Q — domendagi `tokenXatosi` o'zbekcha aniq xato beradi,
// zod bilan qisqa qiymatni bu yerda tutib qolsak, o'sha matn yashirinardi.
const botTokenSchema = z.object({ token: z.string().max(200) });

export function settingsRoutes(container: Container): Router {
  const router = Router();

  router.get('/', requirePermission('settings.view'), async (_req, res) => {
    res.json({ settings: await container.settings.get() });
  });

  router.patch('/', requirePermission('settings.edit'), async (req, res) => {
    const user = currentUser(req);
    const patch = parseBody(updateSchema, req);
    const settings = await container.settings.update(patch, user.id);

    await container.repositories.audit.record({
      actor: user.email,
      action: 'settings.updated',
      entity: 'settings',
      entityId: 'outreach',
      // To'liq karta raqami auditga tushmaydi — faqat oxirgi 4 raqam.
      payload: patch.paymentCards
        ? { ...patch, paymentCards: patch.paymentCards.map((c) => ({ ...c, number: `****${c.number.slice(-4)}` })) }
        : patch,
    });

    res.json({ settings });
  });

  /** Barcha yuborishni darhol to'xtatish / qayta yoqish. */
  router.post('/kill-switch', requirePermission('settings.kill_switch'), async (req, res) => {
    const user = currentUser(req);
    const on = Boolean((req.body as { on?: boolean })?.on);
    const settings = await container.settings.update({ killSwitch: on }, user.id);

    await container.repositories.audit.record({
      actor: user.email,
      action: on ? 'kill_switch.on' : 'kill_switch.off',
      entity: 'settings',
      entityId: 'outreach',
    });

    res.json({ settings });
  });

  // ─── Kunlik xulosa boti ────────────────────────────────────────────────
  //
  // Token JAVOBDA hech qachon qaytmaydi — faqat holat. Sahifa uni
  // ko'rsatmaydi ham: o'zgartirish kerak bo'lsa, yangisi kiritiladi.

  router.get('/digest-bot', requirePermission('settings.view'), async (_req, res) => {
    res.json(await container.services.xulosaBoti.holat());
  });

  router.put('/digest-bot', requirePermission('settings.edit'), async (req, res) => {
    const user = currentUser(req);
    const { token } = parseBody(botTokenSchema, req);
    const holat = await container.services.xulosaBoti.tokenSaqla(token, user.id);

    await container.repositories.audit.record({
      actor: user.email,
      action: 'digest_bot.token_saved',
      entity: 'settings',
      entityId: 'daily_digest_bot',
      // Token EMAS — faqat bot nomi.
      payload: { botUsername: holat.botUsername },
    });

    res.json(holat);
  });

  router.post('/digest-bot/code', requirePermission('settings.edit'), async (req, res) => {
    const user = currentUser(req);
    const natija = await container.services.xulosaBoti.kodBoshla(user.id);

    await container.repositories.audit.record({
      actor: user.email,
      action: 'digest_bot.code_issued',
      entity: 'settings',
      entityId: 'daily_digest_bot',
    });

    res.json(natija);
  });

  router.post('/digest-bot/link', requirePermission('settings.edit'), async (req, res) => {
    const user = currentUser(req);
    const holat = await container.services.xulosaBoti.chatUla(user.id);

    await container.repositories.audit.record({
      actor: user.email,
      action: 'digest_bot.chat_linked',
      entity: 'settings',
      entityId: 'daily_digest_bot',
      payload: { chatNomi: holat.chatNomi, chatId: holat.chatId },
    });

    res.json(holat);
  });

  router.post('/digest-bot/test', requirePermission('settings.edit'), async (req, res) => {
    const user = currentUser(req);
    await container.services.xulosaBoti.sinovYubor();

    await container.repositories.audit.record({
      actor: user.email,
      action: 'digest_bot.test_sent',
      entity: 'settings',
      entityId: 'daily_digest_bot',
    });

    res.json({ yuborildi: true });
  });

  router.delete('/digest-bot', requirePermission('settings.edit'), async (req, res) => {
    const user = currentUser(req);
    await container.services.xulosaBoti.tozala(user.id);

    await container.repositories.audit.record({
      actor: user.email,
      action: 'digest_bot.cleared',
      entity: 'settings',
      entityId: 'daily_digest_bot',
    });

    res.json(await container.services.xulosaBoti.holat());
  });

  router.get('/audit', requirePermission('audit.view'), async (req, res) => {
    const page = await container.repositories.audit.list({
      limit: Number(req.query.limit ?? 100),
      offset: Number(req.query.offset ?? 0),
      entity: req.query.entity ? String(req.query.entity) : undefined,
      entityId: req.query.entityId ? String(req.query.entityId) : undefined,
    });
    res.json(page);
  });

  return router;
}
