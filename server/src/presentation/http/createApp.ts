import express, { type Express, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { Container } from '@/composition/container';
import { requirePermission } from '@/presentation/http/middleware/auth';
import { errorHandler, notFoundHandler } from '@/presentation/http/middleware/errorHandler';
import { authRoutes } from '@/presentation/http/routes/authRoutes';
import { clientRoutes } from '@/presentation/http/routes/clientRoutes';
import { conversationRoutes } from '@/presentation/http/routes/conversationRoutes';
import { courseRoutes } from '@/presentation/http/routes/courseRoutes';
import { campaignRoutes } from '@/presentation/http/routes/campaignRoutes';
import { importRoutes } from '@/presentation/http/routes/importRoutes';
import { mediaRoutes } from '@/presentation/http/routes/mediaRoutes';
import { telegramRoutes } from '@/presentation/http/routes/telegramRoutes';
import { settingsRoutes } from '@/presentation/http/routes/settingsRoutes';
import { logRoutes } from '@/presentation/http/routes/logRoutes';
import { statsRoutes } from '@/presentation/http/routes/statsRoutes';
import { userRoutes } from '@/presentation/http/routes/userRoutes';
import { agentRoutes } from '@/presentation/http/routes/agentRoutes';
import { llmRoutes } from '@/presentation/http/routes/llmRoutes';
import { commentRoutes } from '@/presentation/http/routes/commentRoutes';
import { config } from '@/shared/config';

export function createApp(container: Container): Express {
  const app = express();
  const authenticate = container.auth.authenticate();

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: config.WEB_ORIGIN.split(',').map((o) => o.trim()), credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'lolasales', time: new Date().toISOString() });
  });

  const api = Router();
  api.use('/auth', authRoutes(container, authenticate));

  // Quyidagi barcha yo'llar avtorizatsiya talab qiladi.
  api.use(authenticate);

  // Bo'limga kirish huquqi — mount darajasida. Ichkaridagi amallar
  // (yozish, o'chirish) o'z ruxsatlarini alohida tekshiradi.
  api.use('/clients', requirePermission('clients.view'), clientRoutes(container));
  api.use('/courses', courseRoutes(container));
  api.use('/conversations', requirePermission('conversations.view'), conversationRoutes(container));
  api.use('/media', requirePermission('conversations.view'), mediaRoutes(container));
  api.use('/campaigns', requirePermission('campaigns.view'), campaignRoutes(container));
  api.use('/import', requirePermission('import.view'), importRoutes(container));
  api.use('/telegram', requirePermission('telegram.view'), telegramRoutes(container));
  // Kanal izohlari — faqat o'qish; leadga aylantirish ichkarida `comments.import`.
  api.use('/comments', requirePermission('comments.view'), commentRoutes(container));
  api.use('/stats', requirePermission('dashboard.view'), statsRoutes(container));
  // Sozlamalar ichida audit ham bor — u alohida ruxsat talab qiladi,
  // shuning uchun mount darajasida umumiy to'siq qo'yilmaydi.
  api.use('/settings', settingsRoutes(container));
  // OpenAI kaliti va model jadvali — ruxsat marshrut ICHIDA tekshiriladi
  // (`settingsRoutes` bilan bir xil naqsh), mount darajasida qo'shimcha
  // to'siq shart emas.
  api.use('/llm', llmRoutes(container));
  api.use('/agent', agentRoutes(container));
  api.use('/users', userRoutes(container));
  api.use('/logs', requirePermission('logs.view'), logRoutes(container));

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
