import { buildContextBlock } from '@/infrastructure/ai/prompt/systemPrompt';
import type { AgentContractFacts, AgentDebtContext } from '@/domain/services/IAgentEngine';
import { toInterlocutor, toTurnOutput } from '@/infrastructure/ai/agentOutput';
import { formatSom } from '@/shared/money';
import { formatUzDate } from '@/shared/datetime';

/**
 * Qo'lda ishga tushiriladi: npm run test:context-block --workspace=server
 *
 * Uchta narsani qo'riqlaydi:
 *   1. Agentga KERAKLI faktlar promptga tushishi (uy, to'lanmagan oylar,
 *      oxirgi to'lovlar).
 *   2. Qora ro'yxatdagi maydonlar promptga TUSHMASLIGI — shartnoma
 *      narxi, umumiy qoldiq va h.k.
 *   3. Bir nechta shartnomali mijozda har bir fakt O'Z shartnomasiga
 *      bog'langan holda turishi.
 *
 * Ikkinchisi muhimroq: agent ko'rgan har bir raqamni mijozga aytib
 * yuborishi mumkin.
 */
const NOW = new Date('2026-08-06T09:00:00Z');
const TZ = 'Asia/Tashkent';

const BIRINCHI: AgentContractFacts = {
  contractNo: '5582MSO25F3',
  objectName: 'MUHABBAT SHAHRI',
  apartment: { number: '14Б-38', floor: 6, rooms: 2, entrance: '14', block: 'Блок 14', area: 54.9 },
  monthlyPayment: 8_339_000,
  debtFirst: 0,
  debtMonthly: 17_356_000, debtMeter: 0, statusLabel: null,
  daysOverdue: 73,
  missedMonths: 3,
  unpaidMonths: [
    { dateIso: '2026-05-25', amount: 8_339_000, paid: 7_661_000 },
    { dateIso: '2026-06-25', amount: 8_339_000, paid: 0 },
    { dateIso: '2026-07-25', amount: 8_339_000, paid: 0 },
  ],
  recentPayments: [
    { dateIso: '2026-06-25', amount: 9_000_000 },
    { dateIso: '2026-05-20', amount: 8_339_000 },
  ],
  nextPaymentDate: '2026-08-25',
  contractDate: '2025-11-14',
  completionDate: '2029-12-31',
  paidTotal: 149_421_132,
  warningCount: 0,
};

const context: AgentDebtContext = {
  clientName: 'Umarov Aziz Akmalovich',
  clientFirstName: null,
  debtFirst: 0,
  debtMonthly: 17_356_000,
  debtSum: 17_356_000,
  daysOverdue: 73,
  contracts: [BIRINCHI],
};

const block = buildContextBlock(context, NOW, TZ);

let failed = 0;
const has = (name: string, needle: string): void => {
  const ok = block.includes(needle);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — "${needle}" topilmadi`}`);
};
const hasNot = (name: string, needle: string): void => {
  const ok = !block.includes(needle);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — "${needle}" PROMPTGA TUSHIB QOLGAN`}`);
};
const check = (name: string, ok: boolean, hint = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${hint}`}`);
};

// ─── Bo'lishi kerak ──────────────────────────────────────────────────────
has('shartnoma raqami', '5582MSO25F3');
has('obyekt nomi', 'MUHABBAT SHAHRI');
has('uy raqami', '14Б-38');
has('qavat', '6-qavat');
has('xonalar soni', '2 xonali');
has('maydon', '54.9 m²');
has('blok', 'Блок 14');
// Summalar `formatSom` orqali kutiladi: `Intl` ru-RU ajratmas bo'shliq
// (U+00A0) ishlatadi, oddiy probel bilan yozilgan test yolg'on yiqilardi.
has("oylik to'lov", formatSom(8_339_000));
has('kechikkan summa', formatSom(17_356_000));
has('kechikish kuni', '73 kun');
has('aniq oy soni', '3 oylik');
has("to'lanmagan oylar bo'limi", "To'lanmagan oylar");
has('qisman to\'langan oy ko\'rsatildi', `(${formatSom(7_661_000)} to'langan)`);
has("oxirgi to'lovlar bo'limi", 'Oxirgi kelib tushgan');
has("oxirgi to'lov summasi", formatSom(9_000_000));

// ─── Bitish muddati: faqat chorak, o'tgani chizilmaydi ──────────────────
has('bitish muddati chorak shaklida', 'Xonadonni bitish muddati: 2029-yilning 4-choragi');
// Xom sana promptga tushsa, agent uni mijozga aytib yuboradi — kun esa
// va'da bo'lib eshitiladi.
hasNot('bitish muddatining xom sanasi', '2029-12-31');
hasNot('bitish muddati kun bilan', '31-dekabr');
const bitish = (completionDate: string | null): string =>
  buildContextBlock({ ...context, contracts: [{ ...BIRINCHI, completionDate }] }, NOW, TZ);
check("muddat yo'q — qator yo'q", !bitish(null).includes('bitish muddati'), 'null sana chizildi');
// `chorakMuddati` buzuq sanada (oy 12 dan katta) `null` qaytaradi —
// `bitishQatori` ham qatorni chizmasligi kerak, aks holda "Xonadonni
// bitish muddati: " so'zidan keyin bo'sh joy qolib ketardi.
check("buzuq sana — qator yo'q", !bitish('2029-13-31').includes('bitish muddati'), 'buzuq sana chizildi');
// NOW = 2026-08-06 (Toshkent). CRM'da eski sana qolib ketgan bo'lishi
// mumkin — "o'tgan chorakda bitadi" degan gap kulgili.
check("muddat o'tib ketgan — qator yo'q", !bitish('2026-08-05').includes('bitish muddati'), 'kechagi sana chizildi');
check(
  "bugungi muddat hali o'tmagan",
  bitish('2026-08-06').includes('Xonadonni bitish muddati: 2026-yilning 3-choragi'),
  'bugungi sana chizilmadi',
);

// ─── Murojaat shakli ─────────────────────────────────────────────────────
// CRM ism bermagan (`clientFirstName: null`) — taxminga qaytiladi.
has('taxmin qilingan murojaat shakli', 'Aziz aka');

// Eng ko'p uchraydigan yozuv: FAMILIYA + ism + otasining ismi + o'g'li.
// Ilgari bu yerda familiya ism deb olinardi ("Raximbayev aka").
const uzbekStyle = buildContextBlock(
  { ...context, clientName: "Raximbayev Aziz Karim o'g'li" },
  NOW,
  TZ,
);
check(
  '"Familiya Ism Ota o\'g\'li" da familiya ism deb olinmaydi',
  uzbekStyle.includes('Aziz aka') && !uzbekStyle.includes('Raximbayev aka'),
);

// CRM ism berganda taxmin UMUMAN ishlatilmaydi — bazada faqat familiya
// bo'lsa ham to'g'ri murojaat chiqadi.
const fromCrm = buildContextBlock(
  { ...context, clientName: 'Raximbayev Aziz Karimovich', clientFirstName: 'Alisher' },
  NOW,
  TZ,
);
check(
  'CRM bergan ism taxmindan ustun turadi',
  fromCrm.includes('Alisher aka') && !fromCrm.includes('Aziz aka'),
);

// ─── Suhbatdosh ──────────────────────────────────────────────────────────
// 2026-09-16: Dildora opaning Telegramida o'g'li Oybek yozadi. Suhbatdosh
// ma'lum bo'lsa shartnoma egasining iliq murojaat shakli BERILMAYDI —
// aks holda agent unga ergashib Oybekka "Dildora opa" / "opam" deydi.
const oybek = buildContextBlock(
  {
    ...context,
    clientName: 'Xaitmuxamedova Dildora Karimovna',
    clientFirstName: 'Dildora',
    interlocutor: { name: 'Oybek', gender: 'male', relation: "o'g'li" },
  },
  NOW,
  TZ,
);
check(
  'suhbatdoshga ismi bilan murojaat qilinadi',
  oybek.includes('Murojaat shakli: "Oybek"') && oybek.includes("shartnoma egasining o'g'li"),
);
check(
  "shartnoma egasining murojaat shakli qatori bo'lmaydi",
  !oybek.includes('Iliq murojaat shakli'),
);
check('erkak suhbatdoshga "opa" taqiqlanadi', oybek.includes('"opam"') && oybek.includes('U ERKAK'));
check('shartnoma egasi uchinchi shaxsda qoladi', oybek.includes('uchinchi shaxsda gapir ("Dildora opa")'));

const nomalum = buildContextBlock(
  { ...context, interlocutor: { name: 'Sardor', gender: null, relation: null } },
  NOW,
  TZ,
);
check(
  'jinsi va kimligi noma\'lum suhbatdosh',
  nomalum.includes('shartnoma egasi EMAS') && nomalum.includes('"aka" yoki "opa" ishlatma'),
);

// Ismi aytilmagan suhbatdosh: shartnoma egasining ismi bilan ham, "aka/opa"
// bilan ham salomlashilmaydi.
const ismsiz = buildContextBlock(
  { ...context, interlocutor: { name: null, gender: 'male', relation: "o'g'li" } },
  NOW,
  TZ,
);
check(
  'ismsiz suhbatdoshga ismsiz murojaat qilinadi',
  ismsiz.includes("Telegramda boshqa odam yozadi — shartnoma egasining o'g'li") &&
    ismsiz.includes('ismsiz yoz') &&
    !ismsiz.includes('Iliq murojaat shakli') &&
    !ismsiz.includes('null'),
);

// Modeldan kelgan xom qiymat: ismsiz suhbatdosh saqlanmaydi, jins esa
// faqat ikki qiymatdan biri bo'ladi.
check(
  'ismi ham, kimligi ham yo\'q suhbatdosh tashlanadi',
  toInterlocutor({ name: '  ', gender: 'male', relation: null }) === null,
);
check(
  'ismsiz, lekin kimligi ma\'lum suhbatdosh saqlanadi',
  toInterlocutor({ name: null, gender: 'male', relation: 'eri' })?.relation === 'eri',
);
check(
  "noto'g'ri jins null bo'ladi",
  toInterlocutor({ name: 'Oybek', gender: 'erkak', relation: "o'g'li" })?.gender === null,
);

// ─── Mijozning murojaat so'zi qaytarilmaydi ──────────────────────────────
// 2026-09-21, Yusupov Bekzod Maxmatmuradovich: ovozli xabarda mijoz agentga
// "singlim" deb murojaat qildi. Transkript tarixga oddiy matn bo'lib tushadi
// va agent o'sha so'zni keyingi xabarda MIJOZGA qaratib ishlatdi — ya'ni
// erkak mijozni "singlim" deb atadi. Til va ohang mijozga moslanadi,
// murojaat shakli esa YO'Q.
check(
  "mijozning o'ziga qaratilgan murojaat so'zi qaytarilmaydi",
  block.includes('"singlim"') && block.includes('murojaat shakli MOSLANMAYDI'),
);
check(
  'suhbatdosh bo\'lganda ham qaytarilmaydi',
  oybek.includes('"singlim"') && oybek.includes('murojaat shakli MOSLANMAYDI'),
);

// ─── "To'ladim" — chek so'ramasdan CRM ─────────────────────────────────────
// 2026-09-16, Egamova Malohat: 14-avgustdagi xabarimizdan keyin 17-avgustda
// to'langan pul belgisiz ro'yxatda "eski" deb o'qildi va chek so'raldi.
const malohat = buildContextBlock(
  {
    ...context,
    contactStartedAt: new Date('2026-08-14T07:43:24Z'),
    contracts: [
      {
        ...BIRINCHI,
        recentPayments: [
          { dateIso: '2026-08-17', amount: 6_000_000 },
          { dateIso: '2026-07-26', amount: 4_500_000 },
        ],
      },
    ],
  },
  NOW,
  TZ,
);
check(
  'suhbatdan keyingi to\'lov belgilanadi',
  malohat.includes(`${formatSom(6_000_000)} (SUHBAT BOSHLANGANDAN KEYIN)`),
);
check(
  'suhbatdan oldingi to\'lov belgilanmaydi',
  !malohat.includes(`${formatSom(4_500_000)} (SUHBAT`),
);
check('suhbat boshlangan sana ko\'rinadi', malohat.includes('Suhbat boshlangan (birinchi xabarimiz):'));
check('chek so\'ramaslik qoidasi promptda', malohat.includes('CHEK SO\'RAMA'));
check(
  'suhbat sanasi berilmasa belgi chiqmaydi',
  !block.includes('Suhbat boshlangan') && !/so'm \(SUHBAT/.test(block),
);
check(
  'paymentClaim faqat aniq true bo\'lganda',
  toTurnOutput({ paymentClaim: true }, null, undefined).paymentClaim === true &&
    toTurnOutput({ paymentClaim: 'ha' as never }, null, undefined).paymentClaim === false &&
    toTurnOutput({}, null, undefined).paymentClaim === false,
);

// ─── Bo'lmasligi kerak (qora ro'yxat) ────────────────────────────────────
hasNot('shartnoma narxi', formatSom(833_876_100));
hasNot('umumiy qoldiq', formatSom(684_454_968));
hasNot('"Shartnoma summasi" qatori', 'Shartnoma summasi');
// "Taxminan N oy" — eski, bo'linma orqali hisoblangan matn.
hasNot('taxminiy oy soni matni', 'Taxminan');

// Turdan ham chiqarilganini tekshiramiz: bu maydonlar `AgentContractFacts`
// da bo'lmasligi kerak, aks holda kelajakda kimdir ularni chizib qo'yishi
// mumkin.
const FORBIDDEN_KEYS = ['totalPrice', 'transactionPrice', 'remainingTotal', 'totalDebt', 'discount', 'passport'];
const present = FORBIDDEN_KEYS.filter((k) => k in (BIRINCHI as unknown as Record<string, unknown>));
check(
  'qora ro\'yxatdagi maydon turda yo\'q',
  present.length === 0,
  present.join(', '),
);

// ─── Bir nechta shartnoma ────────────────────────────────────────────────
// Ilgari kechikish HAMMA shartnoma bo'yicha qo'shilib bitta raqam qilib
// berilardi, shartnoma raqami, uy, to'lanmagan oylar va oxirgi to'lovlar
// esa faqat birinchisiniki edi. Agent "5582MSO25F3 bo'yicha 25 356 000
// so'm" deb yozardi — mijoz o'z shartnomasiga qarab boshqa raqamni
// ko'rardi. Mijoz ikkinchisi haqida so'rasa, agentda hech qanday fakt
// yo'q edi va u birinchisining faktlarini aytib yuborardi.
const IKKINCHI: AgentContractFacts = {
  contractNo: '1701AFS26M4',
  objectName: 'XON SAROY AFSONASI',
  apartment: { number: '7A-42', floor: 4, rooms: 3, entrance: '7', block: 'Blok 7', area: 71.2 },
  monthlyPayment: 4_000_000,
  debtFirst: 5_000_000,
  debtMonthly: 3_000_000, debtMeter: 0, statusLabel: null,
  daysOverdue: 25,
  missedMonths: 1,
  unpaidMonths: [{ dateIso: '2026-07-10', amount: 4_000_000, paid: 1_000_000 }],
  recentPayments: [{ dateIso: '2026-06-10', amount: 4_000_000 }],
  nextPaymentDate: '2026-08-10',
  contractDate: '2026-01-20',
  completionDate: null,
  paidTotal: 40_000_000,
  warningCount: 2,
};

const ikkita = buildContextBlock(
  {
    ...context,
    contracts: [BIRINCHI, IKKINCHI],
    debtFirst: 5_000_000,
    debtMonthly: 20_356_000,
    debtSum: 25_356_000,
  },
  NOW,
  TZ,
);

check('ikkala shartnoma raqami ko\'rinadi',
  ikkita.includes('5582MSO25F3') && ikkita.includes('1701AFS26M4'));
check('har shartnoma o\'z kechikishi bilan turadi',
  ikkita.includes(formatSom(17_356_000)) &&
    ikkita.includes(formatSom(5_000_000)) &&
    ikkita.includes(formatSom(3_000_000)),
  'kechikish shartnomalarga taqsimlanmagan');
check('jami "barcha shartnomalar bo\'yicha" deb belgilangan',
  ikkita.includes('BARCHA SHARTNOMALAR BO\'YICHA JAMI'),
  'jami qaysi shartnomalarni qamrashi aytilmagan');
check('jami summa to\'g\'ri', ikkita.includes(formatSom(25_356_000)));
check('summalarni qo\'shib aytish taqiqlangan',
  /QO'SHIB/.test(ikkita) && ikkita.includes('BIR NECHTA SHARTNOMA'),
  'agentga qo\'shmaslik qoidasi berilmagan');

// Tuynuk: ilgari to'lanmagan oylar, oxirgi to'lovlar, uy va oylik to'lov
// faqat BIRINCHI shartnomadan olinardi. Mijoz ikkinchisi haqida so'rasa
// agent javob bera olmasdi.
check('ikkinchi shartnomaning uyi bor', ikkita.includes('7A-42'), 'uy faqat birinchisiniki');
check('ikkinchi shartnomaning oylik to\'lovi bor', ikkita.includes(formatSom(4_000_000)));
check('ikkinchi shartnomaning to\'lanmagan oyi bor',
  ikkita.includes('10-iyul') && ikkita.includes(`(${formatSom(1_000_000)} to'langan)`),
  'ikkinchi shartnoma grafigi promptda yo\'q');
check('ikkinchi shartnomaning oxirgi to\'lovi bor', ikkita.includes('10-iyun'));
check('ikkinchi shartnomaning kechikish kuni bor', ikkita.includes('25 kun'));
check('ikkinchi shartnomaning ogohlantirishlari bor', ikkita.includes('2 marta ogohlantirilgan'));

// Har bir fakt O'Z shartnomasi bo'limida turishi kerak. Bo'limlarni
// shartnoma raqamiga qarab kesib, ichini tekshiramiz — aks holda test
// "matnda bor ekan" deb aldanardi.
const ikkinchiBoshi = ikkita.indexOf('1701AFS26M4');
const birinchiBolim = ikkita.slice(ikkita.indexOf('5582MSO25F3'), ikkinchiBoshi);
const ikkinchiBolim = ikkita.slice(ikkinchiBoshi);
check('birinchi shartnoma faktlari o\'z bo\'limida',
  birinchiBolim.includes('14Б-38') && birinchiBolim.includes('25-iyul') && !birinchiBolim.includes('7A-42'),
  'faktlar shartnomalar orasida aralashib ketgan');
check('ikkinchi shartnoma faktlari o\'z bo\'limida',
  ikkinchiBolim.includes('7A-42') && ikkinchiBolim.includes('10-iyul') && !ikkinchiBolim.includes('14Б-38'),
  'faktlar shartnomalar orasida aralashib ketgan');
check('bitish muddati o\'z shartnomasida',
  birinchiBolim.includes('2029-yilning 4-choragi') && !ikkinchiBolim.includes('bitish muddati'),
  'bitish muddati boshqa shartnomaga yopishgan yoki umuman chizilmagan');

// Bitta shartnomada bu qatorlarning hech biri chiqmasligi kerak — aks
// holda har bir oddiy mijoz keraksiz matn oladi.
check('bitta shartnomada ortiqcha matn yo\'q',
  !block.includes('BARCHA SHARTNOMALAR') && !block.includes('BIR NECHTA SHARTNOMA'));

// ─── Bo'sh maydonlarda buzilmasligi ──────────────────────────────────────
const bare = buildContextBlock(
  {
    ...context,
    contracts: [{ ...BIRINCHI, apartment: null, unpaidMonths: [], recentPayments: [], objectName: null }],
  },
  NOW,
  TZ,
);
check(
  'bo\'sh maydonlarda ortiqcha qator chizilmaydi',
  bare.includes('5582MSO25F3') &&
    !bare.includes('undefined') &&
    !bare.includes('Uy: ') &&
    !bare.includes("To'lanmagan oylar"),
);

// Shartnomasi umuman yo'q mijoz — suhbat baribir boshlanishi mumkin
// (masalan hammasi bekor qilingan). Prompt buzilmasligi kerak.
const shartnomasiz = buildContextBlock(
  { ...context, contracts: [], debtFirst: 0, debtMonthly: 0, debtSum: 0, daysOverdue: 0 },
  NOW,
  TZ,
);
check(
  'shartnomasiz mijozda prompt buzilmaydi',
  shartnomasiz.includes('Umarov Aziz Akmalovich') && !shartnomasiz.includes('undefined'),
);

// ─── To'lov tarixi belgisi ───────────────────────────────────
// 2026-09-21: vaqtida to'lab keladigan mijoz oy boshida "oy oxirida
// to'layman" desa, 101-qoida uni o'rtadagi kunga ko'ndirishga urinardi.
// Belgi HAR DOIM chiqadi — faqat "TOZA" holatida chiqsa, model qator
// yo'qligidan xulosa chiqarishga majbur bo'lardi.
const TOZA = "TO'LOV TARIXI: TOZA";
const KECHIKISHLI = "TO'LOV TARIXI: KECHIKISHLI";

const tarix = (over: Partial<AgentContractFacts>): string =>
  buildContextBlock({ ...context, contracts: [{ ...IKKINCHI, ...over }] }, NOW, TZ);

check('20 kun / 1 oy — toza', tarix({ daysOverdue: 20, missedMonths: 1 }).includes(TOZA));
check('30 kun — chegara ichida toza', tarix({ daysOverdue: 30, missedMonths: 1 }).includes(TOZA));
check('31 kun — kechikishli', tarix({ daysOverdue: 31, missedMonths: 1 }).includes(KECHIKISHLI));
check('2 oy qoldirilgan — kechikishli', tarix({ daysOverdue: 20, missedMonths: 2 }).includes(KECHIKISHLI));
check('0 kun / 0 oy — toza', tarix({ daysOverdue: 0, missedMonths: 0 }).includes(TOZA));

// Bitta shartnoma buzuq bo'lsa mijoz butunlay toza emas: yengillik
// suhbatga beriladi, shartnomaga emas.
check('ikki shartnomaning biri buzuq — kechikishli', ikkita.includes(KECHIKISHLI));
check('shartnomasiz mijoz — kechikishli', shartnomasiz.includes(KECHIKISHLI));

// Belgi faktlardan keyin turadi — u o'sha raqamlardan chiqarilgan xulosa.
check(
  "ko'p shartnomada belgi jamidan keyin turadi",
  ikkita.indexOf(KECHIKISHLI) > ikkita.indexOf("BARCHA SHARTNOMALAR BO'YICHA JAMI"),
  'belgi shartnoma bloklaridan oldin qolib ketgan',
);

// Ichki belgi ekani yozilmasa, agent uni mijozga aytib yuborishi mumkin.
check('ichki belgi ekani aytilgan', block.includes('ICHKI belgi, mijozga aytma'));

// "intizom" so'zi knowledgeBase dagi AYBLAMA qoidasi bilan to'qnashadi
// ("sizda intizom yo'q" taqiqlangan) — blokda umuman bo'lmasin.
hasNot('"intizom" so\'zi blokda yo\'q', 'intizom');

// ─── Hisoblagichlar uchun to'lov (2370ORZ26KE) ────────────────────────────
// Oylikdan ALOHIDA qator; jami (boshlang'ich + oylik) o'zgarmaydi.
{
  const hisoblagichli = buildContextBlock(
    { ...context, contracts: [{ ...BIRINCHI, debtFirst: 5_000_000, debtMeter: 3_870_000 }] }, NOW, TZ,
  );
  check(
    'hisoblagich kechikishi alohida qatorda',
    hisoblagichli.includes(`HISOBLAGICHLAR UCHUN TO'LOVDAGI KECHIKISH: ${formatSom(3_870_000)}`),
    'qator topilmadi',
  );
  check(
    'jami kechikkan to\'lovga hisoblagich qo\'shilmadi',
    hisoblagichli.includes(`JAMI KECHIKKAN TO'LOV: ${formatSom(22_356_000)}`),
    'jami o\'zgargan',
  );
  check(
    'kechikish yo\'q — hisoblagich qatori yo\'q',
    !block.includes('HISOBLAGICH'),
    'nol summa chizildi',
  );
}

// ─── Shartnoma holati (2026-10-13: Проц. отказ va К оплате ham yoziladi) ──
{
  const holatli = buildContextBlock(
    { ...context, contracts: [{ ...BIRINCHI, statusLabel: 'Проц. отказ' }] }, NOW, TZ,
  );
  check(
    'odatdagidan farqli holat kontekstda ko\'rinadi',
    holatli.includes('SHARTNOMA HOLATI: Проц. отказ'),
    'qator topilmadi',
  );
  check('Сотилди — holat qatori yo\'q', !block.includes('SHARTNOMA HOLATI'), 'odatdagi holat chizildi');
}

// ─── Telefon suhbatlari (qo'ng'iroq MCP 2-bosqich) ────────────────────────
{
  const telefonli = buildContextBlock({
    ...context,
    phoneCalls: [
      { startedAt: new Date('2026-08-05T06:00:00Z'), agentName: 'Madina', outcome: 'gaplashildi',
        summary: 'Juma to\'lashini aytdi', promiseDate: '2026-08-08', promiseAmount: 8_339_000 },
      { startedAt: new Date('2026-08-03T06:00:00Z'), agentName: 'Madina', outcome: 'kotarmadi',
        summary: null, promiseDate: null, promiseAmount: null },
    ],
  }, NOW, TZ);
  check('telefon bloki bor', telefonli.includes('TELEFON SUHBATLARI'), 'blok yo\'q');
  check('gaplashildi qatori', telefonli.includes(`${formatUzDate('2026-08-05')}, Madina (ovozli agent): gaplashildi. Xulosa: Juma to'lashini aytdi. Va'da: ${formatUzDate('2026-08-08')}, ${formatSom(8_339_000)}`), 'qator topilmadi');
  check('ko\'tarmadi qatori', telefonli.includes(`${formatUzDate('2026-08-03')}, Madina (ovozli agent): ko'tarmadi`), 'qator topilmadi');
  check('qo\'ng\'iroqsiz — blok yo\'q', !block.includes('TELEFON SUHBATLARI'), 'bo\'sh blok chizildi');
}

// ─── Elektron talabnoma ─────────────────────────────────────────────────
{
  const talabnomali = buildContextBlock({
    ...context,
    talabnomalar: [{
      raqam: 'ET-01', yuborilganIso: '2026-08-03', summa: 18_900_000,
      kuchgaKirishIso: '2026-08-06', muddatIso: '2026-08-13', contractNo: '5582MSO25F3',
    }],
  }, NOW, TZ);
  check(
    'talabnoma qatori aynan shaklda',
    talabnomali.includes("Talabnoma: ET-01, 03.08.2026 da yuborilgan, shartnoma 5582MSO25F3, summa 18 900 000 so'm, kuchga kiradi 06.08.2026, to'lov muddati 13.08.2026."),
    'qator topilmadi',
  );
  check('talabnomasiz — qator yo\'q', !block.includes('Talabnoma:'), 'bo\'sh qator chizildi');
  const bosh = buildContextBlock({ ...context, talabnomalar: [] }, NOW, TZ);
  check('bo\'sh ro\'yxat — qator yo\'q', !bosh.includes('Talabnoma:'), 'bo\'sh qator chizildi');
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
