import type { Interlocutor } from '@/domain/entities/AgentMemory';
import type { ClientSource } from '@/domain/entities/Client';
import type { Course, CourseKnowledge, KnowledgeKind } from '@/domain/entities/Course';
import { BOSQICH_YORLIGI } from '@/domain/entities/Purchase';
import type { AgentKnowledgeBlocks, AgentSalesContext } from '@/domain/services/IAgentEngine';
import { addressForm } from '@/shared/gender';
import { formatUzDate, zonedParts } from '@/shared/datetime';

export interface PromptPersona {
  name: string;
  role: string;
}

export const DEFAULT_PERSONA: PromptPersona = {
  name: 'Lola',
  role: 'sotuv menejeri',
};

/** Sozlamalarda kompaniya nomi kiritilmagan bo'lsa. */
export const DEFAULT_COMPANY = 'LolaSales';

/**
 * Tizim prompti. Qoidalar bloki BAZADAN keladi — dashboardda tahrirlanadi,
 * shuning uchun bu funksiya ularni tayyor matn sifatida qabul qiladi.
 *
 * Bo'limlar tartibi qat'iy: shaxs → misollarni o'qish → qoidalar → sotuv
 * bosqichlari → qat'iy taqiqlar → saboqlar → mijoz xotirasi → til va
 * alifbo → ohang → javob formati.
 */
export function buildSystemPrompt(
  persona: PromptPersona,
  companyName: string,
  knowledge: AgentKnowledgeBlocks,
): string {
  const name = knowledge.personaName || persona.name;
  const company = companyName.trim() || DEFAULT_COMPANY;

  const parts = [
    `Siz ${name}siz, ${company} kompaniyasining ${persona.role}. Vazifangiz — sotuvdagi
kursni mijozga mos bo'lsa sotish: avval savol berib ehtiyojni bilib olasiz, keyin taklif
qilasiz, e'tirozlarga javob berasiz va to'lovga olib borasiz. Telegram orqali yozishasiz.

Inson emasligingizni o'z tashabbusingiz bilan aytmaysiz, lekin mijoz to'g'ridan-to'g'ri
"siz botmisiz / robotmisiz" deb so'rasa — YOLG'ON GAPIRMANG: avtomatlashtirilgan
yordamchi ekaningizni qisqa tan oling va suhbatni davom ettiring.`,

    // Bu blok qoidalardan OLDIN turishi shart: u qoidalarni qanday o'qishni aytadi.
    `## MISOLLARNI QANDAY O'QISH
Quyidagi qoidalar orasida "✗ YOMON" va "✓ YAXSHI" juftliklari uchraydi.
- "✗ YOMON" — TAQIQLANGAN matn. U bu yerda faqat xatoni KO'RSATISH uchun
  turibdi. Undan jumlani, iborani yoki tanishtiruv shaklini KO'CHIRMANG —
  bo'lagini ham. Yozayotgan matningiz "✗" variantiga o'xshab qolsa, qayta yozing.
- "✓ YAXSHI" — namuna. Uslubini oling, lekin so'zma-so'z ko'chirmang: har mijozga
  uning holatiga moslab qayta yozing.
Ikki variant bir-biriga o'xshab tuyulsa, farqi "Sabab" qatorida yozilgan.`,

    knowledge.rules,

    SOTUV_BOSQICHLARI,

    QATIY_TAQIQLAR,

    knowledge.lessons,
    knowledge.clientMemory,

    `## TIL VA ALIFBO — MIJOZGA MOSLASH
Mijoz qaysi tilda va qaysi ALIFBODA yozsa, javobingiz ham SHUNDAY bo'lsin:
- lotin alifbosidagi o'zbekcha → lotin alifbosida o'zbekcha
- KIRILL alifbosidagi o'zbekcha → KIRILL alifbosida o'zbekcha ("Ассалому алайкум…")
- rus tilida → rus tilida
Birinchi murojaat (mijoz hali javob bermagan) — o'zbek tilida, lotin alifbosida.
Mijoz javob bergach uning tili va alifbosiga o'ting va suhbat oxirigacha shunday davom eting.`,

    `## OHANG — MIJOZNING HOLATIGA MOSLASH
Javob yozishdan oldin mijozning oxirgi xabarini qayta o'qing va uning HOLATINI aniqlang:
qiziqqan / ikkilanayotgan / shoshayotgan / shubhalanayotgan / befarq / xotirjam.
Ohangingizni shunga moslang — mazmun bir xil bo'lsa ham, ohang har safar boshqacha bo'ladi.

Xabarni yuborishdan oldin o'zingizdan so'rang: "buni odam yozganmi yoki dastur?"
Jumla reklama bukletidan ko'chirilgandek tuyulsa — qayta yozing. Siz shu ishni yillar
davomida qilib kelayotgan tirik xodimsiz, shablon emas. Bosim qilmang: mijozga mos
bo'lmasa, buni ochiq tan olish ham yaxshi sotuvchining ishi.`,

    buildOutputSpec(),
  ];

  // Qoidalar, saboqlar va misollarda ism `{ism}` ko'rinishida yoziladi —
  // ular bazadan keladi va qaysi akkaunt yozayotganini bilmaydi.
  return parts.filter((p) => p.trim()).join('\n\n').replaceAll('{ism}', name);
}

const SOTUV_BOSQICHLARI = `## SOTUV BOSQICHLARI
Suhbat tarixiga qarab HOZIR qaysi bosqichda ekaningizni aniqlang va faqat o'sha qadamni bajaring.
Bir xabarda bitta qadam va eng ko'pi bilan bitta savol.
1. Tanishuv — salomlashib, o'zingizni qisqa tanishtirasiz (faqat birinchi xabarda).
2. Ehtiyoj — 1-2 ta savol bilan mijoz nima uchun qiziqqanini, maqsadini va tajribasini bilib olasiz.
   Ehtiyojni bilmasdan turib narx va dasturni sanab bermang.
3. Taqdimot — kursni mijoz aytgan ehtiyojga bog'lab, qisqa taqdim etasiz. Faqat "SOTUVDAGI KURSLAR"
   blokidagi faktlardan foydalaning. Ikki kurs sotuvda bo'lsa, ikkalasini ayting va mosini tanlashga yordam bering.
4. E'tiroz — avval tinglang va tan oling, keyin kurs bazasidagi javobga tayanib javob bering. Bahslashmang.
5. Yopish — mijoz tayyor bo'lsa, aniq keyingi qadamni taklif qiling ("joyingizni band qilib qo'yaymi?").
6. To'lov — mijoz to'lashga rozi bo'lsa \`sendCard\` = true; tizim karta ma'lumotini alohida xabar qilib yuboradi.
   Bo'lib to'lashni faqat kursda ruxsat etilgan bo'lsa va faqat yozilgan shartlar bilan taklif qilasiz;
   mijoz uni tanlasa \`installment\` = true.
7. Chek — to'lovdan keyin chekni shu chatga yuborishni so'raysiz. Chek kelgach "qabul qildim,
   tekshirib chiqamiz" deysiz — to'lov qabul qilinganini MENEJER tasdiqlaydi, siz emas.

Bosqich maydoni (\`stage\`): suhbat boshlanib, mijoz javob bera boshlasa — "suhbatda"; mijoz aniq
bir kursga qiziqish bildirsa — "qiziqdi" (va \`courseId\` ga o'sha kursning id si); mijoz aniq rad
etsa — "rad_etdi". O'zgarish bo'lmasa — null. Boshqa bosqichlarni (karta, chek, to'lov) tizim qo'yadi.

Sotuvda kurs bo'lmasa — yangi sotuvga undamaysiz: keyingi kurs va uning sotuv boshlanish sanasini
aytib, mijozni "qiziqdi" holatida qoldirasiz (\`sendCard\` = false). Keyingi kurs ham bo'lmasa —
"tez orada xabar beramiz" deysiz.`;

const QATIY_TAQIQLAR = `## QAT'IY TAQIQLAR (hech qanday holatda buzilmaydi)
- Narx, sana, chegirma, karta, havola yoki shartni O'YLAB TOPMANG. Faqat kontekstda yozilganini ayting.
  Chegirma yo'q — va'da qilmang.
- Karta raqamini, karta egasining ismini va yopiq guruh havolasini O'ZINGIZ YOZMANG — hatto
  suhbat tarixida ko'rinib turgan bo'lsa ham. Karta kerak bo'lsa \`sendCard\` = true qaytaring:
  tizim uni aniq qiymatdan yuboradi.
- "To'lov qabul qilindi", "to'lovingiz tushdi" DEMANG — buni faqat menejer chekni tekshirib tasdiqlaydi.
- Faqat sotuvdagi kursni sotasiz. Sotuvdan chiqqan kursni taklif qilmang.
- Kurs bazasida javobi yo'q savolga javob o'ylab topmang — \`reply\` da "aniqlab aytaman" mazmunida
  qisqa yozing va \`escalate\` ga sababini yozing. Shikoyat, pulni qaytarish talabi yoki menejerni
  so'rash ham — \`escalate\`.`;

function buildOutputSpec(): string {
  return `## JAVOB FORMATI
Javobingizni faqat JSON obyekt sifatida qaytaring. Maydonlar:
- reply: mijozga YUBORILADIGAN matn, mijozning tili va alifbosida, 2-3 QATORDAN oshmasin.
  Yubormaslik kerak bo'lsa — null.
- replySecond: aytadigan narsa 2-3 qatorga sig'masa — ikkinchi xabar matni, aks holda null.
- stage: yangi bosqich — "suhbatda", "qiziqdi", "rad_etdi" yoki null (o'zgarmasa).
- courseId: mijoz qiziqqan kursning id si ("SOTUVDAGI KURSLAR" blokidan) yoki null.
- sendCard: mijoz to'lashga rozi bo'ldi va karta kerak — true; aks holda false.
  true bo'lsa \`reply\` da tabiiy matn yozing ("Mana karta, to'lovdan keyin chekni shu yerga yuboring"),
  raqamni yozmang.
- installment: mijoz bo'lib to'lashni tanladi (kursda ruxsat etilgan bo'lsa) — true; aks holda false.
- escalate: menejer aralashuvi kerak bo'lsa sabab (matn), aks holda null. Sabablar: bazada javobi
  yo'q savol, shikoyat, pulni qaytarish talabi, menejer yoki telefon orqali gaplashishni so'radi,
  "boshqa yozmang" dedi, haqorat qildi.
- note: ichki eslatma (dashboarddagi menejer uchun, mijoz ko'rmaydi) yoki null.
- lesson: shu suhbatdan olingan UMUMIY saboq — boshqa mijozlarga ham foydali bo'lsa
  {lesson, evidence}. Oddiy suhbatda null; faqat chindan yangi narsa o'rgansangiz yozing
  (masalan yangi e'tiroz turi va unga ishlagan javob).
- clientMemory: SHU MIJOZ haqida eslab qolish kerak bo'lgan narsa yoki null.
  {clientType, summary, whatWorks}.
  clientType variantlari: "tez_qaror", "oylaydigan", "narxga_sezgir", "shubhali" yoki null.
- interlocutor: Telegramda mijozning o'zi EMAS, DOIM boshqa odam yozayotgani aniq bo'lsa —
  {name, gender, relation}. Masalan "o'g'liman… Ismim Oybek" → {"name": "Oybek",
  "gender": "male", "relation": "o'g'li"}. Ismni faqat odam O'ZI aytgan bo'lsa yozing,
  Telegram nomidan olmang. Kontekstdagi "Suhbatdosh" qatori allaqachon to'g'ri bo'lsa — null.
  gender: "male" / "female", aniq bo'lmasa null.`;
}

const UZ_WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

function buildTodayBlock(now: Date, timeZone: string): string {
  const isoDate = zonedParts(now, timeZone).isoDate;
  const weekday = UZ_WEEKDAYS[new Date(`${isoDate}T12:00:00Z`).getUTCDay()] ?? '';
  return `## BUGUN\n${isoDate} — ${weekday}`;
}

/**
 * Mijozning O'ZINI atagan so'zi unga QAYTARILMAYDI: mijoz agentni "singlim"
 * desa, bu so'z agentga qaratilgan — uni mijozga qaytarish xato.
 */
const MUROJAATNI_QAYTARMA =
  'Mijoz SIZNI qanday atasa ("singlim", "opa", "qizim", "uka") — bu so\'z SIZGA '
  + 'qaratilgan, mijozning o\'ziga emas. Uni mijozga qaytarib ishlatmang. Til, alifbo va ohang '
  + 'mijozga moslanadi, murojaat shakli MOSLANMAYDI — faqat shu yerda berilgan shaklni ishlating.';

/**
 * Kimga va qanday murojaat qilinadi. Suhbatdosh ma'lum bo'lsa mijozning
 * murojaat shakli UMUMAN berilmaydi — faqat uchinchi shaxs sifatida.
 */
export function murojaatQatorlari(
  ownerAddress: string | null,
  interlocutor: Interlocutor | null,
): string[] {
  if (!interlocutor) {
    return [
      ownerAddress
        ? `Iliq murojaat shakli: "${ownerAddress}" — birinchi xabardan keyin shu shaklni ishlating`
        : 'Iliq murojaat shakli: ANIQLANMADI — "aka" yoki "opa" deb murojaat QILMANG, ismni umuman ishlatmang',
      MUROJAATNI_QAYTARMA,
    ];
  }

  const { name, gender, relation } = interlocutor;
  const egasi = ownerAddress ?? 'mijoz';
  const kim = relation ? `mijozning ${relation}` : 'mijozning o\'zi EMAS';
  const jins =
    gender === 'male'
      ? `U ERKAK — unga "opa" DEMANG.`
      : gender === 'female'
        ? `U AYOL — unga "aka" DEMANG.`
        : `Jinsi aniqlanmagan — "aka" yoki "opa" ishlatmang.`;
  const murojaat = name
    ? `Murojaat shakli: "${name}" — har bir xabarni SHU odamga yozing. `
    : `Murojaat shakli: ismi aytilmagan — ismsiz yozing, "aka"/"opa" ham qo'shmang. `;

  return [
    `Suhbatdosh: Telegramda ${name ?? 'boshqa odam'} yozadi — ${kim}.`,
    `${murojaat}"${egasi}" deb unga murojaat QILMANG. ${jins}`,
    `Mijoz haqida uchinchi shaxsda gapiring ("${egasi}").`,
    MUROJAATNI_QAYTARMA,
  ];
}

/**
 * `1 500 000 so'm` — oddiy ASCII bo'shliq bilan. `formatSom` ATAYLAB
 * olinmadi: `Intl` ajratgichi tor bo'shliq, model esa raqamni aynan
 * ko'rgan ko'rinishida ko'chiradi.
 */
export function som(n: number): string {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
}

const MANBA_MATNI: Record<ClientSource, string> = {
  reklama: 'reklama — mijoz o\'zi yozgan',
  guruh: 'guruh/kanal kommenti',
  raqam: 'raqamlar ro\'yxati — mijoz bizga hali yozmagan',
  qolda: 'menejer qo\'lda qo\'shgan',
};

const BAZA_TURI: Record<KnowledgeKind, string> = {
  dastur: 'Dastur',
  savol_javob: 'Savol-javob',
  etiroz: 'E\'tirozlarga javoblar',
  boshqa: 'Boshqa ma\'lumot',
};
const BAZA_TARTIBI: readonly KnowledgeKind[] = ['dastur', 'savol_javob', 'etiroz', 'boshqa'];

function bolibTolashQatori(c: Course): string {
  if (!c.installmentAllowed) return "Bo'lib to'lash: bo'lib to'lash yo'q — faqat to'liq to'lov";
  const qism = c.installmentParts ? `${c.installmentParts} qismga` : 'qismlarga';
  const birinchi = c.installmentFirstMin !== null ? `, birinchi qism kamida ${som(c.installmentFirstMin)}` : '';
  return `Bo'lib to'lash: bor — ${qism}${birinchi}`;
}

function bazaBloki(knowledge: readonly CourseKnowledge[]): string[] {
  const yoqilgan = knowledge.filter((k) => k.isEnabled).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!yoqilgan.length) return [];
  const lines = ['  Ma\'lumotlar bazasi:'];
  for (const turi of BAZA_TARTIBI) {
    const yozuvlar = yoqilgan.filter((k) => k.kind === turi);
    if (!yozuvlar.length) continue;
    lines.push(`    ${BAZA_TURI[turi]}:`);
    for (const k of yozuvlar) lines.push(`      - ${k.title}: ${k.body.replace(/\s*\n\s*/g, ' ')}`);
  }
  return lines;
}

function kursBloki(c: Course, knowledge: readonly CourseKnowledge[]): string {
  const lines = [
    `▸ ${c.name} (id: ${c.id})`,
    c.description ? `  Tavsif: ${c.description}` : null,
    `  Narx: ${som(c.price)}`,
    c.duration ? `  Davomiylik: ${c.duration}` : null,
    c.startsOn ? `  Boshlanishi: ${formatUzDate(c.startsOn)}` : null,
    `  Sotuv tugaydi: ${formatUzDate(c.salesEnd)}`,
    c.topics.length ? `  Mavzular: ${c.topics.join('; ')}` : null,
    `  ${bolibTolashQatori(c)}`,
    ...bazaBloki(knowledge),
  ];
  return lines.filter((l): l is string => Boolean(l)).join('\n');
}

function xaridBloki(context: AgentSalesContext): string {
  const p = context.purchase;
  if (!p) return '## XARID\nBosqich: Yangi (xarid hali ochilmagan)';

  const kurs = p.courseId ? context.coursesOnSale.find((k) => k.course.id === p.courseId)?.course ?? null : null;
  const lines = [`Bosqich: ${BOSQICH_YORLIGI[p.stage]}`];
  if (p.courseId) {
    lines.push(kurs ? `Qiziqqan kurs: ${kurs.name} (id: ${kurs.id})` : `Qiziqqan kurs: id ${p.courseId} — HOZIR SOTUVDA EMAS, sotuvdagisini taklif qiling`);
  }
  if (p.totalAmount !== null) {
    lines.push(
      `Kurs summasi: ${som(p.totalAmount)}`,
      `To'langan: ${som(p.paidAmount)}`,
      `Qolgan: ${som(Math.max(0, p.totalAmount - p.paidAmount))}`,
    );
  }
  lines.push(`To'lov turi: ${p.installment ? "bo'lib to'lash" : "to'liq"}`);
  return `## XARID\n${lines.join('\n')}`;
}

function kurslarBloki(context: AgentSalesContext): string {
  if (context.coursesOnSale.length) {
    return `## SOTUVDAGI KURSLAR\n${context.coursesOnSale.map((k) => kursBloki(k.course, k.knowledge)).join('\n\n')}`;
  }
  const keyingi = context.nextCourse;
  return (
    `## SOTUVDAGI KURSLAR\nHozir sotuvda kurs yo'q. Yangi sotuvga undamang va karta yubormang.\n` +
    (keyingi
      ? `Keyingi kurs: ${keyingi.name} — sotuv ${formatUzDate(keyingi.salesStart)} kuni boshlanadi. ` +
        'Shuni aytib, mijozni "qiziqdi" holatida qoldiring.'
      : 'Keyingi kurs ham hali belgilanmagan — "tez orada xabar beramiz" deng.')
  );
}

/** Mijoz va sotuvdagi kurslar haqidagi faktlar — har navbatda yangidan quriladi. */
export function buildContextBlock(context: AgentSalesContext, now: Date, timeZone: string): string {
  const address = addressForm(context.clientName, context.clientFirstName);

  const mijoz = [
    `Mijoz: ${context.clientName}`,
    ...murojaatQatorlari(address, context.interlocutor ?? null),
    `Manba: ${MANBA_MATNI[context.source]}`,
    context.source === 'guruh'
      ? `Kanal: ${context.sourceGroup ?? 'nomi noma\'lum'}. Mijoz komment yozgan: «${context.sourceComment ?? ''}»`
      : null,
    context.boughtCourses.length ? `Oldin sotib olgan kurslari: ${context.boughtCourses.join(', ')}` : null,
  ].filter((l): l is string => Boolean(l));

  return [
    buildTodayBlock(now, timeZone),
    `## MIJOZ\n${mijoz.join('\n')}`,
    xaridBloki(context),
    kurslarBloki(context),
    'Narx va summalarni AYNAN shu ko\'rinishda yozing — "1 500 000 so\'m". So\'zga aylantirmang ' +
      'va yaxlitlamang. Bu yerda yo\'q raqamni aytmang.',
  ].join('\n\n');
}

/** Agent qaytaradigan JSON sxemasi (strict: hamma maydon `required`). */
export const AGENT_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'reply', 'replySecond', 'stage', 'courseId', 'sendCard', 'installment', 'escalate', 'note', 'lesson',
    'clientMemory', 'interlocutor',
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
    stage: {
      type: ['string', 'null'],
      enum: ['suhbatda', 'qiziqdi', 'rad_etdi', null],
      description: 'Agent taklif qilgan yangi bosqich yoki null',
    },
    courseId: {
      type: ['string', 'null'],
      description: 'Mijoz qiziqqan sotuvdagi kursning id si yoki null',
    },
    sendCard: {
      type: 'boolean',
      description: 'Mijoz to\'lashga rozi — tizim kartani alohida xabar qilib yuboradi',
    },
    installment: {
      type: 'boolean',
      description: 'Mijoz bo\'lib to\'lashni tanladi',
    },
    escalate: {
      type: ['string', 'null'],
      description: 'Menejer aralashuvi sababi yoki null',
    },
    note: {
      type: ['string', 'null'],
      description: 'Menejer uchun ichki eslatma',
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
          enum: ['tez_qaror', 'oylaydigan', 'narxga_sezgir', 'shubhali', null],
        },
        summary: { type: ['string', 'null'], description: 'Mijoz haqida qisqa xulosa' },
        whatWorks: { type: ['string', 'null'], description: 'Qaysi yondashuv ishlagan' },
      },
    },
    interlocutor: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['name', 'gender', 'relation'],
      description: 'Telegramda mijozning o\'rniga yozayotgan odam yoki null',
      properties: {
        name: { type: ['string', 'null'], description: 'O\'zi aytgan ismi yoki null' },
        gender: { type: ['string', 'null'], enum: ['male', 'female', null] },
        relation: { type: ['string', 'null'], description: 'Mijozga kimligi: "o\'g\'li", "qizi"' },
      },
    },
  },
};
