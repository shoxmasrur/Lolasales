import type { LlmProvider } from '@/domain/entities/LlmModel';

/**
 * Xabar `meta` siga qaysi model yozganini qo'shadi.
 *
 * `uslubTamgasi` bilan bir xil qoida: tamg'a bir marta qo'yiladi va
 * ustidan yozilmaydi. Qaytish bo'lganda HAQIQATAN ishlatilgan model
 * yoziladi — aks holda suhbat yorlig'i ham, hisobot ham yolg'on
 * ko'rsatadi.
 *
 * `meta.model` kaliti band (u «xabarni model yozgan» degan belgi),
 * shuning uchun nomlar `llm` bilan boshlanadi.
 */
export function llmTamgasi(
  meta: Record<string, unknown> | undefined,
  tanlangan: { provider: LlmProvider | 'claude'; model: string },
  fallback: boolean,
): Record<string, unknown> {
  if (meta && meta.llmModel !== undefined) return meta;
  return {
    ...(meta ?? {}),
    llmProvider: tanlangan.provider,
    llmModel: tanlangan.model,
    ...(fallback ? { llmFallback: true } : {}),
  };
}
