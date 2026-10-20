/**
 * Talabnoma muddati ichidagi "proaktiv sukut".
 *
 * NEGA: rasmiy talabnoma mijozga muddat beradi (`muddat_sanasi`). Shu
 * muddat ichida agentning o'zi boshlagan eslatmalari (sukut, va'da kuni,
 * oylik eslatma, ommaviy qayta aloqa, suhbat boshlash) talabnomaning
 * jiddiyligini buzadi va bosim bo'lib ko'rinadi. Mijoz o'zi yozsa —
 * javob beriladi; bu tekshiruv faqat agent tashabbusidagi xabarlarga.
 */
export interface ITalabnomaSukuti {
  /** `true` — mijozda muddati (≥ `todayIso`) tugamagan yuborilgan talabnoma bor. */
  sukutdami(clientId: string, todayIso: string): Promise<boolean>;
}
