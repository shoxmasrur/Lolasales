import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Container } from '@/composition/container';
import type { Permission } from '@/domain/entities/Permission';
import type { User } from '@/domain/entities/User';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { requirePermission } from '@/presentation/http/middleware/auth';
import { talabnomaRoutes } from '@/presentation/http/routes/talabnomaRoutes';
import { AppError, ConflictError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:talabnoma-routes --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — route
 * `shared/config` ni tortadi; bazaga chiqmaydi).
 *
 *   • `talabnoma.view` siz — 403; `talabnoma.send` siz yuborish/qayta/bekor — 403;
 *   • xizmat xatosi: status + `error.code` + `error.message` javobda;
 *   • PDF: `application/pdf`, `inline`, ASCII fayl nomi;
 *   • `:id`/`:contractId` UUID emas — 400 (xizmatga yetmaydi);
 *   • `page`/`limit` qisqartiriladi (limit ≤ 100).
 */

let failed = 0;
function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const k = JSON.stringify(kutilgan);
  if (a === k) console.log(`✓ ${nom}`);
  else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${k})`);
  }
}

const UID = '22222222-2222-4222-8222-222222222222';
const OPERATOR = '11111111-1111-4111-8111-111111111111';
const chaqiruvlar: string[] = [];
let tayyor = true;
let yuborXatosi: Error | null = null;
let chopXatosi: Error | null = null;
const listSoragi: unknown[] = [];
const VARIANTLAR = {
  holatlar: [{ kalit: 'sold', nomi: 'Сотилди' }, { kalit: 'cancellation_process', nomi: 'Проц. отказ' }],
  obyektlar: ['Vatan'],
};
const CRM_HOLAT = {
  holat: 'ishlayapti', jami: 180, bajarildi: 45, yangilandi: 44, xatolar: 1,
  boshlangan: '2026-10-19T07:00:00.000Z', tugagan: null, sabab: null,
};

const container = {
  repositories: {
    talabnomalar: {
      findById: async (id: string) => ({ id, raqam: 7 }),
      list: async (q: unknown) => {
        listSoragi.push(q);
        return { items: [], total: 0, limit: 50, offset: 0 };
      },
      filtrVariantlari: async () => VARIANTLAR,
    },
  },
  services: {
    talabnomaPdf: { tayyormi: async () => tayyor },
    talabnomaCrmYangilash: {
      boshla: () => { chaqiruvlar.push('crm:boshla'); return CRM_HOLAT; },
      holat: () => { chaqiruvlar.push('crm:holat'); return CRM_HOLAT; },
    },
    talabnomaXizmati: {
      tayyorlar: async () => [{ contractId: UID }],
      korinish: async (id: string) => { chaqiruvlar.push(`korinish:${id}`); return Buffer.from('%PDF-k'); },
      yubor: async (id: string, user: string) => {
        chaqiruvlar.push(`yubor:${id}:${user}`);
        if (yuborXatosi) throw yuborXatosi;
        return { id: 't1', holat: 'yuborildi' };
      },
      qaytaUrin: async (id: string, user: string) => { chaqiruvlar.push(`qayta:${id}:${user}`); return { id }; },
      bekorQil: async (id: string, user: string) => { chaqiruvlar.push(`bekor:${id}:${user}`); },
      pdf: async (id: string) => { chaqiruvlar.push(`pdf:${id}`); return Buffer.from('%PDF-1'); },
      chopEtish: async (id: string) => {
        chaqiruvlar.push(`chop:${id}`);
        if (chopXatosi) throw chopXatosi;
        return Buffer.from('%PDF-chop');
      },
    },
  },
} as unknown as Container;

function foydalanuvchi(permissions: Permission[]): User {
  return {
    id: OPERATOR, email: 'operator@xonsaroy.uz', passwordHash: '', fullName: 'Test', roleId: 'r',
    role: {
      id: 'r', key: 'r', name: 'r', description: null, permissions,
      isSystem: false, createdAt: new Date(), updatedAt: new Date(),
    },
    isActive: true, failedLoginAttempts: 0, lockedAt: null, objects: [], createdAt: new Date(), updatedAt: new Date(),
  };
}

const app = express();
app.use(express.json());
// `x-rol`: yoq — hech narsa; `korish` — faqat view; `yuboruvchi` — view + send.
app.use((req, _res, next) => {
  const rol = req.headers['x-rol'];
  const huquq: Permission[] =
    rol === 'yuboruvchi' ? ['talabnoma.view', 'talabnoma.send'] : rol === 'korish' ? ['talabnoma.view'] : [];
  req.user = foydalanuvchi(huquq);
  next();
});
// createApp bilan bir xil ulanish.
app.use('/api/talabnomalar', requirePermission('talabnoma.view'), talabnomaRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/talabnomalar`;

async function so(method: string, path: string, rol = 'yuboruvchi') {
  const res = await fetch(`${base}${path}`, { method, headers: { 'x-rol': rol } });
  const tur = res.headers.get('content-type') ?? '';
  const json = (tur.includes('json') ? await res.json() : null) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { status: res.status, res, json };
}

try {
  // ── Huquq ──
  eq('view siz GET /tayyor — 403', (await so('GET', '/tayyor', 'yoq')).status, 403);
  eq('view siz GET /holat — 403', (await so('GET', '/holat', 'yoq')).status, 403);
  eq('send siz yuborish — 403', (await so('POST', `/tayyor/${UID}/yubor`, 'korish')).status, 403);
  eq('send siz qayta — 403', (await so('POST', `/${UID}/qayta`, 'korish')).status, 403);
  eq('send siz bekor — 403', (await so('POST', `/${UID}/bekor`, 'korish')).status, 403);
  eq('403 da xizmat chaqirilmadi', chaqiruvlar.length, 0);
  eq('view bilan ro\'yxat — 200', (await so('GET', '/tayyor', 'korish')).status, 200);

  // ── Holat / ro'yxat ──
  eq('holat: tayyor', (await so('GET', '/holat')).json, { tayyor: true });
  tayyor = false;
  eq('holat: sozlanmagan', (await so('GET', '/holat')).json, { tayyor: false });

  // ── Yuborish ──
  const y = await so('POST', `/tayyor/${UID}/yubor`);
  eq('yuborish — 200 va operator id', [y.status, chaqiruvlar.at(-1)], [200, `yubor:${UID}:${OPERATOR}`]);
  yuborXatosi = new ConflictError('Talabnoma endi kerak emas', 'ENDI_KERAK_EMAS');
  const k = await so('POST', `/tayyor/${UID}/yubor`);
  eq('ENDI_KERAK_EMAS — 409 + code + message', [k.status, k.json.error.code, k.json.error.message],
    [409, 'ENDI_KERAK_EMAS', 'Talabnoma endi kerak emas']);
  yuborXatosi = new ConflictError('REKVIZIT: INN topilmadi', 'REKVIZIT');
  const r = await so('POST', `/tayyor/${UID}/yubor`);
  eq('REKVIZIT — code va sabab xabarda', [r.status, r.json.error.code, r.json.error.message],
    [409, 'REKVIZIT', 'REKVIZIT: INN topilmadi']);
  yuborXatosi = new AppError('sozlanmagan', 503, 'TALABNOMA_SOZLANMAGAN');
  const s = await so('POST', `/tayyor/${UID}/yubor`);
  eq('sozlanmagan — 503 + code', [s.status, s.json.error.code], [503, 'TALABNOMA_SOZLANMAGAN']);
  yuborXatosi = null;

  // ── Qayta / bekor ──
  eq('qayta — operator id', [(await so('POST', `/${UID}/qayta`)).status, chaqiruvlar.at(-1)], [200, `qayta:${UID}:${OPERATOR}`]);
  eq('bekor', [(await so('POST', `/${UID}/bekor`)).status, chaqiruvlar.at(-1)], [200, `bekor:${UID}:${OPERATOR}`]);

  // ── PDF ──
  const p = await so('GET', `/${UID}/pdf`);
  eq('pdf: tur', p.res.headers.get('content-type'), 'application/pdf');
  eq('pdf: inline + fayl nomi', p.res.headers.get('content-disposition'), 'inline; filename="Talabnoma ET-07.pdf"');
  const ko = await so('GET', `/tayyor/${UID}/pdf`);
  eq('korinish: tur', ko.res.headers.get('content-type'), 'application/pdf');
  eq('korinish: ET-__', ko.res.headers.get('content-disposition'), 'inline; filename="Talabnoma ET-__.pdf"');
  eq('korinish: /:id/pdf ga tushmadi', chaqiruvlar.at(-1), `korinish:${UID}`);

  // ── Chop etish uchun (muhrsiz) ──
  eq('view siz chop — 403', (await so('GET', `/${UID}/pdf/chop`, 'yoq')).status, 403);
  eq('… xizmat chaqirilmadi', chaqiruvlar.at(-1) !== `chop:${UID}`, true);
  const c = await so('GET', `/${UID}/pdf/chop`, 'korish');
  eq('chop: view yetarli — 200, xizmat', [c.status, chaqiruvlar.at(-1)], [200, `chop:${UID}`]);
  eq('chop: tur', c.res.headers.get('content-type'), 'application/pdf');
  eq('chop: attachment + ASCII va UTF-8 fayl nomi', c.res.headers.get('content-disposition'),
    `attachment; filename="Talabnoma ET-07 (chop etish).pdf"; filename*=UTF-8''Talabnoma%20ET-07%20(chop%20etish).pdf`);
  eq('chop: tana', Buffer.from(await c.res.arrayBuffer()).toString(), '%PDF-chop');
  chopXatosi = new ConflictError('Faqat yuborilgan talabnoma', 'CHOP_ETIB_BOLMAYDI');
  const cx = await so('GET', `/${UID}/pdf/chop`);
  eq('chop: yuborilmagan — 409 + code', [cx.status, cx.json.error.code], [409, 'CHOP_ETIB_BOLMAYDI']);
  chopXatosi = null;

  // ── CRM'dan yangilash ──
  {
    const oldin = chaqiruvlar.length;
    eq('view siz GET /crm-yangilash — 403', (await so('GET', '/crm-yangilash', 'yoq')).status, 403);
    eq('send siz POST /crm-yangilash — 403', (await so('POST', '/crm-yangilash', 'korish')).status, 403);
    eq('403 da vazifa boshlanmadi', chaqiruvlar.length, oldin);
    const g = await so('GET', '/crm-yangilash', 'korish');
    eq('GET: view yetarli — holat', [g.status, g.json, chaqiruvlar.at(-1)], [200, CRM_HOLAT, 'crm:holat']);
    const b = await so('POST', '/crm-yangilash');
    eq('POST: send bilan — boshla, holat qaytadi', [b.status, b.json, chaqiruvlar.at(-1)], [200, CRM_HOLAT, 'crm:boshla']);
  }

  // ── UUID ──
  const oldin = chaqiruvlar.length;
  for (const yol of ['/abc/pdf', '/tayyor/abc/pdf', '/abc/pdf/chop']) eq(`GET ${yol} — 400`, (await so('GET', yol)).status, 400);
  for (const yol of ['/tayyor/abc/yubor', '/abc/qayta', '/abc/bekor']) {
    eq(`POST ${yol} — 400`, (await so('POST', yol)).status, 400);
  }
  eq('UUID emas — xizmatga yetmadi', chaqiruvlar.length, oldin);

  // ── Sahifalash ──
  await so('GET', '/');
  await so('GET', '/?holat=xato&page=3&limit=1000');
  await so('GET', '/?page=-2&limit=abc');
  eq('sukut', listSoragi[0], { limit: 50, offset: 0 });
  eq('holat + page + limit qisqartirildi', listSoragi[1], { holat: 'xato', limit: 100, offset: 200 });
  eq('yaroqsiz page/limit — sukut', listSoragi[2], { limit: 50, offset: 0 });
  eq('noma\'lum holat — 400', (await so('GET', '/?holat=yomon')).status, 400);
  // ── Shartnoma holati / obyekt filtri (server tomonda) ──
  listSoragi.length = 0;
  await so('GET', `/?holat=yuborildi&shartnomaHolati=cancellation_process&obyekt=${encodeURIComponent(' Vatan ')}&page=2`);
  eq('shartnomaHolati + obyekt (qirqilgan) repoga boradi', listSoragi[0],
    { holat: 'yuborildi', shartnomaHolati: 'cancellation_process', obyekt: 'Vatan', limit: 50, offset: 50 });
  await so('GET', '/?shartnomaHolati=&obyekt=%20');
  eq('bo\'sh filtr — e\'tiborsiz', listSoragi[1], { limit: 50, offset: 0 });
  eq('juda uzun obyekt — 400', (await so('GET', `/?obyekt=${'a'.repeat(201)}`)).status, 400);
  eq('takrorlangan shartnomaHolati — 400', (await so('GET', '/?shartnomaHolati=sold&shartnomaHolati=waiting')).status, 400);
  eq('400 da repo chaqirilmadi', listSoragi.length, 2);
  // ── Mijoz bo'yicha filtr («Batafsil» oynasi) ──
  const MIJOZ = '0b9a3c1e-2f4d-4a5b-8c6d-7e8f9a0b1c2d';
  await so('GET', `/?clientId=${MIJOZ}&limit=100`);
  eq('clientId repoga boradi', listSoragi[2], { clientId: MIJOZ, limit: 100, offset: 0 });
  eq('clientId UUID emas — 400', (await so('GET', '/?clientId=abc')).status, 400);
  eq('takrorlangan clientId — 400', (await so('GET', `/?clientId=${MIJOZ}&clientId=${MIJOZ}`)).status, 400);
  await so('GET', '/?clientId=');
  eq('bo\'sh clientId — e\'tiborsiz', listSoragi[3], { limit: 50, offset: 0 });
  eq('clientId 400 da repo chaqirilmadi', listSoragi.length, 4);
  const v = await so('GET', '/variantlar', 'korish');
  eq('GET /variantlar: view yetarli, repo javobi', [v.status, v.json], [200, VARIANTLAR]);
  eq('view siz /variantlar — 403', (await so('GET', '/variantlar', 'yoq')).status, 403);
} finally {
  server.close();
}

if (failed > 0) {
  console.log(`\n${failed} ta tekshiruv muvaffaqiyatsiz`);
  process.exit(1);
}
console.log('\nHammasi o\'tdi');
