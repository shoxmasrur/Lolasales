import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/shared/errors';
import { isProd } from '@/shared/config';
import { childLogger } from '@/shared/logger';

const log = childLogger('http');

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Yo'l topilmadi: ${req.method} ${req.path}` } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // Oqim javobi (masalan `.xlsx` eksport) sarlavhalarni allaqachon
  // yuborgan bo'lishi mumkin — bunday javobga endi JSON tanasi yozib
  // bo'lmaydi, urinish ERR_HTTP_HEADERS_SENT bilan yiqiladi. Xatoni
  // yo'qotib yubormaslik uchun faqat logga tushiramiz va chiqamiz.
  if (res.headersSent) {
    log.error({ err, path: req.path }, 'Xato javob sarlavhalari ketgandan keyin yuz berdi');
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'So\'rov ma\'lumotlari noto\'g\'ri',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) log.error({ err, path: req.path }, err.message);
    else log.warn({ path: req.path, code: err.code }, err.message);

    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Kutilmagan xato';
  log.error({ err, path: req.path }, 'Kutilmagan server xatosi');

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isProd ? 'Serverda xato yuz berdi' : message,
    },
  });
}
