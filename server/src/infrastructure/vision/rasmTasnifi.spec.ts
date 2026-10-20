import { okKind } from '@/domain/services/IImageClassifier';
import type { AgentAuth } from '@/infrastructure/ai/agentAuth';
import { ClaudeImageClassifier } from '@/infrastructure/vision/ClaudeImageClassifier';

/** API kalit rejimi — bu fayl `fetch` yo'lini sinaydi (obuna yo'li: `chekTasnifAvtorizatsiyasi.spec.ts`). */
const API: AgentAuth = { mode: 'api', env: { ANTHROPIC_API_KEY: 'sk-ant-test' } };

/**
 * Qo'lda ishga tushiriladi: npm run test:rasm-tasnifi --workspace=server
 *
 * Tarmoqqa CHIQMAYDI — `fetch` soxta funksiya bilan almashtiriladi.
 *
 * Eng muhim tekshiruv: model erkin matn qaytarsa yoki rasm ichidagi
 * yozuvga ergashsa, natija `noaniq` bo'lishi shart. Tasnif faqat to'rtta
 * satrdan birini qabul qiladi, boshqasi yo'q.
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

// ─── 1. okKind: faqat to'rtta satr o'tadi ────────────────────────────────
check('tolov o\'tadi', okKind('tolov') === 'tolov');
check('hujjat o\'tadi', okKind('hujjat') === 'hujjat');
check('boshqa o\'tadi', okKind('boshqa') === 'boshqa');
check('noaniq o\'tadi', okKind('noaniq') === 'noaniq');
check('bo\'sh joy va katta harf tozalanadi', okKind('  TOLOV \n') === 'tolov');
check('begona so\'z noaniq bo\'ladi', okKind('kvitansiya') === 'noaniq', String(okKind('kvitansiya')));
check('erkin matn noaniq bo\'ladi', okKind('Bu rasmda to\'lov ko\'rinadi') === 'noaniq');
check('null noaniq bo\'ladi', okKind(null) === 'noaniq');
check('son noaniq bo\'ladi', okKind(7) === 'noaniq');

// ─── 2. Tasnifchi: javobni o'qish ────────────────────────────────────────
const rasm = Buffer.from('soxta-rasm');

function tasnifchi(javob: unknown, status = 200): ClaudeImageClassifier {
  const soxtaFetch = async (): Promise<Response> =>
    ({
      ok: status === 200,
      status,
      json: async () => javob,
      text: async () => JSON.stringify(javob),
    }) as unknown as Response;
  return new ClaudeImageClassifier({
    auth: API,
    model: 'claude-haiku-4-5-20251001',
    timeoutMs: 25_000,
    maxMb: 10,
    fetchFn: soxtaFetch,
  });
}

async function natija(javob: unknown, status = 200) {
  return tasnifchi(javob, status).classify({ image: rasm, mimeType: 'image/jpeg', fileName: 'chek.jpg' });
}

{
  const r = await natija({ content: [{ type: 'text', text: '{"tur":"tolov","tavsif":"Payme, 5 000 000 so\'m"}' }] });
  check('to\'g\'ri javobdan tur olinadi', r.kind === 'tolov', r.kind);
  check('tavsif olinadi', r.note === 'Payme, 5 000 000 so\'m', String(r.note));
  check('failed rost emas', r.failed === false);
}

{
  const r = await natija({ content: [{ type: 'text', text: '{"tur":"skrinshot","tavsif":"ekran"}' }] });
  check('begona tur noaniq bo\'ladi', r.kind === 'noaniq', r.kind);
}

{
  const r = await natija({ content: [{ type: 'text', text: 'bu JSON emas' }] });
  check('buzuq JSON noaniq bo\'ladi', r.kind === 'noaniq', r.kind);
  check('buzuq JSON failed bo\'ladi', r.failed === true);
}

{
  const r = await natija({ error: { message: 'overloaded' } }, 529);
  check('HTTP xato noaniq bo\'ladi', r.kind === 'noaniq', r.kind);
  check('HTTP xato failed bo\'ladi', r.failed === true);
}

// ─── 2b. Muhlat (timeout) — fetch hech qachon o'zi javob bermaydi,
// faqat AbortController signali kelganda rad etiladi. Shu bilan
// `signal` haqiqatan uzatilishi va `timeoutMs` ishlashi tekshiriladi —
// darhol o'ziga o'zi javob beradigan soxta fetch bu narsani isbotlamas
// edi (muhlat butunlay olib tashlansa ham o'tib ketardi).
{
  const hechQachonFetch = (_url: unknown, init?: RequestInit): Promise<Response> =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
  const muhlatli = new ClaudeImageClassifier({
    auth: API,
    model: 'm',
    timeoutMs: 50,
    maxMb: 10,
    fetchFn: hechQachonFetch as unknown as typeof fetch,
  });
  const boshlandi = Date.now();
  const r = await muhlatli.classify({ image: rasm, mimeType: 'image/jpeg', fileName: 'sekin.jpg' });
  const otganVaqt = Date.now() - boshlandi;
  // Muhlat 50ms, shuning uchun bu ancha tez qaytishi kerak — agar abort
  // ulanishi olib tashlansa, va'da hech qachon hal bo'lmay, shu yerda
  // butun test to'xtab qolar edi (diagnostikasiz osilib qolish).
  check('muhlatda osilib qolmaydi', otganVaqt < 1000, `${otganVaqt}ms`);
  check('muhlatda noaniq bo\'ladi', r.kind === 'noaniq', r.kind);
  check('muhlatda failed bo\'ladi', r.failed === true);
}

// ─── 3. Katta fayl — chaqiruvsiz ─────────────────────────────────────────
{
  let chaqirildi = false;
  const soxtaFetch = async (): Promise<Response> => {
    chaqirildi = true;
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as unknown as Response;
  };
  const katta = new ClaudeImageClassifier({ auth: API, model: 'm', timeoutMs: 25_000, maxMb: 0.000001, fetchFn: soxtaFetch });
  const r = await katta.classify({ image: rasm, mimeType: 'image/jpeg', fileName: 'katta.jpg' });
  check('katta fayl noaniq bo\'ladi', r.kind === 'noaniq', r.kind);
  check('katta faylda chaqiruv qilinmaydi', chaqirildi === false);
}

// ─── 3b. Qo'llab-quvvatlanmaydigan tur — chaqiruvsiz, LEKIN xato emas ────
//
// HEIC/TIFF/SVG ni Anthropic qabul qilmaydi. Ilgari bunday bayt
// `image/jpeg` deb belgilanib yuborilar, API 400 qaytarar va biz uni
// "yiqildi" deb yozardik. Endi chaqiruv umuman qilinmaydi va natija
// `failed: false` — ya'ni bu QAROR, "javob kelmadi" emas. Farq muhim:
// `failed` bo'lsa `IncomingMediaProcessor` eski xatti-harakatga
// qaytadi va bekorga to'lov tekshiruvi ochiladi.
{
  let chaqirildi = false;
  const soxtaFetch = async (): Promise<Response> => {
    chaqirildi = true;
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as unknown as Response;
  };
  const c = new ClaudeImageClassifier({ auth: API, model: 'm', timeoutMs: 25_000, maxMb: 10, fetchFn: soxtaFetch });
  const r = await c.classify({ image: rasm, mimeType: 'image/heic', fileName: 'IMG_1.heic' });
  check('heic: chaqiruv qilinmaydi', chaqirildi === false);
  check('heic: noaniq', r.kind === 'noaniq', r.kind);
  check('heic: failed YOLG\'ON (qaror, xato emas)', r.failed === false, String(r.failed));

  const bosh = await c.classify({ image: rasm, mimeType: null, fileName: 'x' });
  check('MIME yo\'q: chaqiruv qilinmaydi', chaqirildi === false);
  check('MIME yo\'q: failed yolg\'on', bosh.failed === false, String(bosh.failed));
}

// ─── 4. Kalit yo'q ───────────────────────────────────────────────────────
{
  // `auth` aniq beriladi: berilmasa konstruktor `.env` dagi haqiqiy
  // kalitni oladi va test o'zi tekshirmoqchi bo'lgan holatni (kalit
  // sozlanmagan) emas, muhitni tekshirib qo'yadi.
  const kalitsiz = new ClaudeImageClassifier({ auth: { mode: 'none', env: {} }, model: 'm', timeoutMs: 25_000, maxMb: 10 });
  check('kalitsiz available yolg\'on', kalitsiz.available === false);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
