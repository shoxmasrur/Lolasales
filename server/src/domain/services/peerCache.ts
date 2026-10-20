/**
 * Keshlangan Telegram peer'i shu akkaunt uchun ishlatilsa bo'ladimi.
 *
 * NEGA UMUMAN KERAK: MTProto'da `access_hash` mijozga emas, (akkaunt, peer)
 * JUFTLIGIGA bog'langan. A akkaunti topgan hash bilan B akkauntidan
 * yozmoqchi bo'lsak Telegram `PEER_ID_INVALID` qaytaradi va suhbat
 * boshlanmaydi.
 *
 * Mijozning akkaunti o'zgarishi mumkin: ommaviy suhbat boshlashda operator
 * akkaunt tanlasa, mijozlar qayta taqsimlanadi (`BulkConversationStart`).
 * O'shanda eski hash yaroqsiz bo'lib qoladi va mijozni YANGI akkaunt bilan
 * qaytadan qidirish kerak.
 *
 * `telegramHashAccountId` NULL bo'lsa — hash'ni kim topgani noma'lum
 * (051 migratsiyasidan oldingi qatorlar). Bunday hash'ga ishonmaymiz:
 * qayta qidirish bitta ortiqcha so'rov, ishonish esa yuborilmagan xabar.
 *
 * Tip-qo'riqchisi: rost qaytganda `telegramUserId` ning `null` emasligi
 * kompilyatorga ham ma'lum bo'ladi, ya'ni chaqiruvchi joyda qo'shimcha
 * tekshiruv yozish shart emas.
 */
export function cachedPeerUsable<
  T extends { telegramUserId: string | null; telegramHashAccountId: string | null },
>(client: T, accountId: string): client is T & { telegramUserId: string } {
  if (!client.telegramUserId) return false;
  if (!client.telegramHashAccountId) return false;
  return client.telegramHashAccountId === accountId;
}
