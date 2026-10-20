/**
 * Mijozga bog'lanmagan, tuzilgan (JSON sxemali) model chaqiruvi porti.
 *
 * NEGA ALOHIDA: `IAgentEngine` har bir kirishda mijoz/xarid kontekstini
 * talab qiladi. Bunday kontekst bo'lmagan vazifalarda (masalan izoh
 * tasnifi) u kerak emas — shuning uchun faqat system/user matn va sxema beriladi.
 */
export interface TuzilganSorov {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ITuzilganLlm {
  /** Model tuzilgan javobi (shakli tekshirilmagan); topilmasa `null`. */
  generate(sorov: TuzilganSorov): Promise<unknown>;
}
