import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { parseQuery } from '@/presentation/http/middleware/validate';

const listQuery = z.object({
  /**
   * `all` — ogohlantirish va xato (Telegram izi ko'rinmaydi);
   * `error` — faqat xatolar, shu jumladan Telegram xatolari;
   * `telegram` — faqat Telegram audit izi, to'liq.
   */
  level: z.enum(['all', 'error', 'telegram']).default('all'),
  q: z.string().trim().max(200).optional(),
  beforeId: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/**
 * Tizim jurnali. Mount darajasida `logs.view` talab qilinadi
 * (`createApp.ts`), shuning uchun bu yerda qayta tekshirilmaydi.
 */
export function logRoutes(container: Container): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const q = parseQuery(listQuery, req);
    const items = await container.repositories.appLog.list({
      level: q.level === 'error' ? 'error' : undefined,
      flag: q.level === 'telegram' ? 'telegram' : undefined,
      q: q.q,
      beforeId: q.beforeId,
      limit: q.limit,
    });
    res.json({ items });
  });

  return router;
}
