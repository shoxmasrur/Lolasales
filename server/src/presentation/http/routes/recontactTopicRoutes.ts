import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { mavzuTekshiruvi } from '@/domain/entities/RecontactTopic';
import type { RecontactTopic } from '@/domain/entities/RecontactTopic';
import { can } from '@/domain/entities/User';
import { TOPSHIRIQ_MAX } from '@/application/usecases/messaging/InstructAgentUseCase';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseBody, parseParams } from '@/presentation/http/middleware/validate';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';

// Uzunlik chegaralari zod'da EMAS, `mavzuTekshiruvi` da: xato matni
// o'zbekcha bo'ladi va qoida bazasiz test qilinadi. Zod faqat turlarni
// tekshiradi.
const createSchema = z.object({
  title: z.string(),
  instruction: z.string(),
  sortOrder: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
});

const patchSchema = z.object({
  title: z.string().optional(),
  instruction: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
});

// Noto'g'ri id Postgres'da `22P02` bo'lib 500 qaytarardi — oldinroq 422.
const idSchema = z.object({ id: z.string().uuid() });

/** Audit yozuvi uchun — `id` jurnalda alohida `entityId` bo'lib turadi. */
const auditKorinishi = (t: RecontactTopic) => ({
  title: t.title,
  instruction: t.instruction,
  sortOrder: t.sortOrder,
  isEnabled: t.isEnabled,
});

/**
 * Qayta aloqa uchun tayyor mavzular. `/api/recontact` ostiga ulanadi
 * (mount darajasida `clients.view`), yo'llar — `/topics…`.
 *
 * O'qish hamma operatorga ochiq (mavzu tanlash uchun), boshqarish —
 * `settings.edit`: mavzu agentning mijozga nima yozishini belgilaydi,
 * ya'ni u agent sozlamalari bilan bir darajadagi huquq.
 */
export function recontactTopicRoutes(container: Container): Router {
  const router = Router();
  const topics = () => container.repositories.recontactTopics;

  router.get('/topics', async (req, res) => {
    const user = currentUser(req);
    const all = req.query.all === '1' || req.query.all === 'true';

    // O'chirilgan (yoqilmagan) mavzular faqat boshqaruv sahifasiga kerak.
    // Huquqsiz so'rovga jimgina qisqa ro'yxat qaytarilmaydi — 403:
    // aks holda sahifa "mavzular yo'qolib qoldi" deb ko'rsatardi.
    if (all && !can(user, 'settings.edit')) {
      throw new ForbiddenError('Ruxsat yo\'q: settings.edit');
    }

    res.json({ items: await topics().list({ includeDisabled: all }) });
  });

  router.post('/topics', requirePermission('settings.edit'), async (req, res) => {
    const user = currentUser(req);
    const body = parseBody(createSchema, req);

    const xato = mavzuTekshiruvi(body, TOPSHIRIQ_MAX);
    if (xato) throw new ValidationError(xato);

    const topic = await topics().create({
      title: body.title.trim(),
      instruction: body.instruction.trim(),
      sortOrder: body.sortOrder,
      isEnabled: body.isEnabled,
      createdBy: user.id,
    });

    await container.repositories.audit.record({
      actor: user.email,
      action: 'recontact_topic.created',
      entity: 'recontact_topic',
      entityId: topic.id,
      payload: auditKorinishi(topic),
    });

    res.status(201).json(topic);
  });

  router.patch('/topics/:id', requirePermission('settings.edit'), async (req, res) => {
    const user = currentUser(req);
    const { id } = parseParams(idSchema, req);
    const body = parseBody(patchSchema, req);

    if (
      body.title === undefined &&
      body.instruction === undefined &&
      body.sortOrder === undefined &&
      body.isEnabled === undefined
    ) {
      throw new ValidationError('O\'zgartiriladigan maydon yo\'q');
    }

    const xato = mavzuTekshiruvi(body, TOPSHIRIQ_MAX);
    if (xato) throw new ValidationError(xato);

    // Oldingi holat tahrirdan OLDIN o'qiladi: jurnalda "nima o'zgardi?"
    // degan savolga bitta yozuvdan javob bo'lsin.
    const eski = await topics().findById(id);
    if (!eski) throw new NotFoundError('Mavzu', id);

    const topic = await topics().update(id, {
      title: body.title?.trim(),
      instruction: body.instruction?.trim(),
      sortOrder: body.sortOrder,
      isEnabled: body.isEnabled,
    });
    // Ikki amal orasida boshqa admin o'chirib yuborgan bo'lishi mumkin.
    if (!topic) throw new NotFoundError('Mavzu', id);

    await container.repositories.audit.record({
      actor: user.email,
      action: 'recontact_topic.updated',
      entity: 'recontact_topic',
      entityId: id,
      payload: { eski: auditKorinishi(eski), yangi: auditKorinishi(topic) },
    });

    res.json(topic);
  });

  router.delete('/topics/:id', requirePermission('settings.edit'), async (req, res) => {
    const user = currentUser(req);
    const { id } = parseParams(idSchema, req);

    // O'chirishdan OLDIN o'qiymiz — audit "qaysi mavzu o'chirildi?"
    // degan savolga matni bilan javob bersin.
    const topic = await topics().findById(id);
    const ochirildi = await topics().softDelete(id);

    // DELETE idempotent: allaqachon o'chirilgan mavzuda ham `ok`, lekin
    // audit faqat haqiqatan o'chirilganda yoziladi.
    if (ochirildi && topic) {
      await container.repositories.audit.record({
        actor: user.email,
        action: 'recontact_topic.deleted',
        entity: 'recontact_topic',
        entityId: id,
        payload: auditKorinishi(topic),
      });
    }

    res.json({ ok: true });
  });

  return router;
}

