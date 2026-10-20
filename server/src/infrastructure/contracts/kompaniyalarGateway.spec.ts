/**
 * Qo'lda: npm run test:kompaniyalar-gateway --workspace=server
 *
 * Gateway `shared/config` ni tortadi — shu sabab «Agent navbati testlari»da.
 * Haqiqiy CRM'ga chiqilmaydi: `fetchFn` soxta.
 *
 * NEGA TEKSHIRILADI: kompaniyalar ro'yxati GET bilan olinadi, qolgan
 * so'rovlar POST. GET ga tasodifan tana yoki POST ketsa CRM rad etadi va
 * talabnoma rekvizitsiz qoladi; zaxira manzil ham shu yo'lda ishlashi shart.
 */
process.env.CONTRACTS_API_CLIENT_ID = '1';
process.env.CONTRACTS_API_CLIENT_SECRET = 'sir';
process.env.CONTRACTS_API_USERNAME = 'u';
process.env.CONTRACTS_API_PASSWORD = 'p';
process.env.LOG_LEVEL = 'fatal';

const { XonsaroyContractGateway } = await import('@/infrastructure/contracts/XonsaroyContractGateway');
const { RekvizitManbai } = await import('@/application/services/RekvizitManbai');
const { default: xom } = await import('@/infrastructure/contracts/__fixtures__/companies.json');
type IKompaniyaGateway = import('@/domain/services/IKompaniyaGateway').IKompaniyaGateway;
type CrmKompaniya = import('@/domain/services/rekvizit').CrmKompaniya;

let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const A = 'https://a.test';
const B = 'https://b.test';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

interface Chaqiruv { url: string; method: string; body: unknown; auth: string | null }

function muhit(javob: (url: string) => Response) {
  const chaqiruvlar: Chaqiruv[] = [];
  const fetchFn = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    chaqiruvlar.push({ url, method: init?.method ?? 'GET', body: init?.body ?? null, auth: headers.Authorization ?? null });
    if (url.endsWith('/api/v2/oauth/login')) return json({ access_token: 'tok', expires_in: 2_592_000 });
    return javob(url);
  }) as typeof fetch;
  const gw = new XonsaroyContractGateway({ manzillar: [A, B], fetchFn, kut: async () => undefined });
  return { gw, chaqiruvlar };
}

// ── 1. Login POST, keyin GET companies ─────────────────────────────────
{
  const { gw, chaqiruvlar } = muhit(() => json(xom));
  const k = await gw.listCompanies();
  check("ikki so'rov", chaqiruvlar.map((c) => `${c.method} ${c.url}`), [
    `POST ${A}/api/v2/oauth/login`,
    `GET ${A}/api/v1/crm/companies`,
  ]);
  const get = chaqiruvlar[1]!;
  check('GET da tana yo\'q', get.body, null);
  check('GET da Bearer token', get.auth, 'Bearer tok');
  check('login tanasi bor', typeof chaqiruvlar[0]!.body, 'string');
  check('xaritalandi: 5 ta', k.length, 5);
  check('BARAKAT xaritasi', k.find((x) => x.id === 11), {
    id: 11, nomi: 'BARAKAT HOUSE', turi: 'МЧЖ', inn: '311053474', oked: '41201', obyektlarSoni: 1,
    hisoblar: [
      { hisob: '22626000005742909001', mfo: '00974', bank: '“Капиталбанк” АТБ Амалиёт бошқармаси', asosiy: false, faol: false },
      { hisob: '20208000705742909002', mfo: '01158', bank: 'Тошкент шаҳар, "КАПИТАЛБАНК" АТ БАНКИНИНГ АМАЛИЁТ БОШКАРМАСИ', asosiy: true, faol: true },
    ],
  });
}

// ── 2. 5xx (shlyuz) da zaxira manzilga o'tadi ──────────────────────────
{
  const { gw, chaqiruvlar } = muhit((url) => (url.startsWith(A) ? json({}, 503) : json(xom)));
  const k = await gw.listCompanies();
  check('503 → zaxira', gw.faolManzil, B);
  check('zaxiradan ham GET', chaqiruvlar.filter((c) => c.url === `${B}/api/v1/crm/companies`).map((c) => c.method), ['GET']);
  check('zaxiradan natija', k.length, 5);
}

// ── 3. Mavjud POST yo'li buzilmagan ─────────────────────────────────────
{
  const { gw, chaqiruvlar } = muhit(() => json({ data: [] }));
  await gw.findByContractNo('X1');
  const q = chaqiruvlar.find((c) => c.url.endsWith('/api/v4/order/index'))!;
  check('qidiruv POST va tanali', [q.method, JSON.parse(String(q.body)).search], ['POST', 'X1']);
}

// ── 4. RekvizitManbai: 10 daqiqalik kesh va xatoda tashlamaslik ─────────
{
  let soat = new Date('2026-10-16T10:00:00Z');
  const clock = { now: () => soat, todayIso: () => '2026-10-16' };
  let chaqirildi = 0;
  let yiqilsin = false;
  const royxat = (await (async () => muhit(() => json(xom)).gw.listCompanies())()) as CrmKompaniya[];
  const gw: IKompaniyaGateway = {
    listCompanies: async () => {
      chaqirildi += 1;
      if (yiqilsin) throw new Error('HTTP 503');
      return royxat;
    },
  };
  const manba = new RekvizitManbai(gw, clock);

  const r1 = await manba.rekvizit('311053474');
  check('manba: BARAKAT topildi', r1.ok && r1.rekvizit.hisob, '20208000705742909002');
  await manba.rekvizit('308622786');
  check('ikkinchi INN keshdan', chaqirildi, 1);

  soat = new Date('2026-10-16T10:09:59Z');
  await manba.rekvizit('311053474');
  check('9:59 da hali kesh', chaqirildi, 1);

  soat = new Date('2026-10-16T10:10:00Z');
  await manba.rekvizit('311053474');
  check('10 daqiqada yangilandi', chaqirildi, 2);

  // Kesh eskirgan va CRM yiqilgan — tashlamaydi, aniq sabab qaytaradi.
  yiqilsin = true;
  soat = new Date('2026-10-16T10:30:00Z');
  check('CRM xatosi → sabab', await manba.rekvizit('311053474'), {
    ok: false, sabab: 'Rekvizit olinmadi: CRM javob bermadi',
  });

  // Xato keshlanmaydi: CRM tiklanishi bilan darhol ishlaydi.
  yiqilsin = false;
  const r2 = await manba.rekvizit('311053474');
  check('xatodan keyin qayta so\'raydi', [r2.ok, chaqirildi], [true, 4]);

  // «CRM'dan yangilash»: kesh muddatidan oldin ham tashlanadi.
  await manba.rekvizit('311053474');
  check('kesh ichida — so\'rov yo\'q', chaqirildi, 4);
  manba.keshniTashla();
  await manba.rekvizit('311053474');
  check('keshniTashla → darhol yangi so\'rov', chaqirildi, 5);

  // INN yo'q — tanlash qoidasi sabab bilan rad etadi.
  check('manba: inn yo\'q', (await manba.rekvizit(null)).ok, false);
}

export {};

if (failed > 0) {
  console.log(`\n${failed} ta sinov yiqildi`);
  process.exit(1);
}
console.log("\nHammasi o'tdi");
