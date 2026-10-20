/**
 * Qo'lda ishga tushiriladi: npm run test:contract-fallback
 *
 * NEGA TEKSHIRILADI: 2026-10-06 da asosiy domen DNS'dan yo'qoldi va agent
 * CRM'siz qoldi. Zaxiraga o'tish noto'g'ri ishlasa ikki xil zarar bor:
 * o'tmasa — o'sha nosozlik takrorlanadi; keraksiz o'tsa (401/404 da) —
 * ishlab turgan manzil tashlab ketiladi.
 */
process.env.CONTRACTS_API_CLIENT_ID = '1';
process.env.CONTRACTS_API_CLIENT_SECRET = 'sir';
process.env.CONTRACTS_API_USERNAME = 'u';
process.env.CONTRACTS_API_PASSWORD = 'p';
process.env.LOG_LEVEL = 'fatal';

const { XonsaroyContractGateway, apiManzillari } = await import(
  '@/infrastructure/contracts/XonsaroyContractGateway'
);

let failed = 0;
function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(kutilgan);
  if (a === b) console.log(`✓ ${nom}`);
  else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${b})`);
  }
}

const A = 'https://a.test';
const B = 'https://b.test';

type Javob = (url: string) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Sog'lom server: login token beradi, qidiruv bo'sh ro'yxat qaytaradi. */
const soglom: Javob = (url) =>
  url.endsWith('/oauth/login') ? json({ access_token: 't', expires_in: 2_592_000 }) : json({ data: [] });

function muhit(xulq: Record<string, Javob>) {
  const chaqiruvlar: string[] = [];
  const fetchFn = (async (input: unknown) => {
    const url = String(input);
    chaqiruvlar.push(url);
    const host = url.startsWith(A) ? A : B;
    return xulq[host]!(url);
  }) as typeof fetch;
  const gw = new XonsaroyContractGateway({ manzillar: [A, B], fetchFn, kut: async () => undefined });
  const soni = (host: string): number => chaqiruvlar.filter((u) => u.startsWith(host)).length;
  return { gw, chaqiruvlar, soni };
}

const dnsXato: Javob = () => {
  throw new TypeError('fetch failed: getaddrinfo ENOTFOUND');
};

// ── 1. Manzillar ro'yxati ──────────────────────────────────────────────
eq('asosiy birinchi, takrorsiz, `/` siz',
  apiManzillari('https://b.test/', 'https://b.test, https://a.test/ ,'), [B, A]);

// ── 2. Asosiy DNS'da yo'q → zaxira ishlaydi va eslab qolinadi ──────────
{
  const { gw, soni } = muhit({ [A]: dnsXato, [B]: soglom });
  eq('natija keldi (topilmadi = null)', await gw.findByContractNo('X1'), null);
  eq('faol manzil — zaxira', gw.faolManzil, B);
  const oldin = soni(A);
  await gw.findByContractNo('X2');
  eq('keyingi so\'rov o\'lik manzilga urilmaydi', soni(A), oldin);
}

// ── 3. 502 ham zaxiraga o'tkazadi ──────────────────────────────────────
{
  const { gw } = muhit({ [A]: () => json({}, 502), [B]: soglom });
  await gw.findByContractNo('X1');
  eq('502 → zaxira', gw.faolManzil, B);
}

// ── 4. 404 va 400 — server ishlayapti, manzil almashmaydi ──────────────
{
  const { gw, soni } = muhit({
    [A]: (url) => (url.endsWith('/oauth/login') ? soglom(url) : json({}, 404)),
    [B]: soglom,
  });
  eq('404 → null', await gw.findByContractNo('X1'), null);
  eq('404 da zaxiraga tegilmaydi', soni(B), 0);
}
{
  const { gw, soni } = muhit({
    [A]: (url) => (url.endsWith('/oauth/login') ? soglom(url) : json({}, 400)),
    [B]: soglom,
  });
  let xato = '';
  try {
    await gw.findByContractNo('X1');
  } catch (err) {
    xato = (err as Error).message;
  }
  eq('400 xato bo\'lib qaytadi', xato, 'HTTP 400');
  eq('400 da zaxiraga tegilmaydi', soni(B), 0);
  eq('faol manzil o\'zgarmadi', gw.faolManzil, A);
}

// ── 5. Noto'g'ri parol (login 401) — zaxiraga o'tmaydi ─────────────────
{
  const { gw, soni } = muhit({ [A]: () => json({}, 401), [B]: soglom });
  let otildi = false;
  try {
    await gw.findByContractNo('X1');
  } catch {
    otildi = true;
  }
  eq('login 401 xato beradi', otildi, true);
  eq('login 401 da zaxiraga tegilmaydi', soni(B), 0);
}

// ── 6. Ikkalasi ham yiqilgan — xato, lekin ikkalasi sinalgan ───────────
{
  const { gw, soni } = muhit({ [A]: dnsXato, [B]: dnsXato });
  let otildi = false;
  try {
    await gw.findByContractNo('X1');
  } catch {
    otildi = true;
  }
  eq('ikkalasi yiqilsa xato', otildi, true);
  eq('zaxira ham sinab ko\'rilgan', soni(B) > 0, true);
}

// ── 7. Zaxira ham yiqilsa asosiyga qaytadi ─────────────────────────────
{
  let bTirik = true;
  let aTirik = false;
  const { gw } = muhit({
    [A]: (u) => (aTirik ? soglom(u) : dnsXato(u)),
    [B]: (u) => (bTirik ? soglom(u) : dnsXato(u)),
  });
  await gw.findByContractNo('X1');
  eq('avval zaxiraga o\'tdi', gw.faolManzil, B);
  bTirik = false;
  aTirik = true;
  await gw.findByContractNo('X2');
  eq('zaxira yiqilgach asosiyga qaytdi', gw.faolManzil, A);
}

// ── 8. Token boshqa manzilga olib o'tilmaydi ───────────────────────────
{
  let aTirik = true;
  const { gw, chaqiruvlar } = muhit({ [A]: (u) => (aTirik ? soglom(u) : dnsXato(u)), [B]: soglom });
  await gw.findByContractNo('X1');
  aTirik = false;
  await gw.findByContractNo('X2');
  eq('zaxirada qaytadan login qilindi', chaqiruvlar.includes(`${B}/api/v2/oauth/login`), true);
}

export {};

if (failed > 0) {
  console.log(`\n${failed} ta sinov yiqildi`);
  process.exit(1);
}
console.log('\nHammasi o\'tdi');
