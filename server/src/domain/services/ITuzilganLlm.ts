/**
 * Mijozga bog'lanmagan, tuzilgan (JSON sxemali) model chaqiruvi porti.
 *
 * NEGA ALOHIDA: `IAgentEngine` har bir kirishda mijoz/shartnoma kontekstini
 * talab qiladi. Noma'lum odam haqida bunday kontekst YO'Q va bo'lmasligi ham
 * kerak — shuning uchun faqat system/user matn va sxema beriladi.
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
