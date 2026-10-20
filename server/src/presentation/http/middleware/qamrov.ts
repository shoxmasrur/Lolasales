import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { qamrovOl, type MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import { currentUser } from '@/presentation/http/middleware/auth';
import { AppError } from '@/shared/errors';

/** So'rov egasining mijoz qamrovi (obyekt cheklovi). */
export function qamrov(req: Request): MijozQamrovi {
  const user = currentUser(req);
  return qamrovOl({ objects: user.objects, roleKey: user.role.key });
}

/**
 * Obyekt bo'yicha cheklangan foydalanuvchiga butunlay yopiq bo'limlar
 * uchun (403 `OBYEKT_CHEKLOVI`). Cheklanmaganlar uchun hech narsa
 * o'zgarmaydi.
 */
export function yopiqCheklanganga(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (qamrov(req).cheklangan) {
        next(new AppError('Bu bo\'lim obyekt bo\'yicha cheklangan foydalanuvchiga yopiq', 403, 'OBYEKT_CHEKLOVI'));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * `router.param(...)` uchun guard: bitta yozuv (suhbat, xabar, mijoz)
 * qamrovda bo'lmasa — 404 (`QamrovTekshiruvchi`). Cheklanmaganda tekshiruv
 * funksiyasi umuman chaqirilmaydi: bazaga so'rov yo'q, konteynerga ham
 * tegilmaydi (qisman soxta konteynerli eski testlar shu tufayli o'zgarmaydi).
 */
export function qamrovParam(
  tekshir: (q: MijozQamrovi, id: string) => Promise<void>,
): (req: Request, res: Response, next: NextFunction, value: unknown) => Promise<void> {
  return async (req, _res, next, value) => {
    try {
      const q = qamrov(req);
      if (q.cheklangan) await tekshir(q, String(value));
      next();
    } catch (err) {
      next(err);
    }
  };
}
