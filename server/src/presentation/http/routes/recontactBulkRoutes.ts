import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseBody } from '@/presentation/http/middleware/validate';
import { qamrov } from '@/presentation/http/middleware/qamrov';
import { TOPSHIRIQ_MAX } from '@/application/usecases/messaging/InstructAgentUseCase';
import { begonaniToxtatma, korinadiganVazifa } from '@/application/services/vazifaKorinishi';
import { AppError, ValidationError } from '@/shared/errors';

/**
 * Bir ishda shuncha suhbatgacha. Pauza 1-3 daqiqa bo'lsa 500 ta suhbat
 * bir ish kunidan oshadi — undan kattasi operator nazoratidan chiqib ketadi.
 */
const RECONTACT_BULK_MAX = 500;

const bulkSchema = z
  .object({
    conversationIds: z
      .array(z.string().uuid())
      .min(1, 'Hech kim tanlanmagan')
      .max(RECONTACT_BULK_MAX, `Bir vaqtda ${RECONTACT_BULK_MAX} tagacha`),
    topicId: z.string().uuid().optional(),
    instruction: z
      .string()
      .trim()
      .min(1, 'Topshiriq bo\'sh')
      .max(TOPSHIRIQ_MAX, `Topshiriq ${TOPSHIRIQ_MAX} belgidan oshmasin`)
      .optional(),
  })
  // Aynan bittasi: ikkalasi kelsa qaysi biri yuborilishi noaniq bo'lardi.
  .refine((b) => (b.topicId === undefined) !== (b.instruction === undefined), {
    message: 'Mavzu yoki topshiriq matnidan aynan bittasini tanlang',
    path: ['topicId'],
  });

/**
 * Qayta aloqa ro'yxatidan ommaviy yuborish (spec 2026-09-16, 3-bo'lim).
 *
 * `/api/recontact` ostiga ulanadi; mount darajasida `clients.view`.
 */
export function recontactBulkRoutes(container: Container): Router {
  const router = Router();

  router.post('/bulk', requirePermission('conversations.agent_toggle'), async (req, res) => {
    const user = currentUser(req);
    const body = parseBody(bulkSchema, req);

    // Obyekt cheklovi: so'rovdagi suhbatlardan faqat qamrovdagilari; navbat
    // har birini yuborishdan oldin shu qamrovda qayta tekshiradi.
    // Cheklanmaganda ro'yxat, navbat kirishi va javob avvalgidek.
    const q = qamrov(req);
    let conversationIds = body.conversationIds;
    const qoshimcha: { chiqarildi?: number } = {};
    if (q.cheklangan) {
      conversationIds = await container.services.qamrovTekshiruvchi.suhbatIdlarniKesish(q, body.conversationIds);
      if (conversationIds.length === 0) {
        throw new ValidationError('Tanlangan suhbatlarning hech biri sizning obyektlaringizda emas');
      }
      qoshimcha.chiqarildi = body.conversationIds.length - conversationIds.length;
    }

    let instruction: string;
    let topic: { id: string; title: string } | null = null;
    if (body.topicId !== undefined) {
      const found = await container.repositories.recontactTopics.findById(body.topicId);
      // O'chirilgan (yumshoq) yoki o'chiq mavzu ro'yxatda ko'rinmaydi —
      // eski sahifadan kelgan so'rov uni baribir yubormasin.
      if (!found || !found.isEnabled) {
        throw new AppError('Mavzu topilmadi yoki o\'chirilgan — ro\'yxatni yangilang', 400, 'TOPIC_UNAVAILABLE');
      }
      instruction = found.instruction;
      topic = { id: found.id, title: found.title };
    } else {
      instruction = body.instruction!;
    }

    // Xotirada navbat yo'q, lekin bazada tiklanishni kutayotgani bo'lishi
    // mumkin (server endigina ko'tarilgan) — boshlashdan OLDIN rad etamiz.
    // Egasi yo'q qotgan qator shu yerda yopiladi.
    await container.services.bulkJobStore.assertFree('recontact');

    // Ish ketayotgan bo'lsa `start` `ConflictError` (409) tashlaydi — audit
    // undan KEYIN yoziladi, ya'ni boshlanmagan ish jurnalga tushmaydi.
    const job = await container.services.bulkRecontact.start({
      conversationIds,
      instruction,
      userId: user.id,
      userEmail: user.email,
      ...(q.cheklangan ? { qamrov: q } : {}),
    });

    await container.repositories.audit.record({
      actor: user.email,
      action: 'recontact.bulk_start',
      entity: 'conversation',
      entityId: null,
      payload: {
        jobId: job.id,
        count: job.total,
        topicId: topic?.id ?? null,
        topicTitle: topic?.title ?? null,
        // Erkin matnning o'zi jurnalga yozilmaydi — u chatda qayd bo'lib turadi.
        instructionChars: instruction.length,
      },
    });

    res.json({ job, ...qoshimcha });
  });

  // Boshqa foydalanuvchining navbati cheklanganga ismsiz (suhbat va natijalarsiz).
  router.get('/bulk', async (req, res) => {
    res.json({ job: korinadiganVazifa(container.services.bulkRecontact.current(), currentUser(req).id, qamrov(req)) });
  });

  router.post('/bulk/stop', requirePermission('conversations.agent_toggle'), async (req, res) => {
    const user = currentUser(req);
    const job = container.services.bulkRecontact.current();
    begonaniToxtatma(job, user.id, qamrov(req));
    const wasRunning = container.services.bulkRecontact.isRunning();
    // Kutilmaydi: joriy agent navbati tugashini kutish so'rovni daqiqalab
    // osib qo'yardi. Holat `recontact.bulk_progress` orqali keladi.
    void container.services.bulkRecontact.stop();

    if (wasRunning && job) {
      await container.repositories.audit.record({
        actor: user.email,
        action: 'recontact.bulk_stop',
        entity: 'conversation',
        entityId: null,
        payload: { jobId: job.id, sent: job.sent, skipped: job.skipped, failed: job.failed, total: job.total },
      });
    }

    res.json({ ok: true });
  });

  return router;
}
