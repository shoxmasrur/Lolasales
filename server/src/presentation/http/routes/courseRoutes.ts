import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import type { NewCourse } from '@/domain/entities/Course';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseBody, parseParams } from '@/presentation/http/middleware/validate';
import { AppError, NotFoundError } from '@/shared/errors';

/** "YYYY-MM-DD" va haqiqiy kalendar kuni (2026-02-30 o'tmaydi). */
const sana = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana YYYY-MM-DD ko\'rinishida bo\'lsin')
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Bunday sana yo\'q');

const matn = (max: number) => z.string().trim().max(max).nullable();

const courseFields = {
  name: z.string().trim().min(2, 'Kurs nomi juda qisqa').max(200),
  description: matn(4000).optional(),
  salesStart: sana,
  salesEnd: sana,
  price: z.number().int('Narx butun son bo\'lsin').positive('Narx 0 dan katta bo\'lsin'),
  duration: matn(200).optional(),
  topics: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  startsOn: sana.nullable().optional(),
  groupLink: matn(500).optional(),
  isActive: z.boolean().optional(),
  installmentAllowed: z.boolean().optional(),
  installmentParts: z.number().int().min(2).max(60).nullable().optional(),
  installmentFirstMin: z.number().int().positive().nullable().optional(),
  linkAfter: z.enum(['birinchi_qism', 'toliq']).optional(),
};

const createSchema = z.object(courseFields);

/** Sotuv davri tartibi buzilsa 400 (vazifa talabi); boshqa maydon xatolari odatdagidek 422. */
function davrniTekshir(start: string, end: string): void {
  if (end < start) {
    throw new AppError('Sotuv tugashi boshlanishidan oldin bo\'lmasin', 400, 'INVALID_SALES_PERIOD');
  }
}
const updateSchema = z.object(courseFields).partial();

const knowledgeFields = {
  kind: z.enum(['dastur', 'savol_javob', 'etiroz', 'boshqa']),
  title: z.string().trim().min(1, 'Sarlavha majburiy').max(300),
  body: z.string().trim().min(1, 'Matn majburiy').max(8000),
  sortOrder: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
};
const knowledgeCreateSchema = z.object(knowledgeFields);
const knowledgeUpdateSchema = z.object(knowledgeFields).partial();

const idParams = z.object({ id: z.string().uuid() });
const kidParams = z.object({ kid: z.string().uuid() });

export function courseRoutes(container: Container): Router {
  const router = Router();
  const { courses, audit } = container.repositories;

  const view = requirePermission('courses.view');
  const edit = requirePermission('courses.edit');

  async function mavjud(id: string) {
    const course = await courses.findById(id);
    if (!course) throw new NotFoundError('Kurs', id);
    return course;
  }

  router.get('/', view, async (_req, res) => {
    res.json({ items: await courses.list() });
  });

  router.post('/', edit, async (req, res) => {
    const d = parseBody(createSchema, req);
    davrniTekshir(d.salesStart, d.salesEnd);
    const course = await courses.create({
      name: d.name,
      description: d.description ?? null,
      salesStart: d.salesStart,
      salesEnd: d.salesEnd,
      price: d.price,
      duration: d.duration ?? null,
      topics: d.topics ?? [],
      startsOn: d.startsOn ?? null,
      groupLink: d.groupLink ?? null,
      isActive: d.isActive ?? true,
      installmentAllowed: d.installmentAllowed ?? false,
      installmentParts: d.installmentParts ?? null,
      installmentFirstMin: d.installmentFirstMin ?? null,
      linkAfter: d.linkAfter ?? 'birinchi_qism',
    });
    await audit.record({ actor: currentUser(req).id, action: 'course.created', entity: 'course', entityId: course.id });
    res.status(201).json({ course });
  });

  router.patch('/:id', edit, async (req, res) => {
    const { id } = parseParams(idParams, req);
    const patch = parseBody(updateSchema, req) as Partial<NewCourse>;
    const joriy = await mavjud(id);
    // Davr tekshiruvi BIRLASHGAN qiymatlarda: faqat bittasi o'zgarsa ham tartib buzilmasin.
    const start = patch.salesStart ?? joriy.salesStart;
    const end = patch.salesEnd ?? joriy.salesEnd;
    davrniTekshir(start, end);
    const course = await courses.update(id, patch);
    await audit.record({
      actor: currentUser(req).id, action: 'course.updated', entity: 'course', entityId: id,
      payload: { fields: Object.keys(patch) },
    });
    res.json({ course });
  });

  router.delete('/:id', edit, async (req, res) => {
    const { id } = parseParams(idParams, req);
    await mavjud(id);
    await courses.remove(id);
    await audit.record({ actor: currentUser(req).id, action: 'course.deleted', entity: 'course', entityId: id });
    res.json({ ok: true });
  });

  // ─── Kurs ma'lumotlar bazasi yozuvlari ──────────────────────────────────
  router.get('/:id/knowledge', view, async (req, res) => {
    const { id } = parseParams(idParams, req);
    await mavjud(id);
    res.json({ items: await courses.listKnowledge(id) });
  });

  router.post('/:id/knowledge', edit, async (req, res) => {
    const { id } = parseParams(idParams, req);
    await mavjud(id);
    const d = parseBody(knowledgeCreateSchema, req);
    const item = await courses.addKnowledge(id, {
      kind: d.kind,
      title: d.title,
      body: d.body,
      sortOrder: d.sortOrder ?? (await courses.listKnowledge(id)).length,
      isEnabled: d.isEnabled ?? true,
    });
    res.status(201).json({ item });
  });

  router.patch('/knowledge/:kid', edit, async (req, res) => {
    const { kid } = parseParams(kidParams, req);
    const patch = parseBody(knowledgeUpdateSchema, req);
    res.json({ item: await courses.updateKnowledge(kid, patch) });
  });

  router.delete('/knowledge/:kid', edit, async (req, res) => {
    const { kid } = parseParams(kidParams, req);
    await courses.removeKnowledge(kid);
    res.json({ ok: true });
  });

  return router;
}
