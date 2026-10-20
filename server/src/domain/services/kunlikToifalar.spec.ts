import {
  chiqishlarSoni,
  filtrgaMos,
  kunFiltrVariantlari,
  kunRaqamlari,
  muammoliSuhbatlar,
  suhbatToifalari,
  type XomKunStat,
  type XomSuhbat,
} from '@/domain/services/kunlikToifalar';

/** Qo'lda ishga tushiriladi: npm run test:kunlik-toifalar --workspace=server */

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const suhbat = (o: Partial<XomSuhbat> = {}): XomSuhbat => ({
  conversationId: 'c1',
  clientName: 'Aliyev Vali',
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
  oxirgiHarakatAt: '2026-09-18T09:00:00.000Z',
  obyekt: null,
  obyektlar: [],
  akkauntId: null,
  akkauntNomi: null,
  virtualStatus: null,
  ...o,
});

// ─── chiqishlarSoni: 30 daqiqalik guruhlash ───────────────────────────────
check('chiqish yo\'q', chiqishlarSoni([]), 0);
check('bitta xabar', chiqishlarSoni(['2026-09-18T09:00:00.000Z']), 1);
check(
  'bo\'lakka bo\'lingan javob — bitta chiqish',
  chiqishlarSoni([
    '2026-09-18T09:00:00.000Z',
    '2026-09-18T09:00:20.000Z',
    '2026-09-18T09:25:00.000Z',
  ]),
  1,
);
check(
  'tanaffusdan keyin — ikkinchi chiqish',
  chiqishlarSoni(['2026-09-18T09:00:00.000Z', '2026-09-18T11:00:00.000Z']),
  2,
);
check(
  'aynan 30 daqiqa — hali bitta',
  chiqishlarSoni(['2026-09-18T09:00:00.000Z', '2026-09-18T09:30:00.000Z']),
  1,
);
check(
  'tartibsiz kelgan vaqtlar ham to\'g\'ri sanaladi',
  chiqishlarSoni(['2026-09-18T11:00:00.000Z', '2026-09-18T09:00:00.000Z']),
  2,
);

// ─── suhbatToifalari ──────────────────────────────────────────────────────
check('muammo yo\'q', suhbatToifalari(suhbat()), []);
check(
  'agent xatosi',
  suhbatToifalari(suhbat({ needsHuman: true, humanKind: 'agent_error', bugunYangilangan: true })),
  ['agent_xatosi'],
);
check(
  'kechagi odam kerak — bugungi ro\'yxatga tushmaydi',
  suhbatToifalari(suhbat({ needsHuman: true, humanKind: 'agent_error', bugunYangilangan: false })),
  [],
);
check('texnik uzilish', suhbatToifalari(suhbat({ xatoXabar: true })), ['texnik_uzilish']);
check(
  'salbiy javob — rad etgan',
  suhbatToifalari(suhbat({ state: 'refused', bugunYangilangan: true })),
  ['salbiy_javob'],
);
check(
  'bloklagan mijoz',
  suhbatToifalari(suhbat({ telegramStatus: 'blocked', bugunYangilangan: true })),
  ['salbiy_javob'],
);
check(
  'bugungi va\'da bajarilmagan',
  suhbatToifalari(suhbat({ bugunVadaMuddati: true, bugunTolovKeldi: false })),
  ['bajarilmagan_vada'],
);
check(
  'va\'da bajarilgan — toifa yo\'q',
  suhbatToifalari(suhbat({ bugunVadaMuddati: true, bugunTolovKeldi: true })),
  [],
);
check('uzoq suhbat', suhbatToifalari(suhbat({ jamiXabar: 12 })), ['uzoq_suhbat']);
check('11 xabar — hali uzoq emas', suhbatToifalari(suhbat({ jamiXabar: 11 })), []);
check(
  'uzoq, lekin va\'da bor — toifa yo\'q',
  suhbatToifalari(suhbat({ jamiXabar: 20, vadaBor: true })),
  [],
);
check(
  'uzoq, lekin kelishilgan — toifa yo\'q',
  suhbatToifalari(suhbat({ jamiXabar: 20, state: 'agreed' })),
  [],
);
check(
  'takroriy',
  suhbatToifalari(
    suhbat({ chiqishVaqtlari: ['2026-09-18T09:00:00.000Z', '2026-09-18T15:00:00.000Z'] }),
  ),
  ['takroriy'],
);
check('xabar tuzatilgan', suhbatToifalari(suhbat({ tahrirlangan: true })), ['xabar_tuzatilgan']);
check(
  'norozilik',
  suhbatToifalari(suhbat({ mijozMatnlari: ['Ertaga to\'layman', 'Sudga beraman'] })),
  ['norozilik'],
);
check(
  'bir nechta toifa — jiddiylik tartibida',
  suhbatToifalari(
    suhbat({
      needsHuman: true,
      humanKind: 'crm_xato',
      bugunYangilangan: true,
      xatoXabar: true,
      mijozMatnlari: ['shikoyat qilaman'],
    }),
  ),
  ['crm_xatosi', 'norozilik', 'texnik_uzilish'],
);
check(
  'buzilgan va\'da',
  suhbatToifalari(
    suhbat({ needsHuman: true, humanKind: 'broken_promise', bugunYangilangan: true }),
  ),
  ['buzilgan_vada'],
);
check(
  'sababsiz odam kerak — human_kind NULL',
  suhbatToifalari(suhbat({ needsHuman: true, humanKind: null, bugunYangilangan: true })),
  ['odam_kerak'],
);
check(
  'notanish human_kind ham odam kerak',
  suhbatToifalari(
    suhbat({ needsHuman: true, humanKind: 'nimadir_yangi', bugunYangilangan: true }),
  ),
  ['odam_kerak'],
);

// ─── muammoliSuhbatlar: filtr va tartib ───────────────────────────────────
const royxat = muammoliSuhbatlar([
  suhbat({ conversationId: 'toza' }),
  suhbat({
    conversationId: 'uzoq',
    jamiXabar: 15,
    oxirgiHarakatAt: '2026-09-18T17:00:00.000Z',
  }),
  suhbat({
    conversationId: 'xato',
    needsHuman: true,
    humanKind: 'agent_error',
    bugunYangilangan: true,
    oxirgiHarakatAt: '2026-09-18T08:00:00.000Z',
  }),
  suhbat({
    conversationId: 'uzoq2',
    jamiXabar: 30,
    oxirgiHarakatAt: '2026-09-18T18:00:00.000Z',
  }),
]);
check('toza suhbat tushmaydi', royxat.map((r) => r.conversationId), ['xato', 'uzoq2', 'uzoq']);
check('toifalar qatorda', royxat[0]?.toifalar, ['agent_xatosi']);

// ─── kunRaqamlari ─────────────────────────────────────────────────────────
const stat: XomKunStat = {
  yozilganMijoz: 10,
  javobBerganMijoz: 4,
  vadaSoni: 3,
  vadaSummasi: 15_000_000,
  tushumSummasi: 7_000_000,
};
check(
  'raqamlar',
  kunRaqamlari(stat, [
    suhbat({ needsHuman: true, humanKind: 'agent_error', bugunYangilangan: true }),
    suhbat({ needsHuman: true, humanKind: 'chek_tekshiruvi', bugunYangilangan: true }),
    suhbat({ needsHuman: true, humanKind: null, bugunYangilangan: true }),
    suhbat({ chiqishVaqtlari: ['2026-09-18T09:00:00.000Z', '2026-09-18T15:00:00.000Z'] }),
  ]),
  {
    yozilganMijoz: 10,
    javobBerganMijoz: 4,
    javobUlushi: 40,
    vadaSoni: 3,
    vadaSummasi: 15_000_000,
    tushumSummasi: 7_000_000,
    odamKerak: { agent_error: 1, broken_promise: 0, crm_xato: 0, chek_tekshiruvi: 1, boshqa: 1 },
    takroriySoni: 1,
  },
);
check(
  'hech kimga yozilmagan kun — ulush null',
  kunRaqamlari({ ...stat, yozilganMijoz: 0, javobBerganMijoz: 0 }, []).javobUlushi,
  null,
);


// ─── Qator maydonlari: obyekt, agent, shartnoma holati ────────────────────
{
  const [q] = muammoliSuhbatlar([
    suhbat({
      jamiXabar: 20,
      obyekt: 'Vatan',
      obyektlar: ['Vatan', 'Bog'],
      akkauntId: 'a1',
      akkauntNomi: 'Dildora',
      virtualStatus: 'cancellation_process',
    }),
  ]);
  check('qatorda obyekt', q?.obyekt, 'Vatan');
  check('qatorda barcha obyektlar, asosiysi birinchi', q?.obyektlar, ['Vatan', 'Bog']);
  const [t] = muammoliSuhbatlar([
    suhbat({ jamiXabar: 20, obyekt: 'Vatan', obyektlar: ['Bog', 'Vatan', 'Yangi'] }),
  ]);
  check('asosiysi oldinga chiqadi', t?.obyektlar, ['Vatan', 'Bog', 'Yangi']);
  check('qatorda agent', [q?.akkauntId, q?.akkauntNomi], ['a1', 'Dildora']);
  check('holat CRM nomi bilan', q?.holat, { kalit: 'cancellation_process', nomi: 'Проц. отказ' });
  const [n] = muammoliSuhbatlar([suhbat({ jamiXabar: 20, virtualStatus: 'Сотилди' })]);
  check('Excel nomi ham kalitga keladi', n?.holat, { kalit: 'sold', nomi: 'Сотилди' });
  const [b] = muammoliSuhbatlar([suhbat({ jamiXabar: 20 })]);
  check('holat yo\'q — null', b?.holat, null);
}

// ─── filtrgaMos: Obyekt va Agent (AND) ────────────────────────────────────
{
  const x = suhbat({ obyekt: 'Vatan', obyektlar: ['Vatan', 'Bog'], akkauntId: 'a1' });
  check('filtrsiz — mos', filtrgaMos(x, {}), true);
  check('null filtr — mos', filtrgaMos(x, { obyekt: null, akkaunt: null }), true);
  check('ikkinchi shartnoma obyekti ham mos', filtrgaMos(x, { obyekt: 'Bog' }), true);
  check('boshqa obyekt — mos emas', filtrgaMos(x, { obyekt: 'Yangi' }), false);
  check('akkaunt mos', filtrgaMos(x, { akkaunt: 'a1' }), true);
  check('akkaunt boshqa', filtrgaMos(x, { akkaunt: 'a2' }), false);
  check('ikkalasi — AND', filtrgaMos(x, { obyekt: 'Vatan', akkaunt: 'a2' }), false);
  check('akkauntsiz suhbat akkaunt filtriga tushmaydi', filtrgaMos(suhbat(), { akkaunt: 'a1' }), false);
}

// ─── kunFiltrVariantlari ──────────────────────────────────────────────────
check(
  'variantlar: takrorsiz, tartiblangan, bo\'shlari yo\'q',
  kunFiltrVariantlari([
    suhbat({ obyektlar: ['Vatan', 'Bog'], akkauntId: 'a2', akkauntNomi: 'Zarina' }),
    suhbat({ obyektlar: ['Bog'], akkauntId: 'a1', akkauntNomi: 'Dildora' }),
    suhbat({ obyektlar: [], akkauntId: 'a2', akkauntNomi: 'Zarina' }),
    suhbat(),
  ]),
  {
    obyektlar: ['Bog', 'Vatan'],
    akkauntlar: [
      { id: 'a1', nomi: 'Dildora' },
      { id: 'a2', nomi: 'Zarina' },
    ],
  },
);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
