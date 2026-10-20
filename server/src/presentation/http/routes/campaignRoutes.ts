import { Router } from 'express';
import { z } from 'zod';
import type { CampaignFilters } from '@/domain/entities/Campaign';
import type { Container } from '@/composition/container';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseBody } from '@/presentation/http/middleware/validate';
import { qamrov } from '@/presentation/http/middleware/qamrov';
import { CLIENT_SOURCES } from '@/domain/entities/Client';
import { XARID_BOSQICHLARI } from '@/domain/entities/Purchase';
import { NotFoundError } from '@/shared/errors';

const filtersSchema = z.object({
  stage: z.array(z.enum(XARID_BOSQICHLARI)).optional(),
  source: z.array(z.enum(CLIENT_SOURCES as [string, ...string[]])).optional(),
  courseId: z.string().uuid().optional(),
  onlyWithoutConversation: z.boolean().optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

const createSchema = z.object({
  name: z.string().min(2, 'Kampaniya nomi juda qisqa'),
  description: z.string().nullable().optional(),
  filters: filtersSchema,
  dailyLimit: z.number().int().min(1).max(200).optional(),
  windowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  windowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  startNow: z.boolean().optional(),
});

const statusSchema = z.object({
  status: z.enum(['running', 'paused', 'cancelled', 'completed']),
});

export function campaignRoutes(container: Container): Router {
  const router = Router();
  const { campaigns, audit } = container.repositories;

  router.get('/', async (req, res) => {
    const page = await campaigns.list({
      limit: Number(req.query.limit ?? 50),
      offset: Number(req.query.offset ?? 0),
    });
    const withStats = await Promise.all(
      page.items.map(async (c) => ({ ...c, stats: await campaigns.stats(c.id) })),
    );
    res.json({ ...page, items: withStats });
  });

  router.get('/:id', async (req, res) => {
    const id = String(req.params.id);
    const campaign = await campaigns.findById(id);
    if (!campaign) throw new NotFoundError('Kampaniya', id);
    const [stats, targets] = await Promise.all([
      campaigns.stats(id),
      campaigns.listTargets(id, { limit: Number(req.query.limit ?? 100) }),
    ]);
    res.json({ campaign, stats, targets });
  });

  /** Kampaniya yaratmasdan qamrovni ko'rish. */
  router.post('/preview', requirePermission('campaigns.create'), async (req, res) => {
    const filters = parseBody(filtersSchema, req);
    const count = await container.useCases.createCampaign.preview(filters as CampaignFilters, qamrov(req));
    res.json({ count });
  });

  router.post('/', requirePermission('campaigns.create'), async (req, res) => {
    const user = currentUser(req);
    const payload = parseBody(createSchema, req);
    const result = await container.useCases.createCampaign.execute({
      ...payload,
      filters: payload.filters as CampaignFilters,
      qamrov: qamrov(req),
      userId: user.id,
      userEmail: user.email,
    });
    res.status(201).json(result);
  });

  router.post('/:id/status', requirePermission('campaigns.control'), async (req, res) => {
    const user = currentUser(req);
    const { status } = parseBody(statusSchema, req);
    const campaign = await campaigns.setStatus(String(req.params.id), status);

    await audit.record({
      actor: user.email,
      action: `campaign.${status}`,
      entity: 'campaign',
      entityId: campaign.id,
      payload: { status },
    });

    container.events.publish({ type: 'campaign.updated', campaignId: campaign.id });
    res.json({ campaign });
  });

  return router;
}
