import { Router } from 'express';
import type { Container } from '@/composition/container';
import { config } from '@/shared/config';

export function statsRoutes(container: Container): Router {
  const router = Router();

  /** Sotuv paneli: voronka, bugungi mijozlar va to'lovlar, navbatdagi cheklar. */
  router.get('/dashboard', async (_req, res) => {
    const stats = await container.repositories.stats.dashboard(container.clock.todayIso(), config.TIMEZONE);
    res.json({ stats });
  });

  return router;
}
