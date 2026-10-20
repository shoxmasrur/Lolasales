import {
  AFTER_AGREEMENT,
  ANTI_REPETITION,
  CLIENT_TYPES,
  CONTRACT_FACTS,
  EXAMPLES,
  MEDIA_RULES,
  PAYMENT_CHANNELS,
  PROHIBITIONS,
  PROMISE_ACCEPTANCE,
  STYLE_RULES,
  TACTICS,
} from '@/infrastructure/ai/prompt/knowledgeBase';

/**
 * Bazasiz ishlaydigan qoidalar matni — kodda yozilgan standartlardan.
 *
 * Ishlab turgan agent qoidalarni BAZADAN oladi (operator ularni
 * tahrirlashi mumkin). Sinov stendlari esa bazaga bog'lanmasligi kerak:
 * aks holda solishtiruv natijasi kimningdir lokal bazasidagi tahrirga
 * bog'liq bo'lib qolardi va boshqa mashinada takrorlanmasdi.
 */
export function defaultRulesText(): string {
  const block = (title: string, items: readonly string[]): string =>
    `## ${title.toUpperCase()}\n${items.map((i) => `- ${i}`).join('\n')}`;

  return [
    block('Muloqot uslubi', STYLE_RULES),
    block('O\'zini takrorlamaslik', ANTI_REPETITION),
    block('Qachon yetarli deb hisoblash', PROMISE_ACCEPTANCE),
    block('Kelishuvdan keyin', AFTER_AGREEMENT),
    block('To\'lov usullari', PAYMENT_CHANNELS),
    block('Tasdiqlangan shartnoma shartlari', CONTRACT_FACTS),
    block('Ishlaydigan taktikalar', TACTICS),
    block('Mijoz tipiga qarab', CLIENT_TYPES),
    block('Rasm, ovoz va fayllar', MEDIA_RULES),
    block('Qat\'iy taqiqlar', PROHIBITIONS),
    `## MISOLLAR\n${EXAMPLES.map(
      (e) => `Vaziyat: ${e.situation}\n  ✗ YOMON: ${e.bad}\n  ✓ YAXSHI: ${e.good}\n  Sabab: ${e.why}`,
    ).join('\n\n')}`,
  ].join('\n\n');
}
