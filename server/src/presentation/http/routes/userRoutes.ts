import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { PERMISSION_GROUPS, PERMISSIONS, isPermission } from '@/domain/entities/Permission';
import { ADMIN_ROLE_KEY } from '@/domain/entities/Role';
import { toPublicUser } from '@/domain/entities/User';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { yopiqCheklanganga } from '@/presentation/http/middleware/qamrov';
import { parseBody } from '@/presentation/http/middleware/validate';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';

/**
 * Obyekt cheklovi: nomlar qirqiladi, takrorlar bitta bo'ladi (birinchi
 * uchragan tartibda). Bo'sh ro'yxat — cheklovsiz.
 */
const objectList = z
  .array(z.string().trim().min(1, 'Obyekt nomi bo\'sh').max(200, 'Obyekt nomi juda uzun'))
  .max(100, 'Obyektlar juda ko\'p')
  .transform((list) => [...new Set(list)]);

const permissionList = z.array(z.string()).transform((list) => list.filter(isPermission));

const createUserSchema = z.object({
  email: z.string().email('Email noto\'g\'ri'),
  fullName: z.string().min(2, 'Ism juda qisqa'),
  password: z.string().min(8, 'Parol kamida 8 belgi bo\'lsin'),
  roleId: z.string().uuid('Rol tanlanmagan'),
  objects: objectList.optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  roleId: z.string().uuid().optional(),
  password: z.string().min(8, 'Parol kamida 8 belgi bo\'lsin').optional(),
  isActive: z.boolean().optional(),
  objects: objectList.optional(),
});

const createRoleSchema = z.object({
  key: z
    .string()
    .min(2)
    .regex(/^[a-z0-9_-]+$/, 'Kalit faqat kichik harf, raqam, - va _ dan iborat bo\'lsin'),
  name: z.string().min(2, 'Nom juda qisqa'),
  description: z.string().nullable().optional(),
  permissions: permissionList,
});

const createTokenSchema = z.object({
  name: z.string().min(2, 'Kalit nomi juda qisqa').max(80),
  userId: z.string().uuid('Kalit egasi tanlanmagan'),
  expiresAt: z.string().datetime().nullable().optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  permissions: permissionList.optional(),
});

export function userRoutes(container: Container): Router {
  const router = Router();
  const { users, roles, apiTokens, audit, contracts } = container.repositories;
  const { hasher } = container;
  // Obyekt bilan cheklangan foydalanuvchi foydalanuvchi, rol va API kalitlarni
  // boshqara olmaydi (o'z cheklovini olib tashlamasin) — faqat o'qish (GET).
  const tahrirYopiq = yopiqCheklanganga();

  // ─── Ruxsatlar katalogi (rol tahrirlash oynasi uchun) ───────────────────
  router.get('/permissions', requirePermission('roles.manage'), (_req, res) => {
    res.json({ groups: PERMISSION_GROUPS, all: PERMISSIONS });
  });

  // ─── Rollar ─────────────────────────────────────────────────────────────
  router.get('/roles', requirePermission('users.view'), async (_req, res) => {
    const list = await roles.list();
    const withCounts = await Promise.all(
      list.map(async (role) => ({ ...role, userCount: await roles.countUsers(role.id) })),
    );
    res.json({ items: withCounts });
  });

  router.post('/roles', requirePermission('roles.manage'), tahrirYopiq, async (req, res) => {
    const actor = currentUser(req);
    const payload = parseBody(createRoleSchema, req);

    const role = await roles.create({
      key: payload.key,
      name: payload.name,
      description: payload.description ?? null,
      permissions: payload.permissions,
    });

    await audit.record({
      actor: actor.email,
      action: 'role.created',
      entity: 'role',
      entityId: role.id,
      payload: { key: role.key, permissions: role.permissions },
    });

    res.status(201).json({ role });
  });

  router.patch('/roles/:id', requirePermission('roles.manage'), tahrirYopiq, async (req, res) => {
    const actor = currentUser(req);
    const patch = parseBody(updateRoleSchema, req);
    const role = await roles.findById(String(req.params.id));
    if (!role) throw new NotFoundError('Rol', String(req.params.id));

    // Admin roli huquqlari kamaytirilsa, tizimga umuman kirib bo'lmay qolishi mumkin.
    if (role.key === ADMIN_ROLE_KEY && patch.permissions) {
      throw new ForbiddenError(
        'Administrator rolining ruxsatlarini o\'zgartirib bo\'lmaydi — tizimdan butunlay chiqib qolish xavfi bor',
      );
    }

    const updated = await roles.update(role.id, patch);
    container.auth.invalidate(); // huquqlar darhol kuchga kirsin

    await audit.record({
      actor: actor.email,
      action: 'role.updated',
      entity: 'role',
      entityId: role.id,
      payload: { name: patch.name, permissions: patch.permissions },
    });

    res.json({ role: updated });
  });

  router.delete('/roles/:id', requirePermission('roles.manage'), tahrirYopiq, async (req, res) => {
    const actor = currentUser(req);
    const role = await roles.findById(String(req.params.id));
    if (!role) throw new NotFoundError('Rol', String(req.params.id));

    if (role.isSystem) throw new ForbiddenError('Tizim rolini o\'chirib bo\'lmaydi');

    const userCount = await roles.countUsers(role.id);
    if (userCount > 0) {
      throw new ConflictError(
        `Bu rolda ${userCount} ta foydalanuvchi bor — avval ularni boshqa rolga o'tkazing`,
      );
    }

    await roles.remove(role.id);
    await audit.record({
      actor: actor.email,
      action: 'role.deleted',
      entity: 'role',
      entityId: role.id,
      payload: { key: role.key },
    });

    res.json({ ok: true });
  });

  // ─── API kalitlar (MCP / boshqa agentlar uchun) ─────────────────────────
  router.get('/tokens', requirePermission('users.manage'), async (_req, res) => {
    res.json({ items: await apiTokens.list() });
  });

  router.post('/tokens', requirePermission('users.manage'), tahrirYopiq, async (req, res) => {
    const actor = currentUser(req);
    const payload = parseBody(createTokenSchema, req);

    const owner = await users.findById(payload.userId);
    if (!owner) throw new ValidationError('Kalit egasi topilmadi');

    const created = await apiTokens.create({
      name: payload.name,
      userId: payload.userId,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
      createdBy: actor.id,
    });

    await audit.record({
      actor: actor.email,
      action: 'api_token.created',
      entity: 'api_token',
      entityId: created.token.id,
      payload: { name: payload.name, owner: owner.email, role: owner.role.key },
    });

    // Ochiq kalit FAQAT shu javobda — bazada xeshi saqlanadi.
    res.status(201).json({ token: created.token, plainKey: created.plainKey });
  });

  router.delete('/tokens/:id', requirePermission('users.manage'), tahrirYopiq, async (req, res) => {
    const actor = currentUser(req);
    await apiTokens.revoke(String(req.params.id));

    await audit.record({
      actor: actor.email,
      action: 'api_token.revoked',
      entity: 'api_token',
      entityId: String(req.params.id),
    });

    res.json({ ok: true });
  });

  // ─── Obyektlar katalogi (foydalanuvchiga biriktirish uchun) ─────────────
  router.get('/obyektlar', requirePermission('users.manage'), async (_req, res) => {
    res.json({ items: await contracts.obyektNomlari() });
  });

  // ─── Foydalanuvchilar ───────────────────────────────────────────────────
  router.get('/', requirePermission('users.view'), async (_req, res) => {
    const list = await users.list();
    res.json({ items: list.map(toPublicUser) });
  });

  router.post('/', requirePermission('users.manage'), tahrirYopiq, async (req, res) => {
    const actor = currentUser(req);
    const payload = parseBody(createUserSchema, req);

    if (await users.findByEmail(payload.email)) {
      throw new ConflictError('Bu email allaqachon ro\'yxatdan o\'tgan');
    }
    if (!(await roles.findById(payload.roleId))) {
      throw new ValidationError('Bunday rol topilmadi');
    }

    const user = await users.create({
      email: payload.email,
      fullName: payload.fullName,
      passwordHash: await hasher.hash(payload.password),
      roleId: payload.roleId,
      objects: payload.objects ?? [],
    });

    await audit.record({
      actor: actor.email,
      action: 'user.created',
      entity: 'user',
      entityId: user.id,
      payload: { email: user.email, role: user.role.key, objects: user.objects },
    });

    res.status(201).json({ user: toPublicUser(user) });
  });

  router.patch('/:id', requirePermission('users.manage'), tahrirYopiq, async (req, res) => {
    const actor = currentUser(req);
    const id = String(req.params.id);
    const patch = parseBody(updateUserSchema, req);

    const target = await users.findById(id);
    if (!target) throw new NotFoundError('Foydalanuvchi', id);

    // O'zini o'chirib qo'yish yoki huquqsiz rolga o'tkazish — tasodifiy
    // "o'zini qulflab qo'yish"ning eng ko'p uchraydigan sababi.
    if (target.id === actor.id) {
      if (patch.isActive === false) throw new ForbiddenError('O\'zingizni o\'chira olmaysiz');
      if (patch.roleId && patch.roleId !== target.roleId) {
        throw new ForbiddenError('O\'z rolingizni o\'zgartira olmaysiz — boshqa admin qilsin');
      }
    }

    if (patch.roleId && !(await roles.findById(patch.roleId))) {
      throw new ValidationError('Bunday rol topilmadi');
    }

    // Tizimda foydalanuvchilarni boshqara oladigan kamida bitta faol odam qolsin.
    const losingAccess =
      patch.isActive === false || (patch.roleId && patch.roleId !== target.roleId);
    if (losingAccess && target.role.permissions.includes('users.manage')) {
      const remaining = await users.countActiveWithPermission('users.manage');
      if (remaining <= 1) {
        throw new ForbiddenError(
          'Bu foydalanuvchilarni boshqara oladigan yagona faol hisob — avval boshqasini tayinlang',
        );
      }
    }

    const updated = await users.update(id, {
      fullName: patch.fullName,
      roleId: patch.roleId,
      isActive: patch.isActive,
      objects: patch.objects,
      ...(patch.password ? { passwordHash: await hasher.hash(patch.password) } : {}),
    });

    container.auth.invalidate(id);

    await audit.record({
      actor: actor.email,
      action: patch.password ? 'user.password_reset' : 'user.updated',
      entity: 'user',
      entityId: id,
      payload: {
        fullName: patch.fullName,
        role: updated.role.key,
        isActive: patch.isActive,
        objects: patch.objects,
        passwordChanged: Boolean(patch.password),
      },
    });

    res.json({ user: toPublicUser(updated) });
  });

  /**
   * Bloklangan hisobni ochish.
   *
   * Parol tiklashdan ALOHIDA: xodim ko'pincha parolini biladi, shunchaki
   * bir necha marta adashgan. Bunday holatda parolni ham almashtirish
   * keraksiz ish va yangi parolni yetkazish muammosini keltirib chiqaradi.
   */
  router.post('/:id/unlock', requirePermission('users.manage'), tahrirYopiq, async (req, res) => {
    const actor = currentUser(req);
    const id = String(req.params.id);

    const user = await users.findById(id);
    if (!user) throw new NotFoundError('Foydalanuvchi', id);
    if (!user.lockedAt && user.failedLoginAttempts === 0) {
      throw new ValidationError('Bu hisob bloklanmagan');
    }

    await users.clearLoginFailures(id);
    container.auth.invalidate(id);

    await audit.record({
      actor: actor.email,
      action: 'user.unlocked',
      entity: 'user',
      entityId: id,
      payload: {
        email: user.email,
        lockedAt: user.lockedAt?.toISOString() ?? null,
        attempts: user.failedLoginAttempts,
      },
    });

    const updated = await users.findById(id);
    res.json({ user: toPublicUser(updated ?? user) });
  });

  router.delete('/:id', requirePermission('users.manage'), tahrirYopiq, async (req, res) => {
    const actor = currentUser(req);
    const id = String(req.params.id);

    if (id === actor.id) throw new ForbiddenError('O\'zingizni o\'chira olmaysiz');

    const target = await users.findById(id);
    if (!target) throw new NotFoundError('Foydalanuvchi', id);

    if (target.role.permissions.includes('users.manage')) {
      const remaining = await users.countActiveWithPermission('users.manage');
      if (remaining <= 1) {
        throw new ForbiddenError('Foydalanuvchilarni boshqara oladigan yagona hisobni o\'chirib bo\'lmaydi');
      }
    }

    await users.remove(id);
    container.auth.invalidate(id);

    await audit.record({
      actor: actor.email,
      action: 'user.deleted',
      entity: 'user',
      entityId: id,
      payload: { email: target.email },
    });

    res.json({ ok: true });
  });

  return router;
}
