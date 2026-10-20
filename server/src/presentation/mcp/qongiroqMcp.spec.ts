import type { AddressInfo } from 'node:net';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Permission } from '@/domain/entities/Permission';
import type { User } from '@/domain/entities/User';
import { ShartnomaTopilmadi } from '@/application/services/QongiroqBrifi';
import { NotogriKirish } from '@/application/services/QongiroqNatijasi';
import { DaqiqaChegarasi } from '@/presentation/mcp/daqiqaChegarasi';
import { qongiroqMcpRouter } from '@/presentation/mcp/qongiroqMcp';

/**
 * Qo'lda ishga tushiriladi: npm run test:qongiroq-mcp --workspace=server
 *
 * Haqiqiy MCP mijozi (SDK) haqiqiy HTTP orqali (127.0.0.1, tasodifiy port)
 * ulanadi. Brif xizmati soxta — bazaga chiqmaydi.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

// ─── DaqiqaChegarasi ──────────────────────────────────────────────────────
{
  let t = 0;
  const ch = new DaqiqaChegarasi(2, 60_000, () => t);
  check('1-chaqiruv', ch.ruxsat('u1'), true);
  check('2-chaqiruv', ch.ruxsat('u1'), true);
  check('3-chaqiruv rad', ch.ruxsat('u1'), false);
  check('boshqa kalit ta\'sirlanmaydi', ch.ruxsat('u2'), true);
  t = 60_001;
  check('daqiqa o\'tgach yana ruxsat', ch.ruxsat('u1'), true);
}

function foydalanuvchi(permissions: Permission[]): User {
  return {
    id: '11111111-1111-4111-8111-111111111111', email: 'ovoz@test', passwordHash: '', fullName: 'Ovozli agent',
    roleId: 'r',
    role: { id: 'r', key: 'call_agent', name: 'r', description: null, permissions, isSystem: true, createdAt: new Date(), updatedAt: new Date() },
    isActive: true, failedLoginAttempts: 0, lockedAt: null, objects: [], createdAt: new Date(), updatedAt: new Date(),
  };
}

const brifiSoxta = {
  tuz: async (raqam: string) => {
    if (raqam !== '5582MSO25F3') throw new ShartnomaTopilmadi(raqam);
    return { shartnoma_raqami: raqam, qongiroq_mumkin: true } as never;
  },
};
const natijaSoxta = {
  yoz: async (k: { shartnoma_raqami: string; xulosa?: string; natija: string }) => {
    if (k.shartnoma_raqami !== '5582MSO25F3') throw new ShartnomaTopilmadi(k.shartnoma_raqami);
    if (k.natija === 'gaplashildi' && !k.xulosa) throw new NotogriKirish('natija "gaplashildi" bo\'lsa xulosa majburiy');
    return { qongiroq_id: 'call-1', saqlandi: 'yangi', vada: 'yoq' } as never;
  },
};
const ruxsatlar = (rol: unknown): Permission[] =>
  rol === 'yoq' ? [] : rol === 'brief' ? ['calls.brief'] : ['calls.brief', 'calls.record'];

/** Alohida ilova: chegara testi umumiy hisobni asosiy testlardan ajratib turadi. */
function ilovaYarat(auditlar: unknown[], chegara: DaqiqaChegarasi) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = foydalanuvchi(ruxsatlar(req.headers['x-rol']));
    next();
  });
  app.use('/api/mcp', qongiroqMcpRouter({
    brifi: brifiSoxta,
    natija: natijaSoxta as never,
    audit: { record: async (e: unknown) => { auditlar.push(e); } },
    chegara,
  }));
  const srv = app.listen(0);
  return { srv, url: new URL(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/mcp`) };
}

const auditlar: unknown[] = [];
const { srv: server, url } = ilovaYarat(auditlar, new DaqiqaChegarasi(100));
const chegaraAuditlari: unknown[] = [];
const { srv: chegaraServer, url: chegaraUrl } = ilovaYarat(chegaraAuditlari, new DaqiqaChegarasi(3));

async function ulan(rol = 'bor', manzil = url): Promise<Client> {
  const client = new Client({ name: 'sinov', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(manzil, { requestInit: { headers: { 'x-rol': rol } } }));
  return client;
}
const matni = (r: unknown): string =>
  ((r as { content?: Array<{ text?: string }> }).content ?? []).map((c) => c.text ?? '').join('');

try {
  const c = await ulan();
  const asboblar = (await c.listTools()).tools.map((t) => t.name);
  check('qongiroq_oldi asbobi bor', asboblar.includes('qongiroq_oldi'), true);

  const ok = await c.callTool({ name: 'qongiroq_oldi', arguments: { shartnoma_raqami: '5582MSO25F3' } });
  check('topildi — xato emas', ok.isError ?? false, false);
  check('javob JSON', JSON.parse(matni(ok)).shartnoma_raqami, '5582MSO25F3');
  check('auditga yozildi', auditlar[0], {
    actor: 'ovoz@test', action: 'calls.brief', entity: 'contract', entityId: null,
    payload: { shartnomaRaqami: '5582MSO25F3', natija: 'ok' },
  });

  const yoq = await c.callTool({ name: 'qongiroq_oldi', arguments: { shartnoma_raqami: '0000' } });
  check('topilmadi — isError', yoq.isError, true);
  check('topilmadi — matn', matni(yoq), 'Shartnoma topilmadi: 0000');
  check('topilmadi — auditga yozildi', auditlar[1], {
    actor: 'ovoz@test', action: 'calls.brief', entity: 'contract', entityId: null,
    payload: { shartnomaRaqami: '0000', natija: 'topilmadi' },
  });

  await c.close();

  // Chegara: alohida ilovada 3 tagacha o'tadi, 4-si rad (ikkala asbobga umumiy hisob).
  const k = await ulan('bor', chegaraUrl);
  await k.callTool({ name: 'qongiroq_oldi', arguments: { shartnoma_raqami: '5582MSO25F3' } });
  await k.callTool({ name: 'qongiroq_oldi', arguments: { shartnoma_raqami: '5582MSO25F3' } });
  await k.callTool({ name: 'qongiroq_natijasi', arguments: {
    shartnoma_raqami: '5582MSO25F3', qongiroq_id: 'c-1', agent_kaliti: 'm', agent_ismi: 'M',
    boshlandi: '2026-10-14T05:00:00Z', davomiylik_soniya: 1, natija: 'band' } });
  const ortiqcha = await k.callTool({ name: 'qongiroq_oldi', arguments: { shartnoma_raqami: '5582MSO25F3' } });
  check('chegara oshdi — isError', ortiqcha.isError, true);
  check('chegara oshdi — matnda 60', matni(ortiqcha).includes('60'), true);
  check('chegara oshdi — auditga yozildi', (chegaraAuditlari[3] as { payload: unknown }).payload,
    { shartnomaRaqami: '5582MSO25F3', natija: 'chegara' });
  const ortiqcha2 = await k.callTool({ name: 'qongiroq_natijasi', arguments: {
    shartnoma_raqami: '5582MSO25F3', qongiroq_id: 'c-2', agent_kaliti: 'm', agent_ismi: 'M',
    boshlandi: '2026-10-14T05:00:00Z', davomiylik_soniya: 1, natija: 'band' } });
  check('chegara natija asbobiga ham umumiy', [ortiqcha2.isError, (chegaraAuditlari[4] as { payload: { natija: string } }).payload.natija], [true, 'chegara']);
  await k.close();

  // Review Focus 4: ruxsatsiz.
  const r = await ulan('yoq');
  const rad = await r.callTool({ name: 'qongiroq_oldi', arguments: { shartnoma_raqami: '5582MSO25F3' } });
  check('ruxsatsiz — isError', rad.isError, true);
  check('ruxsatsiz — auditga yozildi', (auditlar[2] as { payload: unknown }).payload,
    { shartnomaRaqami: '5582MSO25F3', natija: 'ruxsat_yoq' });
  check('ruxsatsiz — ma\'lumot chiqmadi', matni(rad).includes('shartnoma_raqami'), false);
  await r.close();

  const n = await ulan();
  const asboblar2 = (await n.listTools()).tools.map((t) => t.name).sort();
  check('ikki asbob', asboblar2, ['qongiroq_natijasi', 'qongiroq_oldi']);
  const ok2 = await n.callTool({ name: 'qongiroq_natijasi', arguments: {
    shartnoma_raqami: '5582MSO25F3', qongiroq_id: 'call-1', agent_kaliti: 'madina', agent_ismi: 'Madina',
    boshlandi: '2026-10-14T05:00:00Z', davomiylik_soniya: 95, natija: 'kotarmadi' } });
  check('natija yozildi', JSON.parse(matni(ok2)).saqlandi, 'yangi');
  const yomon = await n.callTool({ name: 'qongiroq_natijasi', arguments: {
    shartnoma_raqami: '5582MSO25F3', qongiroq_id: 'call-2', agent_kaliti: 'madina', agent_ismi: 'Madina',
    boshlandi: '2026-10-14T05:00:00Z', davomiylik_soniya: 95, natija: 'gaplashildi' } });
  check('xulosasiz gaplashildi — isError', yomon.isError, true);
  check('xato matni tushunarli', matni(yomon).includes('xulosa majburiy'), true);
  const notanish = await n.callTool({ name: 'qongiroq_natijasi', arguments: {
    shartnoma_raqami: '5582MSO25F3', qongiroq_id: 'call-3', agent_kaliti: 'm', agent_ismi: 'M',
    boshlandi: '2026-10-14T05:00:00Z', davomiylik_soniya: 1, natija: 'boshqa_narsa' } });
  check('natija ro\'yxatda yo\'q — isError', notanish.isError, true);
  await n.close();

  const faqatBrief = await ulan('brief');
  const rad2 = await faqatBrief.callTool({ name: 'qongiroq_natijasi', arguments: {
    shartnoma_raqami: '5582MSO25F3', qongiroq_id: 'call-4', agent_kaliti: 'm', agent_ismi: 'M',
    boshlandi: '2026-10-14T05:00:00Z', davomiylik_soniya: 1, natija: 'band' } });
  check('calls.record yo\'q — isError', rad2.isError, true);
  await faqatBrief.close();

  const recordAudit = auditlar.filter((a) => (a as { action: string }).action === 'calls.record');
  // zod 'boshqa_narsa' ni handlerdan OLDIN rad etadi — u uchun audit yozilmaydi.
  check('natija auditlari', recordAudit.map((a) => (a as { payload: { natija: string } }).payload.natija),
    ['ok', 'xato', 'ruxsat_yoq']);
  check('audit payloadida qongiroqId', (recordAudit[0] as { payload: { qongiroqId: string } }).payload.qongiroqId, 'call-1');

  const get = await fetch(url, { method: 'GET' });
  check('GET — 405', get.status, 405);
} finally {
  server.close();
  chegaraServer.close();
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exit(failed ? 1 : 0);
