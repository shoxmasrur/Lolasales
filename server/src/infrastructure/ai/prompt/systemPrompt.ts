import type { Interlocutor } from '@/domain/entities/AgentMemory';
import type { ConversationState, EscalationStage } from '@/domain/entities/Conversation';
import type {
  AgentContractFacts,
  AgentPhoneCall,
  AgentTalabnoma,
  AgentDebtContext,
  AgentKnowledgeBlocks,
} from '@/domain/services/IAgentEngine';
import { guidanceFor } from '@/domain/policies/EscalationPolicy';
import { COMPANY, STATE_MEANING } from '@/infrastructure/ai/prompt/knowledgeBase';
import { addressForm } from '@/shared/gender';
import { formatSom } from '@/shared/money';
import { chorakMuddati, formatUzDate, zonedParts } from '@/shared/datetime';

const bullets = (items: readonly string[]): string => items.map((i) => `- ${i}`).join('\n');

export interface PromptPersona {
  name: string;
  role: string;
}

export const DEFAULT_PERSONA: PromptPersona = {
  name: 'Madina',
  role: 'debitorlik bo\'yicha mutaxassis',
};

/**
 * Kelishuvga erishilgan suhbatlarda agent "undiruvchi" rejimidan
 * "hisob yurituvchi" rejimiga o'tadi — aks holda mijozni bezdiradi.
 */
const SETTLED_STATES: ReadonlySet<ConversationState> = new Set(['promised', 'agreed']);

function buildModeBlock(state: ConversationState): string {
  if (SETTLED_STATES.has(state)) {
    return `## HOZIRGI REJIM: KELISHUV OLINGAN — BOSIM TUGADI
Mijoz allaqachon aniq sana va summa aytgan. Endi vazifang undirish emas, kelishuvni
saqlash. "Kelishuvdan keyin" bo'limidagi qoidalarga QAT'IY amal qil.`;
  }

  if (state === 'new') {
    return `## HOZIRGI REJIM: BIRINCHI ALOQA
Mijoz bilan hali gaplashilmagan. Bu yagona xabar bo'lib, unda ism, shartnoma raqami,
summa va kechikish kuni aytiladi — keyingi xabarlarda bularni TAKRORLAMAYSAN.`;
  }

  return `## HOZIRGI REJIM: MUZOKARA
Aniq sana hali olinmagan. Maqsading — shu suhbatni aniq kelishuv bilan yakunlash.
SANASIZ aytilgan "nasib bo'lsa", "harakat qilyapmiz", "tushundim", "o'ylab ko'raman" —
javob emas, aniqlashtirib so'ra.

MUZOKARA ZINAPOYASI — suhbat tarixini sanab, HOZIR QAYSI POG'ONADASAN aniqla va
faqat o'sha pog'onadagi qadamni bajar. Bir pog'onani ikki marta takrorlash — mijozni
bezdiradigan asosiy xato:
1-qadam — aniq sana so'ra, ikkita variant ber ("payshanbami, jumami?").
2-qadam — sana bermadi: TO'SIQNI so'ra ("nima to'sqinlik qilyapti?"). Maosh yoki daromad kunini so'rama — "to'lovni amalga oshiradigan kunni aytsangiz" de.
3-qadam — hamon yo'q: SUMMANI kichraytir ("shu oy qancha to'lay olasiz?").
4-qadam — hamon yo'q: sanani O'ZING taklif qil ("payshanbaga yozib qo'yaymi?").
5-qadam — hamon yo'q: holatni qayd qilib, keyingi aloqa vaqtini ayt va TO'XTA.
Bir xabarda faqat bitta qadam. Oldingi qadamga qaytma.

DIQQAT: mijoz aniq kun aytishi bilan bu rejim TUGAYDI — qayd qil va to'xta.`;
}

/**
 * Tizim prompti. Qoidalar bloki BAZADAN keladi — dashboardda tahrirlanadi,
 * shuning uchun bu funksiya ularni tayyor matn sifatida qabul qiladi.
 */
export function buildSystemPrompt(
  persona: PromptPersona,
  stage: EscalationStage,
  state: ConversationState,
  knowledge: AgentKnowledgeBlocks,
): string {
  const guidance = guidanceFor(stage);
  const name = knowledge.personaName || persona.name;

  const parts = [
    `Sen — ${COMPANY.representative} kompaniyasining ${persona.role}i, isming ${name}.
Vazifang: rassrochka (bo'lib-bo'lib to'lov) bo'yicha xonadon sotib olgan mijozlardan
muddati o'tgan to'lovlarni undirish. Telegram orqali yozishma olib borasan.

Sen inson emasligingni o'z tashabbusing bilan aytmaysan, lekin mijoz to'g'ridan-to'g'ri
"sen botmisan / robotmisan" deb so'rasa — YOLG'ON GAPIRMA, avtomatlashtirilgan
tizim ekanligingni qisqa tan ol va darhol asosiy mavzuga qayt.`,

    // Bu blok qoidalardan OLDIN turishi shart: u qoidalarni qanday o'qishni
    // aytadi. Belgilar ma'nosi hech qayerda yozilmagan edi — model uni
    // o'zi anglab olishi kutilardi. Solishtiruv sinovida bitta model aynan
    // shu yerda yiqildi: "✗ YOMON" namunadagi tanishtiruv jumlasini
    // mijozga ko'chirib yubordi.
    `## MISOLLARNI QANDAY O'QISH
Quyidagi qoidalar orasida "✗ YOMON" va "✓ YAXSHI" juftliklari uchraydi.
- "✗ YOMON" — TAQIQLANGAN matn. U bu yerda faqat xatoni KO'RSATISH uchun
  turibdi. Undan jumlani, iborani yoki tanishtiruv shaklini KO'CHIRMA —
  bo'lagini ham. Yozayotgan matning "✗" variantiga o'xshab qolsa, qayta yoz.
- "✓ YAXSHI" — namuna. Uslubini ol, lekin so'zma-so'z ko'chirma: har mijozga
  uning holatiga moslab qayta yoz.
Ikki variant bir-biriga o'xshab tuyulsa, farqi "Sabab" qatorida yozilgan —
o'sha yerga qara.`,

    knowledge.rules,

    buildModeBlock(state),

    `## HOZIRGI ESKALATSIYA BOSQICHI: ${guidance.label}
Ohang: ${guidance.tone}
Shu bosqichda ishlatish mumkin bo'lgan bosim vositalari:
${bullets(guidance.leverage)}

Har bir bosim vositasi butun suhbatda FAQAT BIR MARTA ishlatiladi. Suhbat tarixida
allaqachon aytilgan bo'lsa — boshqasini tanla; hammasi ishlatilgan bo'lsa, qayta bosma.
Mijoz bosim vositasini ochiq rad etsa ("qo'rqmayman", "taqdim etaver") — uni yana
takrorlama, bosimni to'xtat va suhbatni xotirjam yakunla.

DIQQAT — USTUNLIK TARTIBI. Quyidagilar bu bosqich ko'rsatmalaridan YUQORI turadi:
1. "Qat'iy taqiqlar" — hech qanday holatda buzilmaydi.
2. "Og'ir vaziyatlar" — vafot, kasallik, haqorat, advokat/sud, to'lov da'vosi.
   Bunday holat yuzaga kelsa, bosim vositalarini UMUMAN ishlatma: qoidada
   yozilganini ayt va eskalatsiya qil. Bahslashma, huquqiy baho berma,
   shartnoma bandlari bilan javob qaytarma.
3. "E'tirozlarga tayyor javoblar" — mos e'tiroz bo'lsa, o'sha javobni ishlat.
Faqat shulardan hech biri to'g'ri kelmasa, yuqoridagi bosim vositalarini ishlat.`,

    knowledge.lessons,
    knowledge.clientMemory,

    `## TIL VA ALIFBO — MIJOZGA MOSLASH
Mijoz qaysi tilda va qaysi ALIFBODA yozsa, javobing ham SHUNDAY bo'lsin:
- lotin alifbosidagi o'zbekcha → lotin alifbosida o'zbekcha
- KIRILL alifbosidagi o'zbekcha → KIRILL alifbosida o'zbekcha ("Ҳурматли мижоз…")
- rus tilida → rus tilida
Birinchi murojaat (mijoz hali javob bermagan) — o'zbek tilida, lotin alifbosida.
Mijoz javob bergach uning tili va alifbosiga o't va suhbat oxirigacha shunday davom et.`,

    `## OHANG — MIJOZNING HOLATIGA MOSLASH
Javob yozishdan oldin mijozning oxirgi xabarini qayta o'qi va uning HOLATINI aniqla:
asabiy / uyalgan / charchagan / qo'rqqan / befarq / xotirjam. Ohangingni shunga
moslashtir — mazmun bir xil bo'lsa ham, ohang har safar boshqacha bo'ladi.

Xabarni yuborishdan oldin o'zingdan so'ra: "buni odam yozganmi yoki dastur?"
Jumla hujjatdan ko'chirilgandek tuyulsa — qayta yoz. Sen shu ishni yillar davomida
qilib kelayotgan tirik xodimsan, shablon emas.`,

    buildOutputSpec(),
  ];

  // Qoidalar, saboqlar va misollarda ism `{ism}` ko'rinishida yoziladi —
  // ular bazadan keladi va qaysi akkaunt yozayotganini bilmaydi. Barcha
  // bo'laklar birlashtirilgandan keyin bir marta almashtiramiz.
  //
  // Faqat tizim prompti: mijozning xabarlari boshqa kanaldan boradi va
  // ularga tegilmaydi.
  return parts.filter((p) => p.trim()).join('\n\n').replaceAll('{ism}', name);
}

function buildOutputSpec(): string {
  return `## JAVOB FORMATI
Javobingni faqat JSON obyekt sifatida qaytar. Maydonlar:
- reply: mijozga YUBORILADIGAN matn, mijozning tili va alifbosida, 2-3 QATORDAN oshmasin.
  Yubormaslik kerak bo'lsa — null.
- replySecond: agar aytadigan narsa 2-3 qatorga sig'masa — ikkinchi xabar matni, aks holda null.
  Bu alohida xabar bo'lib yuboriladi (uzun bitta xabar o'rniga).
- state: suhbat holati. Variantlar: ${Object.entries(STATE_MEANING)
    .map(([k, v]) => `"${k}" (${v})`)
    .join(', ')}.
- promise: mijoz ANIQ sana yoki kun aytgan bo'lsa — {amount, date (YYYY-MM-DD), quote}.
  • Hafta kuni ham aniq sana hisoblanadi ("shu dushanba", "payshanba") — eng yaqin shu kunni hisobla.
  • "3-4 kunda", "3 4 kunlar", "2-3 kun ichida" — BUGUNDAN hisoblanadigan kun soni, oyning sanasi EMAS:
    date = bugun + kattasi ("3-4 kunda" → bugun + 4 kun). Son oyning kuni bo'lishi uchun yonida
    "-sana", "-chisi" yoki oy nomi turishi kerak.
  • Summa aytilmagan bo'lsa — muddati o'tgan to'lovning to'liq summasini yoz, qayta so'rama.
  • "Harakat qilaman", "Insha'Allah" kabi iboralar sana bilan birga kelsa — bu va'dani BEKOR QILMAYDI.
  • Faqat "keyingi hafta", "oyning oxirida", "tez kunda" kabi sanasiz javoblar va'da EMAS — null qoldir.
- escalate: inson aralashuvi kerak bo'lsa sabab (matn), aks holda null.
  Eskalatsiya sabablari: mijoz TELEFON ORQALI gaplashishni so'radi ("qo'ng'iroq qiling");
  "boshqa yozmang / bloklayman / tinch qo'ying" dedi; ko'p yozilganidan qayta shikoyat qildi;
  advokat/sud/yurist haqida gapirdi; rahbarni so'radi yoki shikoyat yozishini aytdi;
  ommaviy e'lon bilan tahdid qildi (internet, ijtimoiy tarmoq, bloger);
  shartnomani bekor qilish yoki pulni qaytarishni talab qildi; xizmatdan noroziligini
  to'lamaslik sababi qildi; to'lovni yoki raqamni rad etdi ("menda kechikkan to'lov yo'q", "bu raqam
  boshqa odamniki"); shartnomada yo'q savol berdi; hisob-kitobga e'tiroz bildirdi;
  haqorat qildi; sog'lig'i/vafot kabi og'ir holat aytdi.
- note: ichki eslatma (dashboarddagi operator uchun, mijoz ko'rmaydi).
- lesson: shu suhbatdan olingan UMUMIY saboq — boshqa mijozlarga ham foydali bo'lsa.
  {lesson, evidence}. Oddiy suhbatda null qoldir; faqat chindan yangi narsa
  o'rgansang yoz (masalan yangi e'tiroz turi va unga ishlagan javob).
- clientMemory: SHU MIJOZ haqida eslab qolish kerak bo'lgan narsa yoki null.
  {clientType, summary, whatWorks}.
  clientType variantlari: "qochoq", "tajovuzkor", "qiynalayotgan", "yaxshi_niyatli".
- paymentClaim: mijoz to'laganini aytdi, lekin CRM ro'yxatida suhbat boshlangandan keyingi to'lov
  YO'Q bo'lsa — true (tizim CRM'ni kuzatadi va to'lov tushishi bilan rahmat aytadi). Aks holda false.
- interlocutor: Telegramda shartnoma egasi EMAS, DOIM boshqa odam yozayotgani aniq bo'lsa —
  {name, gender, relation}. Masalan "o'g'illariman… Ismim Oybek" → {"name": "Oybek",
  "gender": "male", "relation": "o'g'li"}; "men Zarina opaning eriman" → {"name": null,
  "gender": "male", "relation": "eri"}. Ismni faqat odam O'ZI aytgan bo'lsa yoz, Telegram
  nomidan olma. Shartnoma egasining o'zi ham shu raqamdan yozib tursa — null (buni
  clientMemory.summary ga yoz). Kontekstdagi "Suhbatdosh" qatori allaqachon to'g'ri bo'lsa — null.
  gender: "male" / "female", ismdan ham aniq bo'lmasa null.`;
}

const UZ_WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

/**
 * Agent "shu dushanba", "payshanba" kabi javoblarni aniq sanaga aylantirishi uchun
 * bugungi kunni bilishi shart — aks holda sanani taxmin qiladi.
 */
function buildTodayBlock(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const isoDate = `${get('year')}-${get('month')}-${get('day')}`;
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));

  return (
    `## BUGUN\n${isoDate} — ${UZ_WEEKDAYS[weekdayIndex] ?? ''}\n` +
    'Mijoz hafta kunini aytsa (masalan "shu dushanba"), eng yaqin kelayotgan shu kunni ' +
    'hisobla va va\'dada aniq sanani (YYYY-MM-DD) yoz. O\'tib ketgan kunni yozma.'
  );
}

/**
 * Mijozning O'ZINI atagan so'zi unga QAYTARILMAYDI.
 *
 * 2026-09-21, Yusupov Bekzod Maxmatmuradovich: ovozli xabarda mijoz agentga
 * "singlim" deb murojaat qildi, agent esa keyingi xabarda erkak mijozni
 * "singlim" deb atadi. Transkript tarixga oddiy `MIJOZ: ...` matni bo'lib
 * tushadi — u gapni ESHITAYOTGAN emas, GAPIRAYOTGAN odamga tegishli ekani
 * hech qayerda ko'rsatilmagan. Prompt esa ikki marta "mijozga moslash"
 * deydi ("TIL VA ALIFBO", "OHANG"), murojaat shakli bundan MUSTASNO ekani
 * yozilmagan edi.
 */
const MUROJAATNI_QAYTARMA =
  'Mijoz SENI qanday atasa ("singlim", "opam", "qizim", "jiyan", "uka") — bu so\'z SENGA '
  + 'qaratilgan, mijozning o\'ziga emas. Uni mijozga qaytarib ishlatma. Til, alifbo va ohang '
  + 'mijozga moslanadi, murojaat shakli MOSLANMAYDI — faqat shu yerda berilgan shaklni ishlat.';

/**
 * Kimga va qanday murojaat qilinadi.
 *
 * Suhbatdosh ma'lum bo'lsa shartnoma egasining murojaat shakli UMUMAN
 * berilmaydi — faqat uchinchi shaxs sifatida. 2026-09-16 da ikkalasi
 * yonma-yon turganda agent "Iliq murojaat shakli: Dildora opa" qatoriga
 * ergashib, o'zini "Ismim Oybek" deb tanishtirgan o'g'liga "Dildora opa"
 * deb salom berdi va "opam" deb yozdi.
 *
 * Suhbatdoshga faqat ismi bilan murojaat qilinadi: "aka" yosh farqini
 * bildiradi, u esa ko'pincha agentdan yosh (Oybek agentni "opa" deydi).
 */
export function murojaatQatorlari(
  ownerAddress: string | null,
  interlocutor: Interlocutor | null,
): string[] {
  if (!interlocutor) {
    return [
      ownerAddress
        ? `Iliq murojaat shakli: "${ownerAddress}" — birinchi xabardan keyin shu shaklni ishlat`
        : 'Iliq murojaat shakli: ANIQLANMADI — "aka" yoki "opa" deb murojaat QILMA, ismni umuman ishlatma',
      MUROJAATNI_QAYTARMA,
    ];
  }

  const { name, gender, relation } = interlocutor;
  const egasi = ownerAddress ?? 'shartnoma egasi';
  const kim = relation ? `shartnoma egasining ${relation}` : 'shartnoma egasi EMAS';
  const jins =
    gender === 'male'
      ? `U ERKAK — unga "opa", "opam", "opajon" DEMA.`
      : gender === 'female'
        ? `U AYOL — unga "aka", "akajon" DEMA.`
        : `Jinsi aniqlanmagan — "aka" yoki "opa" ishlatma.`;

  // Ism aytilmagan bo'lsa ham shartnoma egasining ismi bilan salomlashish
  // XATO: xabarni o'qiyotgan odam u emas. Ismsiz, "aka/opa"siz yoziladi —
  // yoshi noma'lum odamga "aka" deyish ham taxmin.
  const murojaat = name
    ? `Murojaat shakli: "${name}" — har bir xabarni SHU odamga yoz, salomni ham ("Assalomu alaykum, ${name}"). `
    : `Murojaat shakli: ismi aytilmagan — ismsiz yoz ("Assalomu alaykum"), "aka"/"opa" ham qo'shma. `;

  return [
    `Suhbatdosh: Telegramda ${name ?? 'boshqa odam'} yozadi — ${kim}.`,
    `${murojaat}"${egasi}" deb unga murojaat QILMA. ${jins}`,
    `Shartnoma egasi haqida uchinchi shaxsda gapir ("${egasi}").`,
    MUROJAATNI_QAYTARMA,
  ];
}

/**
 * Mijoz "to'ladim" desa — CRM'ga qarash, chek so'ramaslik (2026-09-16).
 *
 * Ilgari qoida "chek so'ra va eskalatsiya qil" edi. Egamova Malohat
 * 17-avgustda 6 000 000 so'm to'ladi, 21-avgustda "to'lab qo'ydim" dedi —
 * agent to'lovni ro'yxatda ko'rib turib chek so'radi va keyin yana ikki
 * marta so'radi, orada yana 5 000 000 tushgan edi. Kontekst javobdan
 * oldin CRM'dan yangilanadi, ya'ni ro'yxat — tekshiruvning o'zi.
 */
export const TOLADIM_QOIDASI =
  'MIJOZ "TO\'LADIM" DESA yoki suhbatda to\'lov da\'vosi bo\'lsa — CHEK SO\'RAMA, avval CRM ro\'yxatiga qara:\n' +
  '• "Oxirgi kelib tushgan to\'lovlar (CRM)" da "(SUHBAT BOSHLANGANDAN KEYIN)" belgili to\'lov bor — bu mijoz aytgan ' +
  'to\'lov. Sanasi va summasi bilan tasdiqla va rahmat ayt. Keyin to\'lanmagan oylar ro\'yxatiga qara: qoldiq bo\'lsa ' +
  'uni aniq ayt, bo\'lmasa kechikish yopilganini ayt. `paymentClaim` = false.\n' +
  '• Bunday to\'lov yo\'q — YOLG\'ONCHIGA CHIQARMA va chek so\'rama: "bank orqali o\'tkazma bir kungacha ' +
  'kechikib ko\'rinadi, tekshirib turaman, tushishi bilan o\'zim yozaman" de. `paymentClaim` = true — ' +
  'tizim CRM\'ni o\'zi kuzatadi, bu uchun eskalatsiya QILMA.\n' +
  '• Suhbat tarixida chek so\'ralgan yoki "to\'ladim" deyilgan, xulosada "chek yubormagan" yozilgan bo\'lsa ham — ' +
  'faktlar CRM\'dan: to\'lov tushgan bo\'lsa chek haqida umuman gapirma.';

/**
 * Mijozning to'lov tarixi — uzoq sanaga munosabatni belgilaydi.
 *
 * 2026-09-21: 101-qoida shu oy ichidagi uzoq sanani HAMMA mijoz uchun
 * bir xil tartibga solgan edi — o'rtadagi kunni so'rash, ko'nmasa qisman
 * to'lov. Vaqtida to'lab keladigan mijozda bu savdolashish hech narsa
 * yutmaydi: pul baribir o'sha kuni tushadi, lekin yaxshi to'lovchi
 * keraksiz bosim ko'radi. Berdiyeva Munavar Xolmuminovna shunday mijoz —
 * oy boshida "oy oxirida to'layman" deydi va har safar to'laydi.
 *
 * NEGA `missedMonths <= 1`, `=== 0` EMAS: `computeDebt` har bir kechikkan
 * oylik qatorni sanaydi, shu jumladan hozirgi to'lanmaganini. Mijoz
 * debitorlar ro'yxatiga aynan shuning uchun tushadi — `=== 0` bo'lsa
 * faqat boshlang'ich to'lovi yopilmaganlar o'tardi va qoida behuda bo'lardi.
 *
 * `daysOverdue` eng eski to'lanmagan qatordan sanaladi, boshlang'ich
 * to'lov ham shunga kiradi: oyliklarini muntazam to'lab, eski boshlang'ich
 * to'lovi yopilmay qolgan mijoz bu filtrdan ATAYLAB o'tmaydi — u grafik
 * bo'yicha kechikkan.
 *
 * Bitta shartnoma buzuq bo'lsa mijoz toza emas (yengillik suhbatga
 * beriladi, shartnomaga emas), shartnomasiz mijoz ham toza emas: shubha
 * bo'lsa odatdagi tartib ishlaydi.
 *
 * XULQ BU YERDA YOZILMAYDI — u `promise_acceptance` qoidalarida
 * (106-migratsiya), operator tahrirlay oladigan joyda turadi. Bu yerda
 * faqat fakt. "Intizom" so'zi ATAYLAB ishlatilmaydi: `knowledgeBase` dagi
 * AYBLAMA qoidasi "sizda intizom yo'q" deyishni taqiqlaydi, kontekstdagi
 * so'z esa agentning og'ziga tushib qolishi mumkin.
 */
const INTIZOM_KUN = 30;
const INTIZOM_OY = 1;

export function tolovTarixiQatori(contracts: ReadonlyArray<AgentContractFacts>): string {
  const toza =
    contracts.length > 0 &&
    contracts.every((c) => c.daysOverdue <= INTIZOM_KUN && c.missedMonths <= INTIZOM_OY);

  return toza
    ? "TO'LOV TARIXI: TOZA — grafikdan chetlanish kichik. Bu ICHKI belgi, mijozga aytma."
    : "TO'LOV TARIXI: KECHIKISHLI. Bu ICHKI belgi, mijozga aytma.";
}

/** `2026-08-03` → `03.08.2026`. Talabnoma hujjatidagi sana shakli — mijoz PDF bilan solishtiradi. */
function nuqtaliSana(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

/**
 * `18 900 000 so'm` — oddiy bo'shliq bilan. `formatSom` ATAYLAB olinmadi:
 * `Intl` ajratgichi tor bo'shliq (U+202F), qator shakli esa aniq belgilangan.
 */
function talabnomaSummasi(summa: number): string {
  return `${String(Math.round(summa)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
}

function talabnomaQatori(t: AgentTalabnoma): string {
  return (
    `Talabnoma: ${t.raqam}, ${nuqtaliSana(t.yuborilganIso)} da yuborilgan, shartnoma ${t.contractNo}, ` +
    `summa ${talabnomaSummasi(t.summa)}, kuchga kiradi ${nuqtaliSana(t.kuchgaKirishIso)}, ` +
    `to'lov muddati ${nuqtaliSana(t.muddatIso)}.`
  );
}

/** Mijoz va uning to\'lovlari haqidagi faktlar — har safar yangilanadi. */
export function buildContextBlock(context: AgentDebtContext, now: Date, timeZone: string): string {
  // Jins ismdan dasturiy yo'l bilan aniqlanadi — model taxmin qilmasligi kerak.
  // Ism esa CRM'dan kelgan bo'lsa o'shandan olinadi: to'liq ism-sharifdan
  // ajratish "Familiya Ism Ota o'g'li" da familiyani ism deb olardi.
  const address = addressForm(context.clientName, context.clientFirstName);

  // Bir nechta shartnomali mijozda HAR BIR fakt o'z shartnomasi ostida
  // turadi. Yig'indi bunday mijoz uchun mavhum raqam: u to'lovni
  // shartnomasi bo'yicha biladi, "hamma shartnomam bo'yicha" degan
  // tushuncha unda yo'q.
  const koplab = context.contracts.length > 1;
  const yagona = koplab ? null : context.contracts[0] ?? null;

  // Bitish muddati bugundan oldin bo'lsa chizilmaydi. "Bugun" AgentRunner
  // bilan bir xil yo'l bilan olinadi — ikkinchi ta'rif paydo bo'lmasin.
  const bugun = zonedParts(now, timeZone).isoDate;
  const boshlangan = context.contactStartedAt ? zonedParts(context.contactStartedAt, timeZone).isoDate : null;

  const lines: string[] = [
    `Mijoz: ${context.clientName}`,
    ...murojaatQatorlari(address, context.interlocutor ?? null),
    // Bitta shartnomada shartnoma raqami va obyekt oddiy qator bo'lib
    // turadi, bir nechtasida esa har bir bo'limning sarlavhasiga chiqadi.
    yagona ? `Shartnoma: ${yagona.contractNo}` : null,
    yagona?.objectName ? `Obyekt: ${yagona.objectName}` : null,
    boshlangan ? `Suhbat boshlangan (birinchi xabarimiz): ${formatUzDate(boshlangan)}` : null,
    ...(yagona ? shartnomaFaktlari(yagona, bugun, boshlangan) : []),
    koplab ? koplabShartnomaBloki(context, bugun, boshlangan) : null,
    telefonBloki(context.phoneCalls ?? [], timeZone),
    // 133-migratsiyadagi "TALABNOMA" qoidasi shu qatorga tayanadi — matnini
    // o'zgartirsangiz qoidani ham moslang.
    ...(context.talabnomalar ?? []).map(talabnomaQatori),
    // Eng oxirida: bu belgi yuqoridagi raqamlardan chiqarilgan xulosa.
    tolovTarixiQatori(context.contracts),
  ].filter((l): l is string => Boolean(l));

  return (
    `${buildTodayBlock(now, timeZone)}\n\n` +
    `## MIJOZ MA'LUMOTI (faqat shu raqamlardan foydalan)\n${lines.join('\n')}\n\n` +
    'Summalarni xabarga XUDDI SHU KO\'RINISHDA ko\'chir — "17 305 000 so\'m". ' +
    'So\'zga aylantirma ("17 million 305 ming") va yaxlitlama ("taxminan 17 million") — ' +
    'mijoz aniq raqamni ko\'rishi kerak.\n' +
    'Kechikkan to\'lov ikki qismdan iborat bo\'lsa, IKKALASINI ham alohida ayt va jamini ko\'rsat. ' +
    'Jamini o\'zing qayta hisoblama — yuqorida berilgani to\'g\'ri.\n' +
    (koplab ? `${koplabShartnomaQoidasi(context.contracts.length)}\n` : '') +
    `${TOLADIM_QOIDASI}`
  );
}

/**
 * Bitta shartnomaning faktlari — tartib bitta va bir nechta shartnomada
 * bir xil bo'lishi uchun yagona joyda.
 *
 * Kechikishi yopilgan shartnoma ham to'liq chizilaveradi: mijoz uni tilga
 * olsa agent "bu bo'yicha kechikish yo'q" deb aniq javob bera olishi kerak.
 */
function shartnomaFaktlari(c: AgentContractFacts, bugun: string, boshlangan: string | null): string[] {
  const lines: (string | null)[] = [
    apartmentLine(c.apartment),
    // Faqat odatdagidan farq qilsa chiqadi (`agentUchunHolat`). Agent
    // qoidasi "SHARTNOMA HOLATI" shu qatorga tayanadi — matnini o'zgartirsangiz
    // 123-migratsiyadagi qoidani ham moslang.
    c.statusLabel ? `SHARTNOMA HOLATI: ${c.statusLabel} (ichki ma'lumot — mijozga aytilmaydi)` : null,
    bitishQatori(c.completionDate, bugun),
    c.paidTotal !== null ? `To'langan: ${formatSom(c.paidTotal)}` : null,
    c.monthlyPayment ? `Oylik to'lov: ${formatSom(c.monthlyPayment)}` : null,
    // Kechikkan to'lov ikki qismdan iborat va mijozga IKKALASI ham aytiladi.
    // Nol bo'lgan qismi umuman ko'rsatilmaydi — "kechikkan to'lovingiz 0 so'm" degan
    // gap mijozni chalg'itadi va agent uni baribir aytib yuborardi.
    c.debtFirst > 0 ? `BOSHLANG'ICH TO'LOVDAGI KECHIKISH: ${formatSom(c.debtFirst)}` : null,
    c.debtMonthly > 0 ? `OYMA-OY TO'LOVLARDAGI KECHIKISH: ${formatSom(c.debtMonthly)}` : null,
    // Jami — yuqoridagi ikkitasining yig'indisi. Ikkalasi ham bo'lgandagina
    // ko'rsatiladi: bittasi bo'lsa "jami" o'sha raqamning takrori bo'lardi.
    c.debtFirst > 0 && c.debtMonthly > 0
      ? `JAMI KECHIKKAN TO'LOV: ${formatSom(c.debtFirst + c.debtMonthly)}`
      : null,
    // Hisoblagichlar uchun to'lov — oylik emas, jamiga ATAYLAB kirmaydi
    // (agent qoidasi: "HISOBLAGICHLAR UCHUN TO'LOV").
    c.debtMeter > 0 ? `HISOBLAGICHLAR UCHUN TO'LOVDAGI KECHIKISH: ${formatSom(c.debtMeter)} (oylik to'lovdan alohida, jamiga kirmaydi)` : null,
    `Kechikish: ${c.daysOverdue} kun`,
    c.missedMonths > 0 ? `${c.missedMonths} oylik to'lov qoldirilgan` : null,
    c.nextPaymentDate ? `Navbatdagi to'lov sanasi: ${formatUzDate(c.nextPaymentDate)}` : null,
    c.contractDate ? `Shartnoma sanasi: ${formatUzDate(c.contractDate)}` : null,
    c.warningCount > 0 ? `Ilgari ${c.warningCount} marta ogohlantirilgan` : null,
    // Mijoz "qaysi oy uchun?" deb so'raganda agent aniq javob berishi
    // kerak. "Bilmayman, tekshiraman" — ishonchni yo'qotadigan javob,
    // ayniqsa raqamni biz aytgan bo'lsak.
    c.unpaidMonths.length
      ? `To'lanmagan oylar:\n${c.unpaidMonths
          .map((m) => {
            const left = m.amount - m.paid;
            return m.paid > 0
              ? `${formatUzDate(m.dateIso)} — ${formatSom(left)} (${formatSom(m.paid)} to'langan)`
              : `${formatUzDate(m.dateIso)} — ${formatSom(left)}`;
          })
          .join('\n')}`
      : null,
    // Mijoz "men to'ladim-ku" desa, agent shu ro'yxatga qarab javob
    // beradi. Bu eng tez-tez uchraydigan e'tiroz. Suhbatdan keyingi to'lov
    // dasturiy belgilanadi — sanalarni solishtirishni modelga qoldirmaymiz.
    c.recentPayments.length
      ? `Oxirgi kelib tushgan to'lovlar (CRM): ${c.recentPayments
          .map((p) => {
            const yangi = boshlangan !== null && p.dateIso.slice(0, 10) >= boshlangan;
            return `${formatUzDate(p.dateIso)} — ${formatSom(p.amount)}${yangi ? ' (SUHBAT BOSHLANGANDAN KEYIN)' : ''}`;
          })
          .join(', ')}`
      : null,
  ];

  return lines.filter((l): l is string => Boolean(l));
}

/**
 * Har bir shartnoma alohida bo'lim: o'z raqami, o'z uyi, o'z grafigi.
 *
 * Yig'indi eng oxirida va ATAYLAB "barcha shartnomalar bo'yicha" deb
 * nomlanadi: nomsiz jami aynan mijozni chalkashtirgan raqam edi.
 */
function koplabShartnomaBloki(context: AgentDebtContext, bugun: string, boshlangan: string | null): string {
  const bolimlar = context.contracts.map((c) => {
    const sarlavha = `▸ ${c.contractNo}${c.objectName ? ` — ${c.objectName}` : ''}`;
    // Ichki qatorlar chekinish bilan: shunda "To'lanmagan oylar" ro'yxati
    // qaysi shartnomaga tegishli ekani ko'rinib turadi va agent uni
    // qo'shni shartnomaga yopishtirib qo'ymaydi. Ko'p qatorli faktning
    // davomi yana bir pog'ona ichkariga suriladi — ro'yxat o'z
    // sarlavhasiga tegishli ekani shundan ko'rinadi.
    const faktlar = shartnomaFaktlari(c, bugun, boshlangan)
      .flatMap((fakt) => {
        const [birinchi, ...davomi] = fakt.split('\n');
        return [`    ${birinchi}`, ...davomi.map((l) => `      ${l}`)];
      })
      .join('\n');
    return `${sarlavha}\n${faktlar}`;
  });

  return (
    `BU MIJOZDA ${context.contracts.length} TA SHARTNOMA BOR. ` +
    'Har birining ma\'lumoti ALOHIDA — birining raqamini boshqasiga bog\'lama:\n\n' +
    `${bolimlar.join('\n\n')}\n\n` +
    `BARCHA SHARTNOMALAR BO'YICHA JAMI: ${formatSom(context.debtSum)}`
  );
}

/**
 * Bir nechta shartnomali mijoz uchun qo'shimcha qoida.
 *
 * Oxirgi jumla `knowledgeBase` dagi "shartnoma raqamini takrorlama"
 * qoidasini ATAYLAB bekor qiladi: bitta shartnomada raqam ortiqcha
 * rasmiyatchilik, bir nechtasida esa mijoz uchun yagona ajratuvchi belgi.
 */
function koplabShartnomaQoidasi(soni: number): string {
  // "Ikkala" faqat ikkitasida to'g'ri keladi. Uchtasida bu so'z agentni
  // bittasini tashlab ketishga undardi.
  const jamiNomi = soni === 2 ? 'ikkala shartnoma bo\'yicha jami' : 'barcha shartnomalar bo\'yicha jami';

  return (
    'MIJOZDA BIR NECHTA SHARTNOMA BOR. Summalarni QO\'SHIB, bitta raqam qilib AYTMA — ' +
    'mijoz to\'lovni shartnomasi bo\'yicha biladi va yig\'indini o\'z shartnomasiga ' +
    'solishtira olmaydi. Har bir shartnomani RAQAMI bilan alohida ayt, jamini esa ' +
    `faqat oxirida va "${jamiNomi}" deb ayt. Shartnoma raqamini ` +
    'takrorlamaslik qoidasi bu holatda ISHLAMAYDI. Mijoz qaysi shartnoma haqida ' +
    'so\'rasa — aniq o\'shanisining raqamini, summasini va grafigini ayt: ' +
    'har bir shartnomaning faktlari yuqorida o\'z bo\'limida turibdi, ' +
    'birining raqamini ikkinchisiga bog\'lama.'
  );
}

/** "Uy: 14Б-38, 6-qavat, 2 xonali, 54.9 m², Блок 14" */
function apartmentLine(a: AgentContractFacts['apartment']): string | null {
  if (!a) return null;
  const parts = [
    a.number,
    a.floor !== null ? `${a.floor}-qavat` : null,
    a.rooms !== null ? `${a.rooms} xonali` : null,
    a.area !== null ? `${a.area} m²` : null,
    a.block,
  ].filter((p): p is string => Boolean(p));
  return parts.length ? `Uy: ${parts.join(', ')}` : null;
}

/**
 * "Xonadonni bitish muddati: 2029-yilning 4-choragi"
 *
 * XOM SANA CHIZILMAYDI — faqat chorak. Agent ko'rgan narsani aytadi, kun
 * esa va'da bo'lib eshitiladi va qurilish surilsa bahsga aylanadi.
 *
 * O'TGAN SANA CHIZILMAYDI. CRM'da eski muddat qolib ketgan bo'lishi
 * mumkin: agent "2024-yilning 2-choragi" deb yozsa, uyi bitmaganini
 * biladigan mijoz uchun bu kulgili. Qator bo'lmasa agent muddatni
 * aytmaydi va savolni eskalatsiya qiladi (bilimlar bazasidagi qoida).
 * Bugunning o'zi o'tgan hisoblanmaydi. Ikkala sana ham `YYYY-MM-DD`,
 * shuning uchun satr solishtiruvi to'g'ri.
 */
function bitishQatori(completionDate: string | null, bugun: string): string | null {
  if (!completionDate || completionDate < bugun) return null;
  const chorak = chorakMuddati(completionDate);
  return chorak ? `Xonadonni bitish muddati: ${chorak}` : null;
}

/** Agent qaytaradigan JSON sxemasi. */
export const AGENT_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'reply', 'replySecond', 'state', 'promise', 'escalate', 'note', 'lesson', 'clientMemory', 'interlocutor',
    'paymentClaim',
  ],
  properties: {
    reply: {
      type: ['string', 'null'],
      description: 'Mijozga yuboriladigan matn, uning tili va alifbosida, 2-3 qatorgacha',
    },
    replySecond: {
      type: ['string', 'null'],
      description: 'Matn 2-3 qatorga sig\'masa — ikkinchi xabar. Aks holda null.',
    },
    state: {
      type: 'string',
      enum: Object.keys(STATE_MEANING),
      description: 'Suhbatning yangi holati',
    },
    promise: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['amount', 'date', 'quote'],
      properties: {
        amount: { type: 'number', description: 'Va\'da qilingan summa (so\'m)' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        quote: { type: 'string', description: 'Mijozning aynan shu gapi' },
      },
    },
    escalate: {
      type: ['string', 'null'],
      description: 'Inson aralashuvi sababi yoki null',
    },
    note: {
      type: ['string', 'null'],
      description: 'Operator uchun ichki eslatma',
    },
    lesson: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['lesson', 'evidence'],
      description: 'Boshqa mijozlarga ham foydali umumiy saboq yoki null',
      properties: {
        lesson: { type: 'string', description: 'Qisqa, amal qilsa bo\'ladigan xulosa' },
        evidence: { type: ['string', 'null'], description: 'Mijozning shu gapidan dalil' },
      },
    },
    clientMemory: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['clientType', 'summary', 'whatWorks'],
      description: 'Shu mijoz haqida eslab qolinadigan narsa yoki null',
      properties: {
        clientType: {
          type: ['string', 'null'],
          enum: ['qochoq', 'tajovuzkor', 'qiynalayotgan', 'yaxshi_niyatli', null],
        },
        summary: { type: ['string', 'null'], description: 'Mijoz haqida qisqa xulosa' },
        whatWorks: { type: ['string', 'null'], description: 'Qaysi yondashuv ishlagan' },
      },
    },
    paymentClaim: {
      type: 'boolean',
      description: 'Mijoz to\'ladim dedi, lekin CRM\'da suhbatdan keyingi to\'lov yo\'q — kuzatuv ochiladi',
    },
    interlocutor: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['name', 'gender', 'relation'],
      description: 'Telegramda shartnoma egasining o\'rniga yozayotgan odam yoki null',
      properties: {
        name: { type: ['string', 'null'], description: 'O\'zi aytgan ismi yoki null' },
        gender: { type: ['string', 'null'], enum: ['male', 'female', null] },
        relation: { type: ['string', 'null'], description: 'Shartnoma egasiga kimligi: "o\'g\'li", "qizi"' },
      },
    },
  },
};

const NATIJA_MATNI: Record<string, string> = {
  gaplashildi: 'gaplashildi',
  kotarmadi: 'ko\'tarmadi',
  band: 'band edi',
  boshqa_odam: 'boshqa odam ko\'tardi',
  raqam_notogri: 'raqam noto\'g\'ri chiqdi',
};

/**
 * Ovozli agentning qo'ng'iroqlari. Qoida "TELEFON SUHBATLARI" (127-migratsiya)
 * shu blokka tayanadi — sarlavhani o'zgartirsangiz qoidani ham moslang.
 * Natijalar ("ko'tarmadi" va h.k.) faqat agent uchun: qoida ularni mijozga
 * aytishni taqiqlaydi.
 */
function telefonBloki(qongiroqlar: ReadonlyArray<AgentPhoneCall>, timeZone: string): string | null {
  if (!qongiroqlar.length) return null;
  const qatorlar = qongiroqlar.map((q) => {
    const sana = formatUzDate(zonedParts(q.startedAt, timeZone).isoDate);
    const qism = [`${sana}, ${q.agentName} (ovozli agent): ${NATIJA_MATNI[q.outcome] ?? q.outcome}`];
    if (q.summary) qism.push(`Xulosa: ${q.summary.replace(/[.]\s*$/, '')}`);
    if (q.promiseDate) {
      qism.push(`Va'da: ${formatUzDate(q.promiseDate)}${q.promiseAmount ? `, ${formatSom(q.promiseAmount)}` : ''}`);
    }
    return `- ${qism.join('. ')}`;
  });
  return `TELEFON SUHBATLARI (hamkasbing — ovozli agent qo'ng'iroq qilgan):\n${qatorlar.join('\n')}`;
}
