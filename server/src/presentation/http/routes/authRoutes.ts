import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { toPublicUser } from '@/domain/entities/User';
import { currentUser } from '@/presentation/http/middleware/auth';
import { parseBody } from '@/presentation/http/middleware/validate';
import { UnauthorizedError } from '@/shared/errors';

const loginSchema = z.object({
  email: z.string().email('Email noto\'g\'ri'),
  password: z.string().min(1, 'Parol kiritilmagan'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Joriy parol kiritilmagan'),
  newPassword: z.string().min(8, 'Yangi parol kamida 8 belgi bo\'lsin'),
});

export function authRoutes(container: Container, authenticate: RequestHandler): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { email, password } = parseBody(loginSchema, req);
    const result = await container.useCases.login.execute(email, password);
    res.json(result);
  });

  /** Dashboard shu javobdagi ruxsatlar bo'yicha menyu va tugmalarni chizadi. */
  router.get('/me', authenticate, async (req, res) => {
    const user = currentUser(req);
    res.json({ user: toPublicUser(user), permissions: user.role.permissions });
  });

  /** O'z parolini almashtirish — hech qanday qo'shimcha ruxsat talab qilmaydi. */
  router.post('/change-password', authenticate, async (req, res) => {
    const user = currentUser(req);
    const { currentPassword, newPassword } = parseBody(changePasswordSchema, req);

    if (!(await container.hasher.verify(currentPassword, user.passwordHash))) {
      throw new UnauthorizedError('Joriy parol noto\'g\'ri');
    }

    await container.repositories.users.update(user.id, {
      passwordHash: await container.hasher.hash(newPassword),
    });
    container.auth.invalidate(user.id);

    await container.repositories.audit.record({
      actor: user.email,
      action: 'user.password_changed',
      entity: 'user',
      entityId: user.id,
    });

    res.json({ ok: true });
  });

  return router;
}
