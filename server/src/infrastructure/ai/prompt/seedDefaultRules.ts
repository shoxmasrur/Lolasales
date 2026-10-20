import type { IAgentRuleRepository } from '@/domain/repositories/IAgentKnowledgeRepository';
import type { ISettingsRepository } from '@/domain/repositories/ISupportRepositories';
import {
  STANDART_BOLIMLAR,
  STANDART_MISOL_BOLIMLARI,
} from '@/infrastructure/ai/prompt/knowledgeBase';
import { childLogger } from '@/shared/logger';

const log = childLogger('rules-seed');

/**
 * Kodda yozilgan standart qoidalar — bazaga bir marta ko'chiriladi.
 * Shundan keyin haqiqat manbai baza bo'ladi va dashboarddan tahrirlanadi.
 * Bu ro'yxat "standart qiymatlarga qaytarish" uchun ham ishlatiladi.
 *
 * Matnlar `knowledgeBase.ts` da: `defaultRulesText` (bazasiz sinov
 * stendlari) ham shu ro'yxatni o'qiydi, ikkalasi ajralib ketmaydi.
 */
const SECTIONS = STANDART_BOLIMLAR;

/** `examples` turidagi bo'limlar (yomon/yaxshi juftliklar). */
const EXAMPLE_SECTIONS = STANDART_MISOL_BOLIMLARI;

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
    await repo.createSection({
      key: section.key,
      title: section.title,
      description: section.description,
      kind: 'bullets',
      sortOrder: order,
    });
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
