import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { bayramTekshiruvi } from '@/domain/entities/bayramTekshiruvi';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseBody } from '@/presentation/http/middleware/validate';
import { NotFoundError, ValidationError } from '@/shared/errors';

const bayramSchema = z.object({
  name: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  yillik: z.boolean().optional().default(false),
});

/**
 * Bayram va dam olish kunlari.
 *
 * NEGA SOZLAMALARDAN AJRALDI: bu o'z sahifasi va o'z ruxsati bo'lgan
 * mustaqil bo'lim. `settings.edit` ostida qolsa, bayram kiritish uchun
 * xodimga yuborish tezligi va kill-switch'ga ham huquq kerak bo'lardi.
 */
export function holidayRoutes(container: Container): Router {
  const router = Router();

  router.get('/', requirePermission('holidays.view'), async (_req, res) => {
    res.json({ items: await container.repositories.holidays.list() });
  });

  router.post('/', requirePermission('holidays.manage'), async (req, res) => {
    const user = currentUser(req);
    const body = parseBody(bayramSchema, req);

    // Mazmuniy tekshiruv zod'da emas, sof funksiyada: qoidalar
    // bazasiz test qilinadi va xato matni o'zbekcha bo'ladi.
    const xato = bayramTekshiruvi(body);
    if (xato) throw new ValidationError(xato);

    const bayram = await container.repositories.holidays.create({
      ...body,
      name: body.name.trim(),
      createdBy: user.email,
    });

    await container.repositories.audit.record({
      actor: user.email,
      action: 'holiday.created',
      entity: 'holiday',
      entityId: bayram.id,
      payload: { name: bayram.name, startsOn: bayram.startsOn, endsOn: bayram.endsOn, yillik: bayram.yillik },
    });

    res.status(201).json({ bayram });
  });

  router.patch('/:id', requirePermission('holidays.manage'), async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);
    const body = parseBody(bayramSchema, req);

    // Qoidalar qo'shish bilan AYNAN bir xil — yillik oraliqning yil
    // chegarasidan o'tishi bu yerda ham rad etiladi. Ikkinchi nusxa
    // yozilmaydi: tahrir orqali kiritilgan yozuv qo'shish orqali
    // kiritilganidan farq qilmasligi kerak.
    const xato = bayramTekshiruvi(body);
    if (xato) throw new ValidationError(xato);

    // Oldingi holat tahrirdan OLDIN o'qiladi: jurnalda "nima
    // o'zgardi?" degan savolga bitta yozuvdan javob bo'lsin.
    const eski = await container.repositories.holidays.findById(id);
    if (!eski) throw new NotFoundError('Bayram', id);

    const bayram = await container.repositories.holidays.update(id, {
      ...body,
      name: body.name.trim(),
    });
    // Ikki amal orasida boshqa operator o'chirib yuborgan bo'lishi
    // mumkin — bu holda ham 404, jimgina muvaffaqiyat emas.
    if (!bayram) throw new NotFoundError('Bayram', id);

    await container.repositories.audit.record({
      actor: user.email,
      action: 'holiday.updated',
      entity: 'holiday',
      entityId: id,
      payload: {
        eski: { name: eski.name, startsOn: eski.startsOn, endsOn: eski.endsOn, yillik: eski.yillik },
        yangi: { name: bayram.name, startsOn: bayram.startsOn, endsOn: bayram.endsOn, yillik: bayram.yillik },
      },
    });

    res.json({ bayram });
  });

  router.delete('/:id', requirePermission('holidays.manage'), async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);

    // O'chirishdan OLDIN o'qiymiz: shu qatordan keyin nom va sanalarni
    // olishning boshqa yo'li yo'q, audit yozuvi esa "qaysi bayram
    // o'chirildi?" degan savolga aynan shu ma'lumot bilan javob beradi.
    const bayram = await container.repositories.holidays.findById(id);
    await container.repositories.holidays.remove(id);

    // Yozuv allaqachon yo'q bo'lsa ham so'rov muvaffaqiyatli tugaydi
    // (DELETE idempotent bo'lishi kerak) — audit shunchaki o'tkazib
    // yuboriladi, chunki yozadigan narsa qolmagan.
    if (bayram) {
      await container.repositories.audit.record({
        actor: user.email,
        action: 'holiday.deleted',
        entity: 'holiday',
        entityId: id,
        payload: { name: bayram.name, startsOn: bayram.startsOn, endsOn: bayram.endsOn, yillik: bayram.yillik },
      });
    }

    res.status(204).end();
  });

  return router;
}
