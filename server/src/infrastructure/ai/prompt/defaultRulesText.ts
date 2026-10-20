import {
  STANDART_BOLIMLAR,
  STANDART_MISOL_BOLIMLARI,
} from '@/infrastructure/ai/prompt/knowledgeBase';

/**
 * Bazasiz ishlaydigan qoidalar matni — kodda yozilgan standartlardan.
 *
 * Ishlab turgan agent qoidalarni BAZADAN oladi (operator ularni
 * tahrirlashi mumkin). Sinov stendlari esa bazaga bog'lanmasligi kerak:
 * aks holda solishtiruv natijasi kimningdir lokal bazasidagi tahrirga
 * bog'liq bo'lib qolardi va boshqa mashinada takrorlanmasdi.
 *
 * Ko'rinishi `PromptComposer.renderSections` bilan bir xil va bo'limlar
 * bazaga urug'lanadigan tartibda: avval `bullets`, keyin misollar.
 */
export function defaultRulesText(): string {
  const bullets = STANDART_BOLIMLAR.map(
    (s) => `## ${s.title.toUpperCase()}\n${s.items.map((i) => `- ${i}`).join('\n')}`,
  );
  const misollar = STANDART_MISOL_BOLIMLARI.map(
    (s) =>
      `## ${s.title.toUpperCase()}\n${s.items
        .map((e) => `Vaziyat: ${e.situation}\n  ✗ YOMON: ${e.bad}\n  ✓ YAXSHI: ${e.good}\n  Sabab: ${e.why}`)
        .join('\n\n')}`,
  );
  return [...bullets, ...misollar].join('\n\n');
}
