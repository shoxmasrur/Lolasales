import { Router } from 'express';
import type { Container } from '@/composition/container';
import { config } from '@/shared/config';
import { XARID_BOSQICHLARI, type XaridBosqichi } from '@/domain/entities/Purchase';
import { voronka } from '@/domain/services/voronka';

export function statsRoutes(container: Container): Router {
  const router = Router();

  /**
   * Sotuv paneli: voronka, bugungi mijozlar va to'lovlar, navbatdagi cheklar.
   * Eski maydonlar (funnel, newClientsToday, paymentsToday, receiptsPending) XulosaBoti uchun saqlangan;
   * ularga `voronka`, `bugunManbalar`, `bugunTolovlar`, `navbatdagiCheklar` qo'shiladi.
   */
  router.get('/dashboard', async (_req, res) => {
    const stats = await container.repositories.stats.dashboard(container.clock.todayIso(), config.TIMEZONE);
    const counts = Object.fromEntries(XARID_BOSQICHLARI.map((s) => [s, 0])) as Record<XaridBosqichi, number>;
    for (const f of stats.funnel) if (f.stage in counts) counts[f.stage as XaridBosqichi] = f.count;
    res.json({
      stats: {
        ...stats,
        voronka: voronka(counts),
        bugunManbalar: Object.fromEntries(stats.newClientsToday.map((r) => [r.source, r.count])),
        bugunTolovlar: { soni: stats.paymentsToday.count, summa: stats.paymentsToday.amount },
        navbatdagiCheklar: stats.receiptsPending,
      },
    });
  });

  /** Admin ko'rishi kerak bo'lgan ochiq cheklar (shubhalilar birinchi). */
  router.get('/pending-receipts', async (_req, res) => {
    res.json({ items: await container.repositories.hamyon.tekshirishKeraklar() });
  });

  return router;
}
