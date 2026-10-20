import type { query } from '@anthropic-ai/claude-agent-sdk';

import { mimeQollanadi, pdfMi, PDF_MIME, RASM_MIMES } from '@/domain/services/IImageClassifier';
import type { AgentAuth } from '@/infrastructure/ai/agentAuth';
import { ClaudeImageClassifier } from '@/infrastructure/vision/ClaudeImageClassifier';

/**
 * Qo'lda ishga tushiriladi: npm run test:pdf-tasnifi --workspace=server
 *
 * Tarmoqqa CHIQMAYDI — `fetch` ham, Agent SDK ham soxta funksiya bilan
 * almashtiriladi.
 *
 * Nega kerak: 2026-09-24 gacha PDF tasniflanmasdan operatorga tushardi.
 * Endi PDF `document` bloki bo'lib modelga boradi. Bu fayl blok turini va
 * PDF ning alohida hajm chegarasini qo'riqlaydi.
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

// ─── 1. MIME ro'yxati ────────────────────────────────────────────────────
check('pdf qo\'llanadi', mimeQollanadi('application/pdf') === true);
check('jpeg qo\'llanadi', mimeQollanadi('image/jpeg') === true);
check('png qo\'llanadi', mimeQollanadi('image/png') === true);
check('katta harf tozalanadi', mimeQollanadi('APPLICATION/PDF') === true);
check('heic qo\'llanmaydi', mimeQollanadi('image/heic') === false);
check('null qo\'llanmaydi', mimeQollanadi(null) === false);

check('pdfMi: pdf rost', pdfMi('application/pdf') === true);
check('pdfMi: katta harf', pdfMi('Application/PDF') === true);
check('pdfMi: rasm yolg\'on', pdfMi('image/jpeg') === false);
check('pdfMi: null yolg\'on', pdfMi(null) === false);

check('RASM_MIMES ichida pdf yo\'q', RASM_MIMES.has(PDF_MIME) === false);

const API: AgentAuth = { mode: 'api', env: { ANTHROPIC_API_KEY: 'sk-ant-test' } };
const OBUNA: AgentAuth = { mode: 'subscription', env: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-test' } };
const JAVOB = '{"tur":"tolov","tavsif":"Payme, 5 000 000 so\'m"}';
const fayl = Buffer.from('soxta-pdf');

type Blok = { type: string; source?: { media_type: string; data: string } };

/** So'rov tanasini yig'adigan soxta `fetch`. */
function soxtaFetch(sorovlar: Array<Record<string, unknown>>): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    sorovlar.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: JAVOB }] }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

/** API yo'lidagi so'rovning birinchi bloki. */
function apiBlok(sorov: Record<string, unknown> | undefined): Blok | undefined {
  const xabarlar = sorov?.messages as Array<{ content: Blok[] }> | undefined;
  return xabarlar?.[0]?.content[0];
}

function tasnifchi(auth: AgentAuth, deps: Record<string, unknown>): ClaudeImageClassifier {
  return new ClaudeImageClassifier({
    auth,
    model: 'm',
    timeoutMs: 1_000,
    maxMb: 10,
    pdfMaxMb: 5,
    ...deps,
  });
}

// ─── 2. PDF → `document` bloki ───────────────────────────────────────────
{
  const sorovlar: Array<Record<string, unknown>> = [];
  const c = tasnifchi(API, { fetchFn: soxtaFetch(sorovlar) });
  const r = await c.classify({ image: fayl, mimeType: 'application/pdf', fileName: 'chek.pdf' });
  const blok = apiBlok(sorovlar[0]);
  check('pdf: document bloki ketdi', blok?.type === 'document', String(blok?.type));
  check('pdf: media_type application/pdf', blok?.source?.media_type === 'application/pdf', String(blok?.source?.media_type));
  check('pdf: base64 to\'g\'ri', blok?.source?.data === fayl.toString('base64'));
  check('pdf: tur o\'qildi', r.kind === 'tolov' && r.failed === false, JSON.stringify(r));
}

// ─── 3. Rasm → avvalgidek `image` bloki ──────────────────────────────────
{
  const sorovlar: Array<Record<string, unknown>> = [];
  const c = tasnifchi(API, { fetchFn: soxtaFetch(sorovlar) });
  await c.classify({ image: fayl, mimeType: 'image/png', fileName: 'chek.png' });
  const blok = apiBlok(sorovlar[0]);
  check('rasm: image bloki ketdi', blok?.type === 'image', String(blok?.type));
  check('rasm: media_type image/png', blok?.source?.media_type === 'image/png', String(blok?.source?.media_type));
}

// ─── 4. Hajm chegarasi turga bog'liq ─────────────────────────────────────
{
  const katta = Buffer.alloc(6 * 1024 * 1024);

  const pdfSorovlar: Array<Record<string, unknown>> = [];
  const pdfT = tasnifchi(API, { fetchFn: soxtaFetch(pdfSorovlar) });
  const pdfR = await pdfT.classify({ image: katta, mimeType: 'application/pdf', fileName: 'katta.pdf' });
  check('6 MB pdf: chaqiruv qilinmaydi', pdfSorovlar.length === 0, String(pdfSorovlar.length));
  check('6 MB pdf: failed rost', pdfR.failed === true, String(pdfR.failed));
  check('6 MB pdf: noaniq', pdfR.kind === 'noaniq', pdfR.kind);

  const rasmSorovlar: Array<Record<string, unknown>> = [];
  const rasmT = tasnifchi(API, { fetchFn: soxtaFetch(rasmSorovlar) });
  const rasmR = await rasmT.classify({ image: katta, mimeType: 'image/jpeg', fileName: 'katta.jpg' });
  check('6 MB rasm: chaqiruv BOR (10 MB chegarasi)', rasmSorovlar.length === 1, String(rasmSorovlar.length));
  check('6 MB rasm: tur o\'qildi', rasmR.kind === 'tolov', rasmR.kind);

  // Chegaraning aynan o'zi — `>` va `>=` farqi. `pdfMaxMb: 2` bilan
  // qurilgan tasnifchiga aynan 2 MB PDF berilsa chaqiruv QILINISHI kerak.
  const chegaraSorovlar: Array<Record<string, unknown>> = [];
  const chegaraT = tasnifchi(API, { fetchFn: soxtaFetch(chegaraSorovlar), pdfMaxMb: 2 });
  const chegara = Buffer.alloc(2 * 1024 * 1024);
  const chegaraR = await chegaraT.classify({ image: chegara, mimeType: 'application/pdf', fileName: 'chegara.pdf' });
  check('aynan 2 MB pdf (chegara 2): chaqiruv QILINADI', chegaraSorovlar.length === 1, String(chegaraSorovlar.length));
  check('aynan 2 MB pdf (chegara 2): tur o\'qildi', chegaraR.kind === 'tolov' && chegaraR.failed === false, JSON.stringify(chegaraR));
}

// ─── 5. Obuna tokeni yo'li ham `document` yuboradi ───────────────────────
{
  const chaqiruvlar: Array<{ prompt: unknown }> = [];
  const soxtaQuery = ((params: { prompt: unknown }) => {
    chaqiruvlar.push(params);
    async function* oqim() {
      yield { type: 'system', subtype: 'init' };
      yield { type: 'result', subtype: 'success', is_error: false, result: JAVOB };
    }
    return oqim();
  }) as unknown as typeof query;

  const c = tasnifchi(OBUNA, { queryFn: soxtaQuery, fetchFn: soxtaFetch([]) });
  const r = await c.classify({ image: fayl, mimeType: 'application/pdf', fileName: 'chek.pdf' });

  type Xabar = { message: { content: Blok[] } };
  const xabarlar: Xabar[] = [];
  for await (const x of chaqiruvlar[0]!.prompt as AsyncIterable<Xabar>) xabarlar.push(x);
  const blok = xabarlar[0]?.message.content[0];
  check('obuna: pdf document bloki', blok?.type === 'document', String(blok?.type));
  check('obuna: base64 to\'g\'ri', blok?.source?.data === fayl.toString('base64'));
  check('obuna: tur o\'qildi', r.kind === 'tolov' && r.failed === false, JSON.stringify(r));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
