import type { query } from '@anthropic-ai/claude-agent-sdk';
import { resolveAgentAuth } from '@/infrastructure/ai/agentAuth';
import { ClaudeImageClassifier, type VisionJurnal } from '@/infrastructure/vision/ClaudeImageClassifier';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-tasnif-auth --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — tasnifchi
 * `shared/config` ni tortadi; tarmoqqa ham, modelga ham chiqmaydi).
 *
 * NEGA KERAK: prodda `ANTHROPIC_API_KEY` — obuna tokeni (`sk-ant-oat…`).
 * Tasnifchi uni `x-api-key` sarlavhasida yuborardi va 11-sentabrdan beri
 * 53 ta chaqiruvning HAMMASI 401 oldi. Xato `warn` darajasida yozilgani
 * uchun hech kim sezmadi, har rasm esa `failed` bo'lib eski yo'lga tushdi.
 *
 * Qo'riqlanadi:
 *   • API kalit → `fetch` + `x-api-key`; obuna tokeni → Agent SDK, `fetch` yo'q;
 *   • obuna yo'lida token `CLAUDE_CODE_OAUTH_TOKEN` ga tushadi va rasm
 *     base64 blok bo'lib ketadi;
 *   • 401 → `failed` va `error` darajali yozuv, sabab matni bilan;
 *   • kalit yoki token jurnalga HECH QACHON tushmaydi;
 *   • kalit yo'q → `available = false`, hech qanday chaqiruv yo'q.
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

const API_KALIT = 'sk-ant-api03-sinov-kaliti';
const OBUNA = 'sk-ant-oat01-sinov-tokeni';
const rasm = Buffer.from('soxta-rasm');
const JAVOB = '{"tur":"tolov","tavsif":"Payme, 5 000 000 so\'m"}';

interface Yozuv {
  daraja: 'info' | 'warn' | 'error';
  obj: Record<string, unknown>;
  msg: string;
}

/** Soxta jurnal — yozuvlarni xotirada yig'adi. */
function jurnal(): { logger: VisionJurnal; yozuvlar: Yozuv[] } {
  const yozuvlar: Yozuv[] = [];
  const yoz = (daraja: Yozuv['daraja']) => (obj: Record<string, unknown>, msg: string) => {
    yozuvlar.push({ daraja, obj, msg });
  };
  const logger = { info: yoz('info'), warn: yoz('warn'), error: yoz('error') } as unknown as VisionJurnal;
  return { logger, yozuvlar };
}

interface Chaqiruvlar {
  fetch: Array<{ url: string; headers: Record<string, string> }>;
  query: Array<{ prompt: unknown; options: Record<string, unknown> }>;
}

const yangiChaqiruvlar = (): Chaqiruvlar => ({ fetch: [], query: [] });

function soxtaFetch(
  ch: Chaqiruvlar,
  status = 200,
  body: unknown = { content: [{ type: 'text', text: JAVOB }] },
): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    ch.fetch.push({ url, headers: init?.headers as Record<string, string> });
    return { ok: status === 200, status, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

/** Agent SDK dublyori: `init` va bitta `result` xabarini beradi. */
function soxtaQuery(ch: Chaqiruvlar, natija: Record<string, unknown>): typeof query {
  return ((params: { prompt: unknown; options: Record<string, unknown> }) => {
    ch.query.push(params);
    async function* oqim() {
      yield { type: 'system', subtype: 'init' };
      yield natija;
    }
    return oqim();
  }) as unknown as typeof query;
}

// ─── 1. Avtorizatsiya turi kalit prefiksidan aniqlanadi ──────────────────
{
  const api = resolveAgentAuth({ ANTHROPIC_API_KEY: API_KALIT, AGENT_AUTH_MODE: 'auto' });
  check('sk-ant-api → api', api.mode === 'api', api.mode);

  const obuna = resolveAgentAuth({ ANTHROPIC_API_KEY: OBUNA, AGENT_AUTH_MODE: 'auto' });
  check('ANTHROPIC_API_KEY dagi sk-ant-oat → subscription', obuna.mode === 'subscription', obuna.mode);
  check(
    'obuna tokeni CLAUDE_CODE_OAUTH_TOKEN ga o\'tadi',
    obuna.env.CLAUDE_CODE_OAUTH_TOKEN === OBUNA && obuna.env.ANTHROPIC_API_KEY === undefined,
    JSON.stringify(Object.keys(obuna.env)),
  );

  const yoq = resolveAgentAuth({ AGENT_AUTH_MODE: 'auto' });
  check('kalit yo\'q → none', yoq.mode === 'none', yoq.mode);
}

// ─── 2. API kalit — fetch va x-api-key ───────────────────────────────────
{
  const ch = yangiChaqiruvlar();
  const { logger } = jurnal();
  const c = new ClaudeImageClassifier({
    auth: resolveAgentAuth({ ANTHROPIC_API_KEY: API_KALIT, AGENT_AUTH_MODE: 'auto' }),
    model: 'm',
    timeoutMs: 1_000,
    maxMb: 10,
    fetchFn: soxtaFetch(ch),
    queryFn: soxtaQuery(ch, {}),
    logger,
  });
  const r = await c.classify({ image: rasm, mimeType: 'image/jpeg', fileName: 'chek.jpg' });
  check('api: fetch bir marta chaqirildi', ch.fetch.length === 1, String(ch.fetch.length));
  check('api: kalit x-api-key sarlavhasida', ch.fetch[0]?.headers['x-api-key'] === API_KALIT);
  check('api: Agent SDK chaqirilmadi', ch.query.length === 0);
  check('api: tur o\'qildi', r.kind === 'tolov' && !r.failed, JSON.stringify(r));
}

// ─── 3. Obuna tokeni — Agent SDK, fetch yo'q ─────────────────────────────
{
  const ch = yangiChaqiruvlar();
  const { logger, yozuvlar } = jurnal();
  const c = new ClaudeImageClassifier({
    auth: resolveAgentAuth({ ANTHROPIC_API_KEY: OBUNA, AGENT_AUTH_MODE: 'auto' }),
    model: 'm',
    timeoutMs: 1_000,
    maxMb: 10,
    fetchFn: soxtaFetch(ch),
    queryFn: soxtaQuery(ch, { type: 'result', subtype: 'success', is_error: false, result: JAVOB }),
    logger,
  });
  const r = await c.classify({ image: rasm, mimeType: 'image/png', fileName: 'chek.png' });

  check('obuna: fetch chaqirilmadi', ch.fetch.length === 0, String(ch.fetch.length));
  const opts = ch.query[0]?.options as
    | { env?: Record<string, string | undefined>; tools?: unknown[]; maxTurns?: number; abortController?: unknown }
    | undefined;
  check('obuna: token CLAUDE_CODE_OAUTH_TOKEN da', opts?.env?.CLAUDE_CODE_OAUTH_TOKEN === OBUNA);
  check('obuna: asbobsiz, bitta navbat', Array.isArray(opts?.tools) && opts.tools.length === 0 && opts.maxTurns === 1);
  check('obuna: muhlat abortController orqali', opts?.abortController instanceof AbortController);

  type Xabar = { message: { content: Array<{ type: string; source?: { media_type: string; data: string } }> } };
  const xabarlar: Xabar[] = [];
  for await (const x of ch.query[0]!.prompt as AsyncIterable<Xabar>) xabarlar.push(x);
  const blok = xabarlar[0]?.message.content[0];
  check(
    'obuna: rasm base64 blok bo\'lib ketdi',
    blok?.type === 'image' && blok.source?.media_type === 'image/png' && blok.source.data === rasm.toString('base64'),
    JSON.stringify(blok?.type),
  );
  check('obuna: tur o\'qildi', r.kind === 'tolov' && !r.failed, JSON.stringify(r));
  check(
    'ishga tushishda authMode yoziladi',
    yozuvlar.some((y) => y.daraja === 'info' && y.obj.authMode === 'subscription' && y.msg === 'Rasm tasnifchisi'),
  );
  check('token jurnalga tushmadi', !JSON.stringify(yozuvlar).includes(OBUNA));
}

// ─── 4. 401 (API kalit) — failed va error darajali yozuv ─────────────────
{
  const ch = yangiChaqiruvlar();
  const { logger, yozuvlar } = jurnal();
  const c = new ClaudeImageClassifier({
    auth: resolveAgentAuth({ ANTHROPIC_API_KEY: API_KALIT, AGENT_AUTH_MODE: 'auto' }),
    model: 'm',
    timeoutMs: 1_000,
    maxMb: 10,
    fetchFn: soxtaFetch(ch, 401, { error: { type: 'authentication_error' } }),
    queryFn: soxtaQuery(ch, {}),
    logger,
  });
  const r = await c.classify({ image: rasm, mimeType: 'image/jpeg', fileName: 'chek.jpg' });
  check('401: failed', r.failed === true && r.kind === 'noaniq', JSON.stringify(r));
  const xato = yozuvlar.find((y) => y.daraja === 'error');
  check(
    '401: error darajali yozuv authMode/status/errorType bilan',
    xato?.obj.authMode === 'api' && xato.obj.status === 401 && xato.obj.errorType === 'authentication_error',
    JSON.stringify(xato?.obj),
  );
  check('401: sabab matni', Boolean(xato?.msg.includes('Vision avtorizatsiyasi rad etildi — kalit turi: API kalit')), String(xato?.msg));
  check('401: kalit jurnalga tushmadi', !JSON.stringify(yozuvlar).includes(API_KALIT));
}

// ─── 5. 401 (obuna tokeni) — SDK natijasi xato ───────────────────────────
{
  const ch = yangiChaqiruvlar();
  const { logger, yozuvlar } = jurnal();
  const c = new ClaudeImageClassifier({
    auth: resolveAgentAuth({ ANTHROPIC_API_KEY: OBUNA, AGENT_AUTH_MODE: 'auto' }),
    model: 'm',
    timeoutMs: 1_000,
    maxMb: 10,
    fetchFn: soxtaFetch(ch),
    queryFn: soxtaQuery(ch, {
      type: 'result',
      subtype: 'success',
      is_error: true,
      api_error_status: 401,
      result: 'Invalid bearer token',
    }),
    logger,
  });
  const r = await c.classify({ image: rasm, mimeType: 'image/jpeg', fileName: 'chek.jpg' });
  check('obuna 401: failed', r.failed === true, JSON.stringify(r));
  const xato = yozuvlar.find((y) => y.daraja === 'error');
  check(
    'obuna 401: error yozuvi',
    xato?.obj.authMode === 'subscription' && xato.obj.status === 401 && Boolean(xato.msg.includes('obuna tokeni')),
    JSON.stringify(xato),
  );
}

// ─── 6. Kalit yo'q — tasnifchi o'chiq ────────────────────────────────────
{
  const ch = yangiChaqiruvlar();
  const { logger } = jurnal();
  const c = new ClaudeImageClassifier({
    auth: resolveAgentAuth({ AGENT_AUTH_MODE: 'auto' }),
    fetchFn: soxtaFetch(ch),
    queryFn: soxtaQuery(ch, {}),
    logger,
  });
  check('kalit yo\'q: available yolg\'on', c.available === false);
  const r = await c.classify({ image: rasm, mimeType: 'image/jpeg', fileName: 'chek.jpg' });
  check('kalit yo\'q: chaqiruvsiz failed', r.failed && ch.fetch.length === 0 && ch.query.length === 0);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
