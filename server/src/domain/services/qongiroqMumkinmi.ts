/**
 * Ovozli agent shu mijozga hozir qo'ng'iroq qilsa bo'ladimi.
 *
 * Bu TAVSIYA: Debitor qo'ng'iroqni to'smaydi, qaror platformada. Shartlar
 * Telegramda birinchi xabar yozish darvozasi bilan bir xil ma'noda
 * (`StartConversationUseCase`): bir xil mijozga bir kanal "yozma" deb,
 * ikkinchisi qo'ng'iroq qilsa — mijoz nazarida bu bitta kompaniya.
 */
export interface QongiroqShartlari {
  readonly boglanmaslik: boolean;
  readonly killSwitch: boolean;
  readonly yoziladiganShartnomaBor: boolean;
  /** Yoziladigan shartnomalar bo'yicha boshlang'ich + oylik (`kechikkanSumma`). */
  readonly kechikkanJami: number;
  /** `RuntimeSettings.minDebt`; 0 — chegara yo'q. */
  readonly minDebt: number;
  /** CRM yangilanmadi va bazadagi ma'lumot eskirgan — shubhada qo'ng'iroq qilmaymiz. */
  readonly eskirganMalumot: boolean;
  /** Eng yaqin ochiq va'da kuni, YYYY-MM-DD. */
  readonly ochiqVadaKuni: string | null;
  /**
   * Telegram suhbati ataylab jim qilingan: operator qo'lida (chek tekshiruvi,
   * CRM xatosi), yopilgan yoki agent o'chirilgan. `!canAgentNudge(suhbat)`;
   * suhbat bo'lmasa false. Aks holda ovozli agent allaqachon to'langan
   * puldan to'lov talab qilib qo'ng'iroq qilishi mumkin.
   */
  readonly telegramToxtatgan: boolean;
  readonly bugun: string;
}

const sanaUz = (iso: string): string => iso.split('-').reverse().join('.');

export function qongiroqMumkinmi(s: QongiroqShartlari): { mumkin: boolean; sabablar: string[] } {
  const sabablar: string[] = [];
  if (s.boglanmaslik) sabablar.push('Mijozda "bog\'lanmaslik" belgisi bor');
  if (!s.yoziladiganShartnomaBor) {
    sabablar.push('Yoziladigan holatdagi (Сотилди, К оплате, Проц. отказ) shartnomasi yo\'q');
  }
  if (s.kechikkanJami <= 0) sabablar.push('Kechikkan to\'lov yo\'q');
  else if (s.minDebt > 0 && s.kechikkanJami <= s.minDebt) {
    sabablar.push('Kechikkan to\'lov minimal chegaradan kichik');
  }
  if (s.eskirganMalumot) {
    sabablar.push('To\'lov ma\'lumotini CRM\'dan yangilab bo\'lmadi va mavjudi eskirgan');
  }
  if (s.ochiqVadaKuni && s.ochiqVadaKuni >= s.bugun) {
    sabablar.push(`Ochiq va'da bor: ${sanaUz(s.ochiqVadaKuni)} gacha kutiladi`);
  }
  if (s.telegramToxtatgan) {
    sabablar.push('Suhbat operator qo\'lida yoki to\'xtatilgan — avtomatik aloqa qilinmaydi');
  }
  if (s.killSwitch) sabablar.push('KILL_SWITCH yoqilgan — avtomatik aloqa to\'xtatilgan');
  return { mumkin: sabablar.length === 0, sabablar };
}
