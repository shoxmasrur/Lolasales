import { XonzodaSpeechToText, vaqtChegarasi } from '@/infrastructure/stt/XonzodaSpeechToText';

/**
 * Qo'lda ishga tushiriladi: npm run test:stt-xonzoda --workspace=server
 *
 * Tarmoqqa chiqmaydi — `fetch` va `sleep` soxta. Platformaning hujjatdagi
 * xulqi tekshiriladi: 429 va 502 da qayta urinish, qolgan xatolarda yo'q,
 * kalit faqat headerda.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

interface Chaqiruv {
  url: string;
  auth: string | null;
  fileName: string | null;
}

function muhit(javoblar: Array<{ status: number; body: string; retryAfter?: string }>) {
  const chaqiruvlar: Chaqiruv[] = [];
  const kutishlar: number[] = [];
  let i = 0;
  const fetchFn = (async (url: string, init: RequestInit) => {
    const form = init.body as FormData;
    const file = form.get('file');
    chaqiruvlar.push({
      url,
      auth: new Headers(init.headers).get('authorization'),
      fileName: file instanceof File ? file.name : null,
    });
    const j = javoblar[Math.min(i, javoblar.length - 1)]!;
    i += 1;
    const headers = new Headers();
    if (j.retryAfter) headers.set('retry-after', j.retryAfter);
    return new Response(j.body, { status: j.status, headers });
  }) as unknown as typeof fetch;
  const stt = new XonzodaSpeechToText({
    apiKey: 'xs_stt_sinov',
    baseUrl: 'https://stt.example/api/v1',
    timeoutMs: 1000,
    fetchFn,
    sleep: async (ms) => {
      kutishlar.push(ms);
    },
  });
  return { stt, chaqiruvlar, kutishlar };
}

const KIRISH = { audio: Buffer.from('ovoz'), fileName: 'voice.ogg', mimeType: 'audio/ogg' };

// ─── Muvaffaqiyat ─────────────────────────────────────────────────────────
{
  const m = muhit([{ status: 200, body: '{"text":"assalomu alaykum","audio_seconds":3.4,"ms":88}' }]);
  const r = await m.stt.transcribe(KIRISH);
  check('matn qaytdi', r, { ok: true, text: 'assalomu alaykum', language: null });
  check('manzil', m.chaqiruvlar[0]?.url, 'https://stt.example/api/v1/transcriptions');
  check('kalit headerda', m.chaqiruvlar[0]?.auth, 'Bearer xs_stt_sinov');
  check('fayl nomi', m.chaqiruvlar[0]?.fileName, 'voice.ogg');
  check('kalit URL da yo\'q', m.chaqiruvlar[0]?.url.includes('xs_stt'), false);
}

// ─── Bo'sh matn — tanilmadi ──────────────────────────────────────────────
{
  const m = muhit([{ status: 200, body: '{"text":"","audio_seconds":1.2,"ms":40}' }]);
  const r = await m.stt.transcribe(KIRISH);
  check('bo\'sh matn — ok emas', r.ok, false);
}

// ─── 429 — Retry-After kutiladi va qayta urinadi ─────────────────────────
{
  const m = muhit([
    { status: 429, body: '{"error":{"code":"rate_limited","message":"busy"}}', retryAfter: '2' },
    { status: 200, body: '{"text":"keyin ishladi"}' },
  ]);
  const r = await m.stt.transcribe(KIRISH);
  check('429 dan keyin ishladi', r.ok, true);
  check('kamida 2 s kutildi (Retry-After 2)', m.kutishlar, [2000]);
  check('ikki so\'rov', m.chaqiruvlar.length, 2);
}

// ─── 429 — Retry-After pastki chegara, kutish 120 s dan oshmaydi ──────────
{
  const m = muhit([
    { status: 429, body: '{}', retryAfter: '10' },
    { status: 429, body: '{}', retryAfter: '3600' },
    { status: 200, body: '{"text":"ok"}' },
  ]);
  await m.stt.transcribe(KIRISH);
  check('Retry-After katta bo\'lsa o\'sha, juda katta bo\'lsa 120 s', m.kutishlar, [10_000, 120_000]);
}

// ─── 429 — urinishlar tugaydi, cheksiz aylanmaydi ────────────────────────
{
  const m = muhit([{ status: 429, body: '{"error":{"code":"rate_limited","message":"busy"}}' }]);
  const r = await m.stt.transcribe(KIRISH);
  check('doimiy 429 — ok emas', r.ok, false);
  check('doimiy 429 — 6 so\'rov (1 + 5 kutish)', m.chaqiruvlar.length, 6);
  check('doimiy 429 — o\'sib boruvchi kutishlar', m.kutishlar, [2_000, 5_000, 15_000, 30_000, 60_000]);
}

// ─── Vaqt chegarasi uzun yozuvga moslashadi ──────────────────────────────
check('qisqa ovoz — asosiy chegara', vaqtChegarasi(120_000, 10), 120_000);
check('10 daqiqalik audio — 20 daqiqa emas, 15 daqiqa', vaqtChegarasi(120_000, 600), 900_000);
check('3 daqiqalik audio — 6 daqiqa', vaqtChegarasi(120_000, 180), 360_000);
check('davomiylik noma\'lum — asosiy', vaqtChegarasi(120_000, null), 120_000);

// ─── Manzil oxiridagi `/` ────────────────────────────────────────────────
{
  const chaqirilgan: string[] = [];
  const stt = new XonzodaSpeechToText({
    apiKey: 'k', baseUrl: 'https://stt.example/api/v1/',
    fetchFn: (async (url: string) => {
      chaqirilgan.push(url);
      return new Response('{"text":"x"}', { status: 200 });
    }) as unknown as typeof fetch,
  });
  await stt.transcribe(KIRISH);
  check('oxiridagi / olib tashlandi', chaqirilgan[0], 'https://stt.example/api/v1/transcriptions');
}

// ─── 502 — orqaga chekinib qayta urinadi, oxiri xato ─────────────────────
{
  const m = muhit([{ status: 502, body: '{"error":{"code":"upstream_error","message":"model down"}}' }]);
  const r = await m.stt.transcribe(KIRISH);
  check('502 — ok emas', r.ok, false);
  check('502 — 3 marta urinildi', m.chaqiruvlar.length, 3);
  check('502 — sabab kodi bilan', !r.ok && r.reason.includes('upstream_error'), true);
}

// ─── 401 — qayta urinmaydi ───────────────────────────────────────────────
{
  const m = muhit([{ status: 401, body: '{"error":{"code":"unauthenticated","message":"bad key"}}' }]);
  const r = await m.stt.transcribe(KIRISH);
  check('401 — bitta so\'rov', m.chaqiruvlar.length, 1);
  check('401 — sabab', !r.ok && r.reason.includes('unauthenticated'), true);
}

// ─── Kalit yo'q ──────────────────────────────────────────────────────────
{
  const stt = new XonzodaSpeechToText({ apiKey: undefined, baseUrl: 'https://stt.example/api/v1' });
  check('kalitsiz — available emas', stt.available, false);
  const r = await stt.transcribe(KIRISH);
  check('kalitsiz — ok emas', r.ok, false);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
