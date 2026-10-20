import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { can } from '@/domain/entities/User';
import { parseBody, parseQuery } from '@/presentation/http/middleware/validate';

/**
 * Kanal izohlaridan mijoz olish (Guruhlar sahifasi).
 *
 * Mount darajasida `comments.view`; leadga aylantirish `comments.import`.
 * Bu yo'llarning hech biri kanal yoki guruhga yozmaydi.
 */
const accountQuery = z.object({ accountId: z.string().uuid() });

const kanalId = z.string().regex(/^\d{1,20}$/, 'Kanal identifikatori noto\'g\'ri');
const kunlar = z.coerce.number().int().min(1).max(365);

const postsQuery = z.object({
  accountId: z.string().uuid(),
  channelId: kanalId,
  sinceDays: kunlar.optional(),
});

const fetchSchema = z.object({
  accountId: z.string().uuid(),
  channelId: kanalId,
  postIds: z.union([z.literal('all'), z.array(z.number().int().positive()).min(1).max(200)]),
  sinceDays: z.number().int().min(1).max(365).nullable().optional(),
  filtrsiz: z.boolean().optional(),
});

const leadsSchema = z.object({
  accountId: z.string().uuid(),
  channelTitle: z.string().trim().min(1).max(200),
  items: z
    .array(
      z.object({
        peer: z.object({
          telegramUserId: z.string().regex(/^\d{1,20}$/),
          // Hash'siz odamga shaxsiy xabar yozib bo'lmaydi — qabul qilinmaydi.
          accessHash: z.string().min(1).max(40),
          username: z.string().max(64).nullable(),
          firstName: z.string().max(200).nullable(),
          lastName: z.string().max(200).nullable(),
        }),
        fullName: z.string().max(300),
        text: z.string().max(4096),
      }),
    )
    .min(1)
    .max(2000),
});

export function commentRoutes(container: Container): Router {
  const router = Router();
  const yiguvchi = container.services.izohYiguvchi;

  router.get('/channels', async (req, res) => {
    const { accountId } = parseQuery(accountQuery, req);
    res.json({ items: await yiguvchi.kanallar(accountId) });
  });

  router.get('/posts', async (req, res) => {
    const q = parseQuery(postsQuery, req);
    res.json({ items: await yiguvchi.postlar(q.accountId, q.channelId, q.sinceDays ?? null) });
  });

  router.post('/fetch', async (req, res) => {
    const b = parseBody(fetchSchema, req);
    res.json(await yiguvchi.kommentlar(b.accountId, b.channelId, b.postIds, b.sinceDays ?? null, b.filtrsiz ?? false));
  });

  router.post('/to-leads', requirePermission('comments.import'), async (req, res) => {
    const user = currentUser(req);
    const b = parseBody(leadsSchema, req);
    // Kampaniya (mijozlarga birinchi xabar) — alohida huquq: `comments.import`
    // bor, `campaigns.create` yo'q foydalanuvchi faqat mijoz qo'sha oladi.
    res.json(await yiguvchi.mijozQil(b.accountId, b.channelTitle, b.items, user.email, user.id, can(user, 'campaigns.create')));
  });

  return router;
}
