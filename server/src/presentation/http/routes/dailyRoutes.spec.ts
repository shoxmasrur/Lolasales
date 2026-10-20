import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Container } from '@/composition/container';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { dailyRoutes } from '@/presentation/http/routes/dailyRoutes';
import type { KunFiltri, XomKunStat, XomSuhbat } from '@/domain/services/kunlikToifalar';

/**
 * Qo'lda ishga tushiriladi: npm run test:daily-routes --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — route
 * `shared/config` ni tortadi; bazaga chiqmaydi).
 *
 *   • filtrsiz javob avvalgidek (raqamlar, tartib), 100 talik chegara yo'q;
 *   • 2000 talik qattiq chegara, `jami` — hammasi;
 *   • Obyekt/Agent filtri: kartalar (kunStat filtr bilan + odam kerak/takroriy)
 *     va ro'yxat shu filtrda; variantlar esa butun kundan;
 *   • kesh kaliti filtr bilan; og'ir suhbatlar so'rovi kun bo'yicha bitta;
 *   • bir xil kalitga parallel so'rov — bitta hisob;
 *   • noto'g'ri `akkaunt`/`obyekt` — 422.
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

const A1 = '11111111-1111-4111-8111-111111111111';
const A2 = '22222222-2222-4222-8222-222222222222';
const KUN = '2026-10-19';

const suhbat = (o: Partial<XomSuhbat>): XomSuhbat => ({
  conversationId: 'c',
  clientName: 'Mijoz',
  contractNo: 'A-1',
  state: 'negotiating',
  needsHuman: false,
  humanKind: null,
  humanReason: null,
  eslatma: null,
  bugunYangilangan: false,
  telegramStatus: 'found',
  jamiXabar: 4,
  vadaBor: false,
  tolovBor: false,
  bugunVadaMuddati: false,
  bugunTolovKeldi: false,
  xatoXabar: false,
  tahrirlangan: false,
  chiqishVaqtlari: [],
  mijozMatnlari: [],
  oxirgiMijozGapi: null,
  oxirgiHarakatAt: '2026-10-19T09:00:00.000Z',
  obyekt: null,
  obyektlar: [],
  akkauntId: null,
  akkauntNomi: null,
  virtualStatus: null,
  ...o,
});

const STAT: XomKunStat = {
  yozilganMijoz: 10, javobBerganMijoz: 5, vadaSoni: 2, vadaSummasi: 1000, tushumSummasi: 500,
};

let xom: XomSuhbat[] = [];
const statChaqiruv: (KunFiltri | undefined)[] = [];
let suhbatChaqiruv = 0;
let kechikish = 0;

const container = {
  clock: { now: () => new Date('2026-10-19T10:00:00.000Z') },
  repositories: {
    daily: {
      kunStat: async (_b: string, _o: string, _k: string, f?: KunFiltri) => {
        statChaqiruv.push(f);
        if (kechikish) await new Promise((r) => setTimeout(r, kechikish));
        return f?.obyekt || f?.akkaunt ? { ...STAT, yozilganMijoz: 3 } : STAT;
      },
      kunSuhbatlari: async () => {
        suhbatChaqiruv += 1;
        if (kechikish) await new Promise((r) => setTimeout(r, kechikish));
        return xom;
      },
    },
  },
} as unknown as Container;

/** Har senariy uchun yangi router — kesh router ichida yashaydi. */
async function ilova<T>(fn: (so: (qs: string) => Promise<{ status: number; json: any }>) => Promise<T>): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const app = express();
  app.use('/api/daily', dailyRoutes(container));
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/daily`;
  const so = async (qs: string) => {
    const res = await fetch(`${base}${qs}`);
    return { status: res.status, json: await res.json() };
  };
  try {
    return await fn(so);
  } finally {
    server.close();
  }
}

try {
  // ── Filtrsiz: avvalgi javob + 100 talik chegara yo'q ──
  xom = [
    ...Array.from({ length: 150 }, (_, i) =>
      suhbat({
        conversationId: `u${i}`,
        jamiXabar: 20,
        obyekt: 'Vatan',
        obyektlar: ['Vatan'],
        akkauntId: A1,
        akkauntNomi: 'Dildora',
        virtualStatus: 'sold',
        oxirgiHarakatAt: `2026-10-19T0${i % 10}:00:00.000Z`,
      })),
    suhbat({
      conversationId: 'x1',
      needsHuman: true,
      humanKind: 'agent_error',
      bugunYangilangan: true,
      obyekt: 'Bog',
      obyektlar: ['Bog', 'Vatan'],
      akkauntId: A2,
      akkauntNomi: 'Zarina',
    }),
    suhbat({ conversationId: 'toza', obyektlar: ['Yangi'], akkauntId: A2, akkauntNomi: 'Zarina' }),
  ];

  await ilova(async (so) => {
    const r = await so(`?date=${KUN}`);
    eq('filtrsiz — 200', r.status, 200);
    eq('kunStat filtrsiz chaqirildi', statChaqiruv.at(-1), { obyekt: null, akkaunt: null });
    eq('raqamlar avvalgidek', r.json.raqamlar, {
      yozilganMijoz: 10, javobBerganMijoz: 5, javobUlushi: 50, vadaSoni: 2, vadaSummasi: 1000,
      tushumSummasi: 500,
      odamKerak: { agent_error: 1, broken_promise: 0, crm_xato: 0, chek_tekshiruvi: 0, boshqa: 0 },
      takroriySoni: 0,
    });
    eq('100 talik chegara yo\'q — hammasi', [r.json.suhbatlar.length, r.json.jami], [151, 151]);
    eq('eng jiddiysi birinchi', r.json.suhbatlar[0].conversationId, 'x1');
    eq('qatorda obyekt/agent/holat', [
      r.json.suhbatlar[1].obyekt, r.json.suhbatlar[1].akkauntNomi, r.json.suhbatlar[1].holat,
    ], ['Vatan', 'Dildora', { kalit: 'sold', nomi: 'Сотилди' }]);
    eq('variantlar butun kundan', r.json.variantlar, {
      obyektlar: ['Bog', 'Vatan', 'Yangi'],
      akkauntlar: [{ id: A1, nomi: 'Dildora' }, { id: A2, nomi: 'Zarina' }],
    });
    eq('filtr javobda', r.json.filtr, { obyekt: null, akkaunt: null });

    // ── Kesh ──
    const s0 = statChaqiruv.length;
    await so(`?date=${KUN}`);
    eq('bir xil kalit — keshdan', [statChaqiruv.length, suhbatChaqiruv], [s0, 1]);

    // ── Obyekt filtri ──
    const f = await so(`?date=${KUN}&obyekt=Bog`);
    eq('obyekt filtri kunStat ga', statChaqiruv.at(-1), { obyekt: 'Bog', akkaunt: null });
    eq('boshqa kalit — kunStat qayta, suhbatlar kun keshidan', [statChaqiruv.length, suhbatChaqiruv], [s0 + 1, 1]);
    eq('obyekt filtri: ro\'yxat', f.json.suhbatlar.map((s: { conversationId: string }) => s.conversationId), ['x1']);
    eq('obyekt filtri: kartalar', [f.json.raqamlar.yozilganMijoz, f.json.raqamlar.odamKerak.agent_error], [3, 1]);
    eq('obyekt filtri: variantlar o\'zgarmaydi', f.json.variantlar.obyektlar, ['Bog', 'Vatan', 'Yangi']);

    // ── Agent filtri + AND ──
    const a = await so(`?date=${KUN}&akkaunt=${A1}`);
    eq('agent filtri', [a.json.jami, a.json.raqamlar.odamKerak.agent_error], [150, 0]);
    const va = await so(`?date=${KUN}&obyekt=Bog&akkaunt=${A1}`);
    eq('obyekt AND agent — bo\'sh', [va.json.jami, va.json.suhbatlar.length], [0, 0]);
    eq('ikki filtr kunStat ga', statChaqiruv.at(-1), { obyekt: 'Bog', akkaunt: A1 });

    // ── Bo'sh qiymat — filtr yo'q ──
    const s1 = statChaqiruv.length;
    const bosh = await so(`?date=${KUN}&obyekt=&akkaunt=`);
    eq('bo\'sh parametr — filtrsiz kesh', [bosh.json.jami, statChaqiruv.length], [151, s1]);

    // ── Validatsiya ──
    eq('akkaunt UUID emas — 422', (await so(`?date=${KUN}&akkaunt=abc`)).status, 422);
    eq('obyekt juda uzun — 422', (await so(`?date=${KUN}&obyekt=${'x'.repeat(300)}`)).status, 422);
    eq('kelajak kuni — 422', (await so('?date=2026-10-20')).status, 422);
  });

  // ── Kunda yo'q filtr qiymati: kunStat yo'q, nol javob, keshlanmaydi ──
  await ilova(async (so) => {
    const s0 = statChaqiruv.length;
    const y = await so(`?date=${KUN}&obyekt=Yoq`);
    eq('noma\'lum obyekt — 200, bo\'sh', [y.status, y.json.jami, y.json.suhbatlar.length], [200, 0, 0]);
    eq('noma\'lum obyekt — nol kartalar', [y.json.raqamlar.yozilganMijoz, y.json.raqamlar.tushumSummasi,
      y.json.raqamlar.javobUlushi], [0, 0, null]);
    eq('noma\'lum obyekt — filtr va variantlar javobda', [y.json.filtr, y.json.variantlar.obyektlar],
      [{ obyekt: 'Yoq', akkaunt: null }, ['Bog', 'Vatan', 'Yangi']]);
    const a = await so(`?date=${KUN}&akkaunt=33333333-3333-4333-8333-333333333333`);
    eq('noma\'lum akkaunt — bo\'sh', a.json.jami, 0);
    eq('noma\'lum qiymat uchun kunStat chaqirilmadi', statChaqiruv.length, s0);
  });

  // ── 2000 talik qattiq chegara ──
  xom = Array.from({ length: 2100 }, (_, i) => suhbat({ conversationId: `k${i}`, jamiXabar: 20 }));
  await ilova(async (so) => {
    const r = await so(`?date=${KUN}`);
    eq('qattiq chegara 2000, jami hammasi', [r.json.suhbatlar.length, r.json.jami], [2000, 2100]);
  });

  // ── Javob keshi: 50 ta, eng eskisi chiqariladi (hammasi tozalanmaydi) ──
  xom = Array.from({ length: 60 }, (_, i) =>
    suhbat({ conversationId: `o${i}`, jamiXabar: 20, obyektlar: [`O${i}`] }));
  await ilova(async (so) => {
    for (let i = 0; i < 51; i += 1) await so(`?date=${KUN}&obyekt=O${i}`);
    const s0 = statChaqiruv.length;
    await so(`?date=${KUN}&obyekt=O50`);
    await so(`?date=${KUN}&obyekt=O1`);
    eq('yangi kalitlar keshda qoldi', statChaqiruv.length, s0);
    await so(`?date=${KUN}&obyekt=O0`);
    eq('eng eskisi chiqarildi', statChaqiruv.length, s0 + 1);
  });

  // ── Xom ro'yxat keshi: eng ko'pi 3 kun ──
  await ilova(async (so) => {
    const h0 = suhbatChaqiruv;
    for (const k of ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']) await so(`?date=${k}&obyekt=O1`);
    eq('4 kun — 4 so\'rov', suhbatChaqiruv - h0, 4);
    await so('?date=2026-10-18&obyekt=O2');
    eq('oxirgi kun keshda', suhbatChaqiruv - h0, 4);
    await so('?date=2026-10-15&obyekt=O2');
    eq('4-kun oldingisi chiqarildi', suhbatChaqiruv - h0, 5);
  });

  // ── Parallel so'rov — bitta hisob ──
  xom = [suhbat({ conversationId: 'p', obyektlar: ['Vatan'] })];
  kechikish = 50;
  await ilova(async (so) => {
    const s0 = statChaqiruv.length;
    const h0 = suhbatChaqiruv;
    await Promise.all([
      so(`?date=${KUN}&obyekt=Vatan`),
      so(`?date=${KUN}&obyekt=Vatan`),
      so(`?date=${KUN}`),
    ]);
    eq('parallel: kalit bo\'yicha bitta kunStat', statChaqiruv.length - s0, 2);
    eq('parallel: kun bo\'yicha bitta suhbatlar so\'rovi', suhbatChaqiruv - h0, 1);
  });
} finally {
  console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
  process.exitCode = failed ? 1 : 0;
}
