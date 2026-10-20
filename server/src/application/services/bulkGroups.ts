/**
 * Ommaviy suhbat boshlashda mijozlarni akkaunt bo'yicha guruhlarga bo'ladi.
 *
 * Har guruh KEYINCHALIK mustaqil sur'at oqimida ishlanadi. Telegramning
 * `PEER_FLOOD` va kunlik cheklovlari har akkauntga ALOHIDA hisoblanadi,
 * shuning uchun akkauntlarni bitta navbatda ushlab turishning himoya
 * qiymati yo'q — u faqat ishni cho'zadi.
 *
 * NEGA SOF FUNKSIYA: takrorlangan mijoz — bu tizimning eng qimmat xatosi
 * (bir odamga ikki marta yozish). Buni bazasiz, Telegramsiz, bir zumda
 * ishlaydigan sinov bilan qo'riqlash kerak.
 */
export interface AccountGroup {
  /**
   * `null` — "qoldiq" guruhi: rejaga kirmagan mijozlar.
   *
   * Bu guruh IKKI xil mijozdan iborat va chaqiruvchi ularni ajratadi:
   *   • baza so'rovining o'zidan chiqib ketganlar (chiquvchi xabari bor,
   *     bog'lanish taqiqlangan, raqami yo'q) — ular odatdagidek ishlanadi
   *     va O'Z aniq sababini oladi;
   *   • bog'lanish mumkin, lekin operator `perAccount` bilan qo'lda
   *     chegaralagani uchun tushmaganlar — ularga xabar MAJBURAN
   *     yuborilmaydi.
   *
   * Ikkalasi ham ro'yxatdan TUSHIB QOLMASLIGI kerak: o'tkazib yuborish
   * sabablari va tafsilotlari operator uchun tashxis vositasi.
   */
  readonly accountId: string | null;
  readonly clientIds: string[];
}

/**
 * `assignments` — `BulkStartPlanner.plan()` qaytargan xarita (clientId → accountId).
 *
 * Guruhlar tartibi akkauntning BIRINCHI uchrash tartibi bo'yicha, qoldiq
 * esa doim oxirida. Tasodif ham, vaqtga bog'liqlik ham yo'q — operator
 * oldindan ko'rish oynasida ko'rgan reja bilan haqiqiy ish bir xil
 * bo'lishi shart.
 */
export function groupByAccount(
  clientIds: string[],
  assignments: ReadonlyMap<string, string>,
): AccountGroup[] {
  const byAccount = new Map<string, string[]>();
  const qoldiq: string[] = [];

  for (const clientId of clientIds) {
    const accountId = assignments.get(clientId);
    if (accountId === undefined) {
      qoldiq.push(clientId);
      continue;
    }
    const mavjud = byAccount.get(accountId);
    if (mavjud) mavjud.push(clientId);
    else byAccount.set(accountId, [clientId]);
  }

  const guruhlar: AccountGroup[] = [...byAccount].map(([accountId, ids]) => ({
    accountId,
    clientIds: ids,
  }));

  if (qoldiq.length) guruhlar.push({ accountId: null, clientIds: qoldiq });
  return guruhlar;
}
