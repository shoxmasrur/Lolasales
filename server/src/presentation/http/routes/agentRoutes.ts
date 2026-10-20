import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { CLIENT_TYPE_LABEL, isClientType } from '@/domain/entities/AgentMemory';
import { uslubVersiyasi } from '@/domain/entities/UslubVersiyasi';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseBody } from '@/presentation/http/middleware/validate';
import { qamrov, qamrovParam } from '@/presentation/http/middleware/qamrov';
import { resetSection } from '@/infrastructure/ai/prompt/seedDefaultRules';
import { NotFoundError, ValidationError } from '@/shared/errors';

const bulletSchema = z.object({
  sectionId: z.string().uuid(),
  body: z.string().min(3, 'Qoida juda qisqa').max(1000),
});

const exampleSchema = z.object({
  sectionId: z.string().uuid(),
  situation: z.string().min(3).max(500),
  badExample: z.string().min(3).max(1500),
  goodExample: z.string().min(3).max(1500),
  why: z.string().min(3).max(700),
});

const updateRuleSchema = z.object({
  body: z.string().min(3).max(1000).optional(),
  situation: z.string().min(3).max(500).optional(),
  badExample: z.string().min(3).max(1500).optional(),
  goodExample: z.string().min(3).max(1500).optional(),
  why: z.string().min(3).max(700).optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const lessonStatusSchema = z.object({ status: z.enum(['approved', 'rejected', 'proposed']) });

const proposeLessonSchema = z.object({
  lesson: z.string().min(10, 'Saboq juda qisqa').max(600),
  evidence: z.string().max(600).nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
});

export function agentRoutes(container: Container): Router {
  const router = Router();
  const { agentRules, lessons, clientProfiles, audit } = container.repositories;
  const { promptComposer } = container.services;

  // Obyekt cheklovi: begona mijozning xotirasi — 404 (faqat `client-profile` yo'llarida `:clientId`).
  router.param('clientId', qamrovParam((q, id) => container.services.qamrovTekshiruvchi.mijoz(q, id)));

  // ─── Qoidalar ───────────────────────────────────────────────────────────
  router.get('/rules', requirePermission('agent.view'), async (_req, res) => {
    const sections = await agentRules.listSections();
    res.json({ sections });
  });

  /** Agentga aynan nima ketayotgani — tahrirdan keyin tekshirish uchun. */
  router.get('/prompt-preview', requirePermission('agent.view'), async (req, res) => {
    // `?style` berilmasa `uslubVersiyasi` `v1` qaytaradi — panelning
    // versiyalashdan oldingi xatti-harakati saqlanadi.
    const preview = await promptComposer.preview(uslubVersiyasi(req.query.style));
    res.json(preview);
  });

  router.post('/rules', requirePermission('agent.edit'), async (req, res) => {
    const user = currentUser(req);
    const sections = await agentRules.listSections();
    const sectionId = String((req.body as { sectionId?: string }).sectionId ?? '');
    const section = sections.find((s) => s.id === sectionId);
    if (!section) throw new ValidationError('Bo\'lim topilmadi');

    const rule =
      section.kind === 'examples'
        ? await agentRules.addRule({ ...parseBody(exampleSchema, req), updatedBy: user.id })
        : await agentRules.addRule({ ...parseBody(bulletSchema, req), updatedBy: user.id });

    promptComposer.invalidate();
    await audit.record({
      actor: user.email,
      action: 'agent.rule_added',
      entity: 'agent_rule',
      entityId: rule.id,
      payload: { section: section.key },
    });

    res.status(201).json({ rule });
  });

  router.patch('/rules/:id', requirePermission('agent.edit'), async (req, res) => {
    const user = currentUser(req);
    const patch = parseBody(updateRuleSchema, req);
    const rule = await agentRules.updateRule(String(req.params.id), { ...patch, updatedBy: user.id });

    promptComposer.invalidate();
    await audit.record({
      actor: user.email,
      action: 'agent.rule_updated',
      entity: 'agent_rule',
      entityId: rule.id,
      payload: patch,
    });

    res.json({ rule });
  });

  router.delete('/rules/:id', requirePermission('agent.edit'), async (req, res) => {
    const user = currentUser(req);
    await agentRules.removeRule(String(req.params.id));
    promptComposer.invalidate();

    await audit.record({
      actor: user.email,
      action: 'agent.rule_removed',
      entity: 'agent_rule',
      entityId: String(req.params.id),
    });

    res.json({ ok: true });
  });

  /** Bo'limni kodda yozilgan standart qiymatlarga qaytarish. */
  router.post('/rules/reset/:sectionKey', requirePermission('agent.edit'), async (req, res) => {
    const user = currentUser(req);
    const restored = await resetSection(agentRules, String(req.params.sectionKey));
    promptComposer.invalidate();

    await audit.record({
      actor: user.email,
      action: 'agent.section_reset',
      entity: 'agent_rule_section',
      entityId: String(req.params.sectionKey),
      payload: { restored },
    });

    res.json({ restored });
  });

  // ─── Saboqlar (agent xotirasi) ──────────────────────────────────────────
  router.get('/lessons', requirePermission('agent.view'), async (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const items = await lessons.list(status as never);
    res.json({ items });
  });

  /**
   * Saboq TAKLIF qilish — MCP orqali kirgan boshqa agentlar uchun.
   * Taklif `proposed` holatida turadi va odam tasdiqlamaguncha ishlatilmaydi.
   */
  router.post('/lessons', requirePermission('agent.propose'), async (req, res) => {
    const user = currentUser(req);
    const payload = parseBody(proposeLessonSchema, req);
    // Obyekt cheklovi: saboq begona suhbatga bog'lanmaydi (404).
    const mijozQamrovi = qamrov(req);
    if (payload.conversationId && mijozQamrovi.cheklangan) {
      await container.services.qamrovTekshiruvchi.suhbat(mijozQamrovi, payload.conversationId);
    }

    const lesson = await lessons.recordProposal({
      lesson: payload.lesson,
      conversationId: payload.conversationId ?? null,
      evidence: payload.evidence ?? null,
    });

    await audit.record({
      actor: user.email,
      action: 'agent.lesson_proposed',
      entity: 'agent_lesson',
      entityId: lesson.id,
      payload: { lesson: lesson.lesson, viaApiKey: Boolean(req.viaApiKey) },
    });

    res.status(201).json({ lesson });
  });

  router.post('/lessons/:id/status', requirePermission('agent.edit'), async (req, res) => {
    const user = currentUser(req);
    const { status } = parseBody(lessonStatusSchema, req);
    const lesson = await lessons.setStatus(String(req.params.id), status, user.id);

    promptComposer.invalidate();
    await audit.record({
      actor: user.email,
      action: `agent.lesson_${status}`,
      entity: 'agent_lesson',
      entityId: lesson.id,
      payload: { lesson: lesson.lesson },
    });

    res.json({ lesson });
  });

  router.delete('/lessons/:id', requirePermission('agent.edit'), async (req, res) => {
    await lessons.remove(String(req.params.id));
    promptComposer.invalidate();
    res.json({ ok: true });
  });

  // ─── Mijoz bo'yicha xotira ──────────────────────────────────────────────
  router.get('/client-profile/:clientId', requirePermission('clients.view'), async (req, res) => {
    const profile = await clientProfiles.find(String(req.params.clientId));
    res.json({ profile, types: CLIENT_TYPE_LABEL });
  });

  router.patch('/client-profile/:clientId', requirePermission('clients.edit'), async (req, res) => {
    const user = currentUser(req);
    const body = req.body as Record<string, string | null>;

    const profile = await clientProfiles.upsert(String(req.params.clientId), {
      clientType: isClientType(body.clientType) ? body.clientType : null,
      summary: body.summary ?? null,
      whatWorks: body.whatWorks ?? null,
      bestContactTime: body.bestContactTime ?? null,
    });

    await audit.record({
      actor: user.email,
      action: 'agent.client_memory_updated',
      entity: 'client',
      entityId: String(req.params.clientId),
    });

    res.json({ profile });
  });

  router.delete('/client-profile/:clientId', requirePermission('clients.edit'), async (req, res) => {
    const existing = await clientProfiles.find(String(req.params.clientId));
    if (!existing) throw new NotFoundError('Mijoz xotirasi', String(req.params.clientId));
    await clientProfiles.upsert(String(req.params.clientId), {
      clientType: null,
      summary: '',
      whatWorks: '',
      bestContactTime: '',
    });
    res.json({ ok: true });
  });

  return router;
}
