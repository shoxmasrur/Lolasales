import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Container } from '@/composition/container';
import type { Topilgan } from '@/application/services/ShartnomaBoglovchi';
import type { MijozgaBoglashInput } from '@/application/usecases/conversations/MijozgaBoglashUseCase';
import { NOMALUM_SABAB_OPERATOR, type NomalumSuhbat } from '@/domain/entities/NomalumSuhbat';
import type { Permission } from '@/domain/entities/Permission';
import type { User } from '@/domain/entities/User';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { conversationRoutes } from '@/presentation/http/routes/conversationRoutes';

/**
 * Qo'lda ishga tushiriladi: npm run test:nomalum-route --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — route
 * `shared/config` ni tortadi; bazaga chiqmaydi).
 *
 * `POST /conversations/:id/nomalum/...`:
 *   • `conversations.agent_toggle` huquqisiz — 403, hech narsa o'zgarmaydi;
 *   • tasdiqlash: holat `tasdiq_kutilmoqda`/`hujjat_kutilmoqda` emas yoki topilgan
 *     mijoz yo'q — 409; aks holda operator emaili bilan bog'laydi, `birlashtir` o'zi aniqlanadi;
 *   • boglash: topilmadi — 404, CRM xatosi — 502;
 *   • rad-etish (ikkala holatdan): `operatorda`, topilgan mijoz tozalanadi, belgi yo'q bo'lsa `needsHuman`;
 *   • mijoz-emas: holat, agent o'chadi, navbat uziladi, audit.
 * `GET /conversations/:id` — `nomalum` va `topilganMijoz`.
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

const NOW = new Date('2026-10-15T06:00:00Z');

function suhbat(patch: Partial<NomalumSuhbat> = {}): NomalumSuhbat {
  return {
    conversationId: 'cv1', holat: 'kutilmoqda', agentJavoblari: 0, urinishlar: 0, topilmagan: 0,
    shartnomaRaqami: null, topilganClientId: null, telegramTelefon: null, sabab: null,
    createdAt: NOW, updatedAt: NOW, ...patch,
  };
}

let holat: NomalumSuhbat | null = suhbat();
let liveSuhbat: { id: string } | null = null;
/** Suhbat egasi noma'lummi (bog'langandan keyin `false`). */
let egasiNomalum = true;
let suhbatBor = true;
let topilgan: Topilgan = { kind: 'topilmadi' };
const boglashlar: MijozgaBoglashInput[] = [];
const yangilanishlar: Array<{ id: string; patch: unknown }> = [];
const suhbatYangilanishlari: Array<{ id: string; patch: unknown }> = [];
const auditlar: Array<{ actor: string; action: string }> = [];
const uzilganlar: string[] = [];
const qidiruvlar: Array<{ raqam: string; actor: string }> = [];

const container = {
  clock: { now: () => NOW },
  repositories: {
    conversations: {
      findById: async (id: string) => (suhbatBor ? { id, clientId: 'nom1', telegramAccountId: 'a1' } : null),
      update: async (id: string, patch: unknown) => {
        suhbatYangilanishlari.push({ id, patch });
        return { id };
      },
      findLiveByClientAndAccount: async () => liveSuhbat,
    },
    messages: {},
    clients: {
      findById: async (id: string) => ({
        id, fullName: id === 'real1' ? 'Ali Valiyev' : 'Begona', nomalum: id === 'nom1' ? egasiNomalum : false,
      }),
    },
    contracts: { findByClientId: async () => [] },
    promises: { findActiveByConversation: async () => null },
    audit: { record: async (r: { actor: string; action: string }) => void auditlar.push({ actor: r.actor, action: r.action }) },
    telegramAccounts: { list: async () => [] },
    paymentChecks: { findOpenByConversation: async () => null },
    nomalumSuhbatlar: {
      find: async () => holat,
      update: async (id: string, patch: Partial<NomalumSuhbat>) => {
        yangilanishlar.push({ id, patch });
        holat = suhbat({ ...holat, ...patch });
        return holat;
      },
    },
  },
  events: { publish: () => undefined },
  services: {
    paymentCheckService: { havolaKutyaptimi: async () => false },
    agent: { abort: () => 0 },
    javobYonaltiruvchi: { abort: (id: string) => { uzilganlar.push(id); return 0; } },
    shartnomaBoglovchi: {
      topVaYarat: async (raqam: string, actor: string) => {
        qidiruvlar.push({ raqam, actor });
        return topilgan;
      },
    },
  },
  useCases: {
    mijozgaBoglash: {
      execute: async (input: MijozgaBoglashInput) => {
        boglashlar.push(input);
        return { conversationId: input.conversationId };
      },
    },
  },
} as unknown as Container;

function foydalanuvchi(permissions: Permission[]): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'operator@xonsaroy.uz',
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
// `x-rol: operator` — agent_toggle bor; aks holda faqat ko'rish.
app.use((req, _res, next) => {
  req.user = foydalanuvchi(
    req.headers['x-rol'] === 'operator' ? ['conversations.view', 'conversations.agent_toggle'] : ['conversations.view'],
  );
  next();
});
app.use('/api/conversations', conversationRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/conversations`;

async function so(method: string, path: string, body?: unknown, operator = true): Promise<{ status: number; json: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(operator ? { 'x-rol': 'operator' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

try {
  // ── Huquq ──
  const ruxsatsiz = await so('POST', '/cv1/nomalum/mijoz-emas', undefined, false);
  eq('huquqsiz — 403', ruxsatsiz.status, 403);
  eq('huquqsiz — holat o\'zgarmadi', yangilanishlar.length, 0);

  // ── Tasdiqlash ──
  holat = suhbat({ holat: 'kutilmoqda', topilganClientId: 'real1' });
  eq('tasdiqlash: tasdiq kutilmayapti — 409', (await so('POST', '/cv1/nomalum/tasdiqlash')).status, 409);
  holat = suhbat({ holat: 'tasdiq_kutilmoqda', topilganClientId: null });
  eq('tasdiqlash: topilgan mijoz yo\'q — 409', (await so('POST', '/cv1/nomalum/tasdiqlash')).status, 409);
  eq('tasdiqlash: 409 da bog\'lanmadi', boglashlar.length, 0);

  holat = suhbat({ holat: 'tasdiq_kutilmoqda', topilganClientId: 'real1' });
  liveSuhbat = { id: 'cv9' };
  const tasdiq = await so('POST', '/cv1/nomalum/tasdiqlash');
  eq('tasdiqlash — 200', [tasdiq.status, tasdiq.json], [200, { conversationId: 'cv1' }]);
  eq('tasdiqlash: operator emaili, birlashtir avtomatik', boglashlar[0],
    { conversationId: 'cv1', clientId: 'real1', actor: 'operator@xonsaroy.uz', birlashtir: true });
  eq('tasdiqlash: ketayotgan navbat uzildi', uzilganlar, ['cv1']);

  // `hujjat_kutilmoqda` da ham tasdiqlash mumkin (rasm hali kelmagan bo'lsa ham) — topilgan mijoz shart.
  boglashlar.length = 0;
  liveSuhbat = null;
  holat = suhbat({ holat: 'hujjat_kutilmoqda', topilganClientId: null });
  eq('tasdiqlash: hujjat_kutilmoqda, topilgan yo\'q — 409', (await so('POST', '/cv1/nomalum/tasdiqlash')).status, 409);
  holat = suhbat({ holat: 'hujjat_kutilmoqda', topilganClientId: 'real1' });
  const tasdiqH = await so('POST', '/cv1/nomalum/tasdiqlash');
  eq('tasdiqlash: hujjat_kutilmoqda — 200, topilgan mijozga', [tasdiqH.status, boglashlar[0]],
    [200, { conversationId: 'cv1', clientId: 'real1', actor: 'operator@xonsaroy.uz', birlashtir: false }]);

  // ── Bog'lash (operator raqami) ──
  boglashlar.length = 0;
  liveSuhbat = null;
  holat = suhbat();
  eq('boglash: qisqa raqam — 422', (await so('POST', '/cv1/nomalum/boglash', { shartnomaRaqami: 'ab' })).status, 422);
  topilgan = { kind: 'topilmadi' };
  eq('boglash: topilmadi — 404', (await so('POST', '/cv1/nomalum/boglash', { shartnomaRaqami: 'xs-12345' })).status, 404);
  eq('boglash: raqam tozalanib, operator nomidan qidirildi', qidiruvlar[0], { raqam: 'XS12345', actor: 'operator@xonsaroy.uz' });
  topilgan = { kind: 'crm_xato', sabab: 'CRM: error' };
  eq('boglash: CRM xatosi — 502', (await so('POST', '/cv1/nomalum/boglash', { shartnomaRaqami: 'XS12345' })).status, 502);
  eq('boglash: xatolarda bog\'lanmadi', boglashlar.length, 0);
  topilgan = { kind: 'topildi', clientId: 'real1', crmTelefonlar: ['998901112233'] };
  const bog = await so('POST', '/cv1/nomalum/boglash', { shartnomaRaqami: 'XS12345' });
  eq('boglash — 200, telefon tekshirilmay, birlashtirishsiz', [bog.status, boglashlar[0]],
    [200, { conversationId: 'cv1', clientId: 'real1', actor: 'operator@xonsaroy.uz', birlashtir: false }]);
  holat = suhbat({ holat: 'boglandi' });
  eq('boglash: allaqachon bog\'langan — 409', (await so('POST', '/cv1/nomalum/boglash', { shartnomaRaqami: 'XS12345' })).status, 409);

  // ── Rad etish ──
  holat = suhbat();
  eq('rad-etish: tasdiq kutilmayapti — 409', (await so('POST', '/cv1/nomalum/rad-etish')).status, 409);
  holat = suhbat({ holat: 'tasdiq_kutilmoqda', topilganClientId: 'real1' });
  yangilanishlar.length = 0;
  auditlar.length = 0;
  const rad = await so('POST', '/cv1/nomalum/rad-etish');
  eq('rad-etish — 200, operatorda, topilgan tozalandi', [rad.status, yangilanishlar],
    [200, [{ id: 'cv1', patch: { holat: 'operatorda', topilganClientId: null } }]]);
  eq('rad-etish: audit', auditlar, [{ actor: 'operator@xonsaroy.uz', action: 'conversation.nomalum_rad_etildi' }]);

  // Hujjat kutilayotganda rad etish: holat operatorda. Bu holatda `needsHuman`
  // hali qo'yilmagan, shuning uchun marshrut uni o'zi qo'yadi — qo'ymasa,
  // `operatorda` dagi odamga agent ham, operator ham javob bermay qolardi.
  holat = suhbat({ holat: 'hujjat_kutilmoqda', topilganClientId: 'real1' });
  yangilanishlar.length = 0;
  suhbatYangilanishlari.length = 0;
  const radH = await so('POST', '/cv1/nomalum/rad-etish');
  eq('rad-etish: hujjat_kutilmoqda — 200, operatorda, topilgan tozalandi', [radH.status, yangilanishlar],
    [200, [{ id: 'cv1', patch: { holat: 'operatorda', topilganClientId: null } }]]);
  eq('rad-etish: hujjat_kutilmoqda — needsHuman qo\'yildi', suhbatYangilanishlari.some((u) =>
    (u.patch as { needsHuman?: boolean; humanReason?: string }).needsHuman === true
    && (u.patch as { humanReason?: string }).humanReason === NOMALUM_SABAB_OPERATOR), true);

  // ── Mijoz emas ──
  holat = suhbat({ holat: 'boglandi' });
  eq('mijoz-emas: bog\'langan — 409', (await so('POST', '/cv1/nomalum/mijoz-emas')).status, 409);
  holat = suhbat();
  yangilanishlar.length = 0;
  auditlar.length = 0;
  uzilganlar.length = 0;
  const emas = await so('POST', '/cv1/nomalum/mijoz-emas');
  eq('mijoz-emas — 200, holat mijoz_emas', [emas.status, emas.json?.nomalum?.holat, yangilanishlar],
    [200, 'mijoz_emas', [{ id: 'cv1', patch: { holat: 'mijoz_emas' } }]]);
  eq('mijoz-emas: agent o\'chdi, operator navbatidan chiqdi', suhbatYangilanishlari.at(-1),
    { id: 'cv1', patch: { agentEnabled: false, needsHuman: false, humanReason: null } });
  eq('mijoz-emas: navbat uzildi', uzilganlar, ['cv1']);
  eq('mijoz-emas: audit', auditlar, [{ actor: 'operator@xonsaroy.uz', action: 'conversation.nomalum_mijoz_emas' }]);

  // ── Noma'lum suhbat emas ──
  holat = null;
  eq('oddiy suhbatda amal — 409', (await so('POST', '/cv1/nomalum/mijoz-emas')).status, 409);

  // ── Tirik suhbat va noma'lum ega (I4) ──
  holat = suhbat({ holat: 'tasdiq_kutilmoqda', topilganClientId: 'real1' });
  boglashlar.length = 0;
  yangilanishlar.length = 0;
  egasiNomalum = false;
  eq('egasi endi noma\'lum emas — tasdiqlash 409', (await so('POST', '/cv1/nomalum/tasdiqlash')).status, 409);
  holat = suhbat();
  eq('egasi endi noma\'lum emas — mijoz-emas 409', (await so('POST', '/cv1/nomalum/mijoz-emas')).status, 409);
  eq('egasi noma\'lum emas — hech narsa o\'zgarmadi', [boglashlar.length, yangilanishlar.length], [0, 0]);
  egasiNomalum = true;
  suhbatBor = false;
  eq('suhbat tirik emas (yopilgan/o\'chirilgan) — 404', (await so('POST', '/cv1/nomalum/mijoz-emas')).status, 404);
  suhbatBor = true;

  // ── GET ──
  holat = suhbat({ holat: 'tasdiq_kutilmoqda', topilganClientId: 'real1' });
  const bor = await so('GET', '/cv1', undefined, false);
  eq('GET: nomalum holati', bor.json?.nomalum?.holat, 'tasdiq_kutilmoqda');
  eq('GET: topilganMijoz', bor.json?.topilganMijoz, { id: 'real1', fullName: 'Ali Valiyev' });
  holat = null;
  const yoq = await so('GET', '/cv1', undefined, false);
  eq('GET: oddiy suhbat — ikkalasi null', [yoq.json?.nomalum, yoq.json?.topilganMijoz], [null, null]);
} finally {
  server.close();
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
