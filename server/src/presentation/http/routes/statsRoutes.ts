import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { parseQuery } from '@/presentation/http/middleware/validate';
import { qamrov } from '@/presentation/http/middleware/qamrov';
import { PRESET_KEYS, presetRange, type PresetKey } from '@/domain/services/davrOraligi';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const rangeQuery = z.object({
  preset: z.enum(PRESET_KEYS as [PresetKey, ...PresetKey[]]).optional(),
  from: z.string().regex(ISO_DATE, 'Sana YYYY-MM-DD ko\'rinishida').optional(),
  to: z.string().regex(ISO_DATE, 'Sana YYYY-MM-DD ko\'rinishida').optional(),
});

/**
 * Obyekt cheklovi: har bir raqam so'rovchining qamrovidagi mijozlardan
 * hisoblanadi (cheklanmaganda SQL avvalgidek).
 */
export function statsRoutes(container: Container): Router {
  const router = Router();

  router.get('/dashboard', async (req, res) => {
    const stats = await container.repositories.stats.dashboard(container.clock.todayIso(), qamrov(req));
    res.json({ stats });
  });

  /**
   * Davr bo'yicha statistika — bosh sahifadagi sana filtri uchun.
   *
   * Sana bo'lmasa joriy oy olinadi: bosh sahifa birinchi ochilganda ham
   * ma'noli raqam ko'rsatishi kerak.
   */
  router.get('/period', async (req, res) => {
    const q = parseQuery(rangeQuery, req);

    // Tayyor davr nomi berilsa — sanani SERVER hisoblaydi. Aniq sanalar
    // faqat "o'z oralig'i" uchun keladi.
    const range =
      q.from && q.to
        ? { from: q.from, to: q.to }
        : presetRange(q.preset ?? 'this_month', container.clock.now());

    res.json(await container.repositories.stats.period(range.from, range.to, qamrov(req)));
  });

  router.get('/promises', async (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const page = await container.repositories.promises.list({
      status: status as never,
      limit: Number(req.query.limit ?? 50),
      offset: Number(req.query.offset ?? 0),
    }, qamrov(req));
    res.json(page);
  });

  return router;
}
