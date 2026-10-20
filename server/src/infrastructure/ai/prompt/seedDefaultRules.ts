import type { IAgentRuleRepository } from '@/domain/repositories/IAgentKnowledgeRepository';
import type { ISettingsRepository } from '@/domain/repositories/ISupportRepositories';
import {
  AFTER_AGREEMENT,
  ANTI_REPETITION,
  CHANNEL_RULES,
  CLIENT_REPLIES,
  CLIENT_TYPES,
  CONTRACT_FACTS,
  DIALOGUE_EXAMPLES,
  EXAMPLES,
  FIRST_MESSAGES,
  HARD_SITUATIONS,
  HOSTILE_REPLIES,
  HUMAN_TONE,
  KECHIKISH_SSENARIYLARI,
  MEDIA_RULES,
  OBJECTIONS,
  PAYMENT_CHANNELS,
  PAYMENT_TOOLS,
  INVESTOR_PROCEDURES,
  OBJECT_CHANNELS,
  PROHIBITIONS,
  PROMISE_ACCEPTANCE,
  REAL_EXAMPLES,
  REAL_TEAM_STYLE,
  SOFT_SKILLS,
  STOP_SIGNALS,
  STYLE_RULES,
  TACTICS,
  TONE_EXAMPLES,
} from '@/infrastructure/ai/prompt/knowledgeBase';
import { childLogger } from '@/shared/logger';

const log = childLogger('rules-seed');

interface SectionSeed {
  key: string;
  title: string;
  description: string;
  kind: 'bullets' | 'examples';
  items: readonly string[];
}

/**
 * Kodda yozilgan standart qoidalar — bazaga bir marta ko'chiriladi.
 * Shundan keyin haqiqat manbai baza bo'ladi va dashboarddan tahrirlanadi.
 * Bu ro'yxat "standart qiymatlarga qaytarish" uchun ham ishlatiladi.
 */
const SECTIONS: SectionSeed[] = [
  {
    key: 'real_team_style',
    title: 'Real jamoaning uslubi (40 ta suhbat tahlili)',
    description:
      '`telegram_oila` akkauntidagi 4499 xabar va 251 ovozli xabar transkripti asosida. '
      + 'Bu faraz emas — yillar davomida ishlab kelayotgan jonli xodimlarning haqiqiy '
      + 'uslubi. Ziddiyat bo\'lsa, shu bo\'lim ustun turadi',
    kind: 'bullets',
    items: REAL_TEAM_STYLE,
  },
  {
    key: 'human_tone',
    title: 'Jonli til va mijozning holatiga moslashish',
    description:
      'Eng muhim bo\'lim: agent rasmiy idora tilida yozsa, mijozga robot yozayotgandek '
      + 'tuyuladi. Bu yerda qaysi so\'zni qaysisiga almashtirish va mijozning kayfiyatiga '
      + 'qarab qanday ohang tanlash yozilgan',
    kind: 'bullets',
    items: HUMAN_TONE,
  },
  {
    key: 'soft_skills',
    title: 'Muloqot madaniyati (soft skills)',
    description: 'Bosiqlik, hurmat, tinglash — mijoz bosim ostida ham gaplashishda davom etishi uchun',
    kind: 'bullets',
    items: SOFT_SKILLS,
  },
  {
    key: 'stop_signals',
    title: 'Qachon to\'xtash va odamga topshirish',
    description:
      'Bezovta qilish shikoyati, "boshqa yozmang", sud/advokat, shikoyat va ommaviy '
      + 'e\'lon tahdidi — bunday xabarlarga to\'lov talabi bilan javob berilmaydi',
    kind: 'bullets',
    items: STOP_SIGNALS,
  },
  {
    key: 'hard_situations',
    title: 'Og\'ir vaziyatlar',
    description: 'Vafot, kasallik, haqorat, sud tahdidi — bu yerda xato eng qimmatga tushadi',
    kind: 'bullets',
    items: HARD_SITUATIONS,
  },
  {
    key: 'style',
    title: 'Muloqot uslubi',
    description: 'Agent qanday ohangda va qanday uzunlikda yozadi',
    kind: 'bullets',
    items: STYLE_RULES,
  },
  {
    key: 'channel_rules',
    title: 'Aloqa kanali',
    description: 'Agent faqat Telegramda yozishadi — qo\'ng\'iroq qila olmaydi va va\'da qilmaydi',
    kind: 'bullets',
    items: CHANNEL_RULES,
  },
  {
    key: 'anti_repetition',
    title: 'O\'zini takrorlamaslik',
    description: 'Eng ko\'p uchraydigan xato — ism va summani har xabarda takrorlash',
    kind: 'bullets',
    items: ANTI_REPETITION,
  },
  {
    key: 'promise_acceptance',
    title: 'Qachon "yetarli" deb hisoblash',
    description: 'Mijoz aniq kun aytsa — va\'da olingan, ortiqcha bosim qilinmaydi',
    kind: 'bullets',
    items: PROMISE_ACCEPTANCE,
  },
  {
    key: 'after_agreement',
    title: 'Kelishuvdan keyin',
    description: 'Va\'da olingach bosim tugaydi — oddiy odam kabi gaplashadi',
    kind: 'bullets',
    items: AFTER_AGREEMENT,
  },
  {
    key: 'payment_channels',
    title: 'To\'lov usullari',
    description: 'Naqd pul qabul qilinmaydi — qayerga va qanday to\'lash mumkin',
    kind: 'bullets',
    items: PAYMENT_CHANNELS,
  },
  {
    key: 'payment_tools',
    title: 'To\'lov vositalari (real suhbatlardan)',
    description:
      'Xonsaroy Pay ilovasi, komissiya, call center. DIQQAT: bu ma\'lumot chat '
      + 'yozishmalaridan olingan, rasmiy hujjatdan emas — tasdiqlab qo\'ying',
    kind: 'bullets',
    items: PAYMENT_TOOLS,
  },
  {
    key: 'investor_procedures',
    title: 'Investorlar bilan ishlash tartibi (rasmiy yo\'riqnoma)',
    description:
      'Uslub emas, TARTIB: qaysi holatda nima qilinadi va qaysi biri agentning '
      + 'vakolatidan tashqarida. Manba — "Investorlar bilan ishlash" yo\'riqnomasi',
    kind: 'bullets',
    items: INVESTOR_PROCEDURES,
  },
  {
    key: 'object_channels',
    title: 'Obyekt kanallari va qurilishga tashrif',
    description:
      'Qurilish holati so\'ralganda yuboriladigan aniq havolalar va obyektga '
      + 'tashrif tartibi',
    kind: 'bullets',
    items: OBJECT_CHANNELS,
  },
  {
    key: 'contract_facts',
    title: 'Tasdiqlangan shartnoma shartlari',
    description: 'Agent FAQAT shu raqamlardan foydalanadi. Yangi fakt qo\'shishdan oldin shartnoma matni bilan tekshiring!',
    kind: 'bullets',
    items: CONTRACT_FACTS,
  },
  {
    key: 'tactics',
    title: 'Ishlaydigan taktikalar',
    description: 'Test suhbatlarda tasdiqlangan usullar',
    kind: 'bullets',
    items: TACTICS,
  },
  {
    key: 'client_types',
    title: 'Mijoz tipiga qarab',
    description: 'Har bir tipga alohida yondashuv',
    kind: 'bullets',
    items: CLIENT_TYPES,
  },
  {
    key: 'media',
    title: 'Rasm, ovoz va fayllar',
    description: 'Mijoz chek yoki ovozli xabar yuborganda',
    kind: 'bullets',
    items: MEDIA_RULES,
  },
  {
    key: 'prohibitions',
    title: 'Qat\'iy taqiqlar',
    description: 'Agent hech qachon qilmaydigan narsalar',
    kind: 'bullets',
    items: PROHIBITIONS,
  },
  {
    key: 'first_messages',
    title: 'Birinchi xabarning tuzilmalari',
    description:
      'Agent har mijozga bitta shablonni yozmasligi uchun 12 ta variant. Ular '
      + 'so\'z bilan emas, QURILISH bilan farq qiladi: qaysi fakt aytiladi, savol '
      + 'ochiqmi yoki tanlovli, xabar bittami yoki ikkita. Har bandda avval holat, '
      + 'keyin matn — matn shakl, ko\'chirma emas',
    kind: 'bullets',
    items: FIRST_MESSAGES,
  },
  {
    key: 'kechikish_ssenariylari',
    title: 'Kechikish kuniga qarab ssenariylar',
    description:
      'Debitor bo\'limi tayyorlagan 7 ta ssenariy: mijoz va\'da berib to\'lamaganda, '
      + 'xabarni o\'qib javob bermaganda va kechikish 10, 20, 30, 40–50, 60 kunga '
      + 'yetganda. Matnlar shakl — ko\'chirma emas. DIQQAT: eskrou tizimiga o\'tish '
      + 'muddati tasdiqlanmagan, shuning uchun aniq oy yoki sana aytilmaydi',
    kind: 'bullets',
    items: KECHIKISH_SSENARIYLARI,
  },
];

/** `examples` turidagi bo'limlar (yomon/yaxshi juftliklar). */
const EXAMPLE_SECTIONS: Array<{
  key: string;
  title: string;
  description: string;
  items: ReadonlyArray<{ situation: string; bad: string; good: string; why: string }>;
}> = [
  {
    key: 'real_examples',
    title: 'Real jamoa qanday javob bergan',
    description:
      'YOMON — bizning agentimiz shu holatda yozadigan matn. YAXSHI — jonli xodim '
      + 'aynan nima yozgani (ba\'zilari ovozli xabar transkriptidan)',
    items: REAL_EXAMPLES,
  },
  {
    key: 'tone_examples',
    title: 'Rasmiy / jonli — bir xil gap, ikki xil til',
    description:
      'Boshqa misollar NIMA deyishni o\'rgatadi, bu bo\'lim QANDAY aytishni. '
      + 'Har juftlikda mazmun bir xil, faqat til boshqacha',
    items: TONE_EXAMPLES,
  },
  {
    key: 'objections',
    title: 'E\'tirozlarga tayyor javoblar',
    description:
      'Tipik bahonalarga oldindan tayyorlangan javoblar — improvizatsiya emas (playbook, 8-bo\'lim)',
    items: OBJECTIONS,
  },
  {
    key: 'examples',
    title: 'Misollar (yomon / yaxshi)',
    description: 'Real suhbatlardan olingan qarama-qarshi misollar — eng kuchli ko\'rsatma',
    items: EXAMPLES,
  },
  {
    key: 'dialogue_examples',
    title: 'Jonli muloqot misollari (takrorlanishga qarshi)',
    description:
      'Agent bir xil talabni qayta-qayta yozib mijozlarni bezdirgan real suhbatlardan olingan — '
      + 'har bir juftlik o\'sha o\'rinda qanday javob berish kerakligini ko\'rsatadi',
    items: DIALOGUE_EXAMPLES,
  },
  {
    key: 'client_replies',
    title: 'Mijoz javoblariga namunalar (20 ta tipik holat)',
    description:
      'Mijozlar amalda nima yozadi va har biriga qanday javob berish kerak — '
      + 'aniq kun aytilsa qayd qil, taxminiy muddat aytilsa sanani o\'zing taklif qil, '
      + 'to\'lov da\'vosi yoki kasallik bo\'lsa eskalatsiya qil',
    items: CLIENT_REPLIES,
  },
  {
    key: 'hostile_replies',
    title: 'Norozilik, tahdid va rad javoblari (60 ta holat)',
    description:
      'Bezor bo\'lgan, tahdid qilayotgan yoki to\'lashdan bosh tortayotgan mijozlar. '
      + 'Deyarli hech biriga to\'lov talabi bilan javob berilmaydi — yo bosim to\'xtatiladi, '
      + 'yo suhbat odamga o\'tkaziladi',
    items: HOSTILE_REPLIES,
  },
];

const SEEDED_KEY = 'agent.seeded_sections';

/**
 * Bo'limlarni bazaga sinxronlaydi.
 *
 * Muhim: allaqachon urug'lantirilgan bo'lim QAYTA to'ldirilmaydi — aks holda
 * operator o'chirgan qoida server har qayta ishga tushganda tirilib turardi.
 * Shuning uchun qaysi bo'limlar urug'lantirilgani `settings` da qayd etiladi.
 */
export async function syncRuleSections(
  repo: IAgentRuleRepository,
  settings: ISettingsRepository,
): Promise<void> {
  const seeded = new Set((await settings.get<string[]>(SEEDED_KEY)) ?? []);

  // Eski o'rnatishlar (ro'yxat hali yo'q): qaysi bo'limda qoida BOR bo'lsa,
  // o'sha urug'langan deb hisoblaymiz. Bo'sh bo'limlar — yangi qo'shilganlari,
  // ular to'ldirilishi kerak.
  if (seeded.size === 0) {
    for (const existing of await repo.listSections()) {
      if (existing.rules.length > 0) seeded.add(existing.key);
    }
  }

  let order = 0;
  for (const section of SECTIONS) {
    await repo.createSection({ ...section, sortOrder: order });
    order += 1;
  }
  for (const section of EXAMPLE_SECTIONS) {
    await repo.createSection({
      key: section.key,
      title: section.title,
      description: section.description,
      kind: 'examples',
      sortOrder: order,
    });
    order += 1;
  }

  const sections = await repo.listSections();
  const byKey = new Map(sections.map((s) => [s.key, s]));
  const added: string[] = [];

  for (const seed of SECTIONS) {
    if (seeded.has(seed.key)) continue;
    const section = byKey.get(seed.key);
    if (!section) continue;

    // Bo'limda qoida BOR bo'lsa — tegmaymiz.
    //
    // NEGA: `seeded` ro'yxati faqat urug'lantirilgan bo'limlarni eslab
    // qoladi. Bo'lim MIGRATSIYA orqali qo'shilgan bo'lsa u ro'yxatga
    // tushmaydi, ya'ni bu tsikl uning qoidalarini IKKINCHI marta qo'shib
    // yuborardi — prodda aynan shunday bo'ldi (2026-08-11: investor
    // yo'riqnomasining 15 ta qoidasi ikki nusxada).
    //
    // Ro'yxatga emas, bazadagi HOLATGA tayanish to'g'ri: bo'sh bo'lmagan
    // bo'limga hech qachon qo'shmaymiz.
    if (section.rules.length > 0) {
      seeded.add(seed.key);
      continue;
    }

    let ord = 0;
    for (const body of seed.items) {
      await repo.addRule({ sectionId: section.id, body, sortOrder: ord });
      ord += 1;
    }
    seeded.add(seed.key);
    added.push(seed.key);
  }

  for (const seed of EXAMPLE_SECTIONS) {
    if (seeded.has(seed.key)) continue;
    const section = byKey.get(seed.key);
    if (!section) continue;
    // Yuqoridagi bilan bir xil himoya.
    if (section.rules.length > 0) {
      seeded.add(seed.key);
      continue;
    }

    let ord = 0;
    for (const e of seed.items) {
      await repo.addRule({
        sectionId: section.id,
        situation: e.situation,
        badExample: e.bad,
        goodExample: e.good,
        why: e.why,
        sortOrder: ord,
      });
      ord += 1;
    }
    seeded.add(seed.key);
    added.push(seed.key);
  }

  await settings.set(SEEDED_KEY, [...seeded]);

  if (added.length) {
    log.info({ sections: added }, 'Yangi qoida bo\'limlari qo\'shildi');
  }
}

/** Bitta bo'limni standart qiymatlarga qaytarish. */
export async function resetSection(repo: IAgentRuleRepository, sectionKey: string): Promise<number> {
  await repo.clearSection(sectionKey);

  const sections = await repo.listSections();
  const section = sections.find((s) => s.key === sectionKey);
  if (!section) return 0;

  const exampleSeed = EXAMPLE_SECTIONS.find((s) => s.key === sectionKey);
  if (exampleSeed) {
    let order = 0;
    for (const e of exampleSeed.items) {
      await repo.addRule({
        sectionId: section.id,
        situation: e.situation,
        badExample: e.bad,
        goodExample: e.good,
        why: e.why,
        sortOrder: order,
      });
      order += 1;
    }
    return exampleSeed.items.length;
  }

  const seed = SECTIONS.find((s) => s.key === sectionKey);
  if (!seed) return 0;

  let order = 0;
  for (const body of seed.items) {
    await repo.addRule({ sectionId: section.id, body, sortOrder: order });
    order += 1;
  }
  return seed.items.length;
}
