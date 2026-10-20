import { Router } from 'express';
import type { Container } from '@/composition/container';
import { NotFoundError } from '@/shared/errors';

/**
 * Media fayllar statik papkadan berilmaydi — ular mijozlarning shaxsiy
 * ma'lumoti (to'lov cheklari, ovozli xabarlar). Har bir so'rov
 * avtorizatsiyadan o'tadi va xabar id'si bo'yicha beriladi.
 */
export function mediaRoutes(container: Container): Router {
  const router = Router();
  const { messages } = container.repositories;
  const { mediaStorage } = container.services;

  router.get('/:messageId', async (req, res) => {
    const id = String(req.params.messageId);
    const message = await messages.findById(id);

    if (!message?.media?.path) throw new NotFoundError('Fayl', id);
    if (!(await mediaStorage.exists(message.media.path))) {
      throw new NotFoundError('Fayl diskda topilmadi', message.media.path);
    }

    const data = await mediaStorage.read(message.media.path);
    const fileName = message.media.fileName ?? `${message.media.kind}`;

    res.setHeader('Content-Type', message.media.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(data.byteLength));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    // Brauzerda ochilsin, lekin fayl nomi saqlanib qolsin.
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.send(data);
  });

  return router;
}
