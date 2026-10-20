import { Router } from 'express';
import { SUKUT_MAX_URINISH } from '@/domain/services/qaytaAloqa';
import type { Container } from '@/composition/container';
import { qamrov } from '@/presentation/http/middleware/qamrov';
import { config } from '@/shared/config';

/**
 * Qayta aloqa ro'yxati — `/api/recontact` ostida (dizayn 3-bo'lim).
 *
 * Ruxsat mount darajasida (`clients.view`). Ro'yxat har safar bazadan
 * hisoblanadi: chegara (`minDebt`) va avtomatika sonini (`SUKUT_MAX_URINISH`)
 * operator dashboarddan o'zgartiradi, shuning uchun ular har so'rovda
 * `RuntimeSettings` dan o'qiladi — kuzatuvchilar ishlatayotgan qiymat bilan
 * bir xil bo'lsin.
 */
export function recontactListRoutes(container: Container): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { minDebt } = await container.settings.get();
    const items = await container.repositories.recontactList.list(
      { minDebt, silenceNudgeMax: SUKUT_MAX_URINISH, timeZone: config.TIMEZONE },
      // Obyekt cheklovi: cheklanganga faqat qamrovdagi mijozlarning suhbatlari.
      qamrov(req),
    );
    res.json({ items });
  });

  return router;
}
