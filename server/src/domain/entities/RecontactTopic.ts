/**
 * Qayta aloqa uchun tayyor mavzu (2026-09-16).
 *
 * Operator "Qayta aloqa" ro'yxatidan mijozlarni tanlaydi va mavzu
 * beradi — xabarni agent o'zi tuzadi. `instruction` mijozga KETMAYDI:
 * u agentga topshiriq, chatga `note` bo'lib yoziladi.
 *
 * Bu modul bazaga tegmaydi — tekshiruvlar sof funksiya, bazasiz test
 * qilinadi.
 */
export interface RecontactTopic {
  readonly id: string;
  readonly title: string;
  readonly instruction: string;
  readonly sortOrder: number;
  readonly isEnabled: boolean;
}

/** Sarlavha ro'yxatda bir qatorga sig'ishi kerak. */
export const MAVZU_SARLAVHA_MAX = 120;

export interface RecontactTopicFields {
  readonly title?: string;
  readonly instruction?: string;
}

/**
 * Sarlavha va topshiriq matnini tekshiradi. Xato bo'lsa o'zbekcha matn,
 * aks holda `null`. Faqat BERILGAN maydonlar tekshiriladi — tahrirda
 * (PATCH) yuborilmagan maydon o'zgarmaydi.
 *
 * NEGA `instructionMax` PARAMETR: chegara `TOPSHIRIQ_MAX`
 * (`InstructAgentUseCase`) bilan AYNAN bir xil bo'lishi shart — mavzu
 * yuborilganda o'sha use case uni qayta tekshiradi. Domen qatlami
 * application'dan import qilmaydi, shuning uchun qiymatni chaqiruvchi
 * beradi. Uzunlik `trim()` dan keyin sanaladi — use case ham shunday.
 */
export function mavzuTekshiruvi(fields: RecontactTopicFields, instructionMax: number): string | null {
  if (fields.title !== undefined) {
    const title = fields.title.trim();
    if (!title) return 'Mavzu nomi bo\'sh bo\'lmasin';
    if (title.length > MAVZU_SARLAVHA_MAX) {
      return `Mavzu nomi ${MAVZU_SARLAVHA_MAX} belgidan oshmasin`;
    }
  }
  if (fields.instruction !== undefined) {
    const instruction = fields.instruction.trim();
    if (!instruction) return 'Topshiriq bo\'sh — agent nima haqida yozishini yozing';
    if (instruction.length > instructionMax) {
      return `Topshiriq ${instructionMax} belgidan oshmasin — mavzuni qisqa yozing`;
    }
  }
  return null;
}
