import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Container } from '@/composition/container';
import type { Permission } from '@/domain/entities/Permission';
import type { RecontactTopic } from '@/domain/entities/RecontactTopic';
import type { User } from '@/domain/entities/User';
import type {
  IRecontactTopicRepository,
  NewRecontactTopic,
  RecontactTopicPatch,
} from '@/domain/repositories/IRecontactTopicRepository';
import type { AuditEntry } from '@/domain/repositories/ISupportRepositories';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { recontactTopicRoutes } from '@/presentation/http/routes/recontactTopicRoutes';

/**
 * Qo'lda ishga tushiriladi: npm run test:recontact-topics --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — route
 * `InstructAgentUseCase` orqali `shared/config` ni tortadi; bazaga chiqmaydi).
 *
 * NEGA BU TEST KERAK:
 *   • `?all=1` — yoqilmagan mavzular faqat `settings.edit` egasiga. Operator
 *     o'chirib qo'yilgan mavzuni tanlay olsa, admin "o'chirdim" degan
 *     matn mijozlarga ketaveradi.
 *   • Yumshoq o'chirish — o'chirilgan mavzu ro'yxatda ko'rinmaydi, tahrir
 *     orqali tirilmaydi, qayta DELETE xato bermaydi va audit ikki marta
 *     yozilmaydi.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const k = JSON.stringify(kutilgan);
  if (a === k) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${k})`);
  }
}

// ── Soxta repo: Pg repo kelishuvini (deleted_at, tartib) takrorlaydi ──
interface Qator extends RecontactTopic {
  deleted: boolean;
}

class XotiradagiMavzular implements IRecontactTopicRepository {
  readonly qatorlar: Qator[] = [];
  private n = 0;

  async list(o: { includeDisabled?: boolean } = {}): Promise<RecontactTopic[]> {
    return this.qatorlar
      .filter((q) => !q.deleted && (o.includeDisabled || q.isEnabled))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
      .map(({ deleted: _d, ...t }) => t);
  }

  async findById(id: string): Promise<RecontactTopic | null> {
    const q = this.qatorlar.find((x) => x.id === id && !x.deleted);
    if (!q) return null;
    const { deleted: _d, ...t } = q;
    return t;
  }

  async create(d: NewRecontactTopic): Promise<RecontactTopic> {
    this.n += 1;
    const q: Qator = {
      id: `00000000-0000-4000-8000-${String(this.n).padStart(12, '0')}`,
      title: d.title,
      instruction: d.instruction,
      sortOrder: d.sortOrder ?? this.n * 10,
      isEnabled: d.isEnabled ?? true,
      deleted: false,
    };
    this.qatorlar.push(q);
    return (await this.findById(q.id))!;
  }

  async update(id: string, p: RecontactTopicPatch): Promise<RecontactTopic | null> {
    const i = this.qatorlar.findIndex((x) => x.id === id && !x.deleted);
    if (i < 0) return null;
    const eski = this.qatorlar[i]!;
    this.qatorlar[i] = {
      ...eski,
      title: p.title ?? eski.title,
      instruction: p.instruction ?? eski.instruction,
      sortOrder: p.sortOrder ?? eski.sortOrder,
      isEnabled: p.isEnabled ?? eski.isEnabled,
    };
    return this.findById(id);
  }

  async softDelete(id: string): Promise<boolean> {
    const q = this.qatorlar.find((x) => x.id === id && !x.deleted);
    if (!q) return false;
    q.deleted = true;
    return true;
  }
}

const mavzular = new XotiradagiMavzular();
const jurnal: AuditEntry[] = [];
const container = {
  repositories: {
    recontactTopics: mavzular,
    audit: { record: async (e: AuditEntry) => void jurnal.push(e) },
  },
} as unknown as Container;

function foydalanuvchi(permissions: Permission[]): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: permissions.length ? 'admin@test' : 'operator@test',
    passwordHash: '',
    fullName: 'Test',
    roleId: 'r',
    role: {
      id: 'r', key: 'r', name: 'r', description: null, permissions,
      isSystem: false, createdAt: new Date(), updatedAt: new Date(),
    },
    isActive: true,
    failedLoginAttempts: 0,
    lockedAt: null, objects: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const app = express();
app.use(express.json());
// `x-rol: admin` — settings.edit bor; aks holda oddiy operator.
app.use((req, _res, next) => {
  req.user = foydalanuvchi(req.headers['x-rol'] === 'admin' ? ['clients.view', 'settings.edit'] : ['clients.view']);
  next();
});
app.use('/api/recontact', recontactTopicRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/recontact`;

async function so(
  method: string,
  path: string,
  opts: { admin?: boolean; body?: unknown } = {},
): Promise<{ status: number; json: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.admin ? { 'x-rol': 'admin' } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

try {
  // ── 1. Yaratish: ruxsat va validatsiya ──────────────────────────────
  {
    const r = await so('POST', '/topics', { body: { title: 'A', instruction: 'x' } });
    eq('operator yarata olmaydi', r.status, 403);

    const bosh = await so('POST', '/topics', { admin: true, body: { title: '  ', instruction: 'x' } });
    eq('bo\'sh sarlavha — 422', bosh.status, 422);
    eq('bo\'sh sarlavha xabari', bosh.json?.error?.message, 'Mavzu nomi bo\'sh bo\'lmasin');

    const uzun = await so('POST', '/topics', { admin: true, body: { title: 'A', instruction: 'x'.repeat(1001) } });
    eq('1001 belgili topshiriq — 422', uzun.status, 422);

    const turi = await so('POST', '/topics', { admin: true, body: { title: 5, instruction: 'x' } });
    eq('noto\'g\'ri tur — 422', turi.status, 422);

    eq('rad etilganlar saqlanmadi', mavzular.qatorlar.length, 0);
    eq('rad etilganlar jurnalga tushmadi', jurnal.length, 0);
  }

  const a = await so('POST', '/topics', { admin: true, body: { title: '  Birinchi  ', instruction: ' topshiriq ' } });
  eq('yaratildi — 201', a.status, 201);
  eq('matn trim qilingan', [a.json?.title, a.json?.instruction], ['Birinchi', 'topshiriq']);
  eq('javob kelishuv shaklida', Object.keys(a.json ?? {}).sort(), ['id', 'instruction', 'isEnabled', 'sortOrder', 'title']);
  eq('audit: created', jurnal.at(-1)?.action, 'recontact_topic.created');

  const b = await so('POST', '/topics', { admin: true, body: { title: 'Ikkinchi', instruction: 'y', isEnabled: false } });
  const c = await so('POST', '/topics', { admin: true, body: { title: 'Uchinchi', instruction: 'z' } });

  // ── 2. `?all=1` ruxsati ─────────────────────────────────────────────
  {
    const op = await so('GET', '/topics');
    eq('operator — faqat yoqilganlar', op.json?.items?.map((t: RecontactTopic) => t.title), ['Birinchi', 'Uchinchi']);

    const opAll = await so('GET', '/topics?all=1');
    eq('operator ?all=1 — 403', opAll.status, 403);

    const adm = await so('GET', '/topics', { admin: true });
    eq('admin ?all siz — faqat yoqilganlar', adm.json?.items?.length, 2);

    const admAll = await so('GET', '/topics?all=1', { admin: true });
    eq('admin ?all=1 — hammasi', admAll.json?.items?.map((t: RecontactTopic) => t.title), ['Birinchi', 'Ikkinchi', 'Uchinchi']);
  }

  // ── 3. Tahrir ───────────────────────────────────────────────────────
  {
    const r = await so('PATCH', `/topics/${b.json.id}`, { admin: true, body: { isEnabled: true } });
    eq('yoqildi', [r.status, r.json?.isEnabled, r.json?.title], [200, true, 'Ikkinchi']);
    eq('audit: eski va yangi', [jurnal.at(-1)?.payload?.eski, jurnal.at(-1)?.payload?.yangi].map((x) => (x as RecontactTopic).isEnabled), [false, true]);

    eq('operator tahrir qila olmaydi', (await so('PATCH', `/topics/${b.json.id}`, { body: { isEnabled: false } })).status, 403);
    eq('bo\'sh yamoq — 422', (await so('PATCH', `/topics/${b.json.id}`, { admin: true, body: {} })).status, 422);
    eq('bo\'sh topshiriq — 422', (await so('PATCH', `/topics/${b.json.id}`, { admin: true, body: { instruction: '' } })).status, 422);
    eq('uuid emas — 422', (await so('PATCH', '/topics/abc', { admin: true, body: { title: 'x' } })).status, 422);
    eq(
      'topilmagan — 404',
      (await so('PATCH', '/topics/99999999-9999-4999-8999-999999999999', { admin: true, body: { title: 'x' } })).status,
      404,
    );
  }

  // ── 4. Yumshoq o'chirish ────────────────────────────────────────────
  {
    eq('operator o\'chira olmaydi', (await so('DELETE', `/topics/${c.json.id}`)).status, 403);

    const oldin = jurnal.length;
    const r = await so('DELETE', `/topics/${c.json.id}`, { admin: true });
    eq('o\'chirildi — { ok: true }', [r.status, r.json], [200, { ok: true }]);
    eq('audit: deleted, matni bilan', [jurnal.at(-1)?.action, jurnal.at(-1)?.payload?.title], ['recontact_topic.deleted', 'Uchinchi']);
    eq('qator bazada qoldi (yumshoq)', mavzular.qatorlar.some((q) => q.id === c.json.id), true);

    const admAll = await so('GET', '/topics?all=1', { admin: true });
    eq('?all=1 da ham ko\'rinmaydi', admAll.json?.items?.map((t: RecontactTopic) => t.title), ['Birinchi', 'Ikkinchi']);

    const qayta = await so('DELETE', `/topics/${c.json.id}`, { admin: true });
    eq('qayta DELETE — ok (idempotent)', [qayta.status, qayta.json], [200, { ok: true }]);
    eq('qayta DELETE auditni takrorlamaydi', jurnal.length, oldin + 1);

    const tahrir = await so('PATCH', `/topics/${c.json.id}`, { admin: true, body: { isEnabled: true } });
    eq('o\'chirilgan mavzu tahrir orqali tirilmaydi — 404', tahrir.status, 404);
  }

} finally {
  server.close();
}

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
