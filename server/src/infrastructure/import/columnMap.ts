/**
 * "Xon Saroy Group" debitor eksportining ustun sarlavhalari.
 * Sarlavhalar rus tilida, ba'zilari ikki nuqta bilan tugaydi va
 * takrorlanadi ("Категория" ikki marta) — shuning uchun birinchi moslik olinadi.
 */

export type FieldKey =
  | 'externalId'
  | 'status'
  | 'contractNo'
  | 'objectName'
  | 'fullName'
  | 'category'
  | 'totalPrice'
  | 'firstPayment'
  | 'monthlyPayment'
  | 'nextPaymentDate'
  | 'daysOverdue'
  | 'debtFirst'
  | 'debtMonthly'
  | 'debtTotal'
  | 'contractDate'
  | 'months'
  | 'remainingTotal'
  | 'plannedMonthlyTotal'
  | 'plannedTotal'
  | 'warningCount'
  | 'warningType'
  | 'warningMethod'
  | 'warningManager'
  | 'warningComment'
  | 'warningMessage'
  | 'warningCreatedAt'
  | 'virtualStatus'
  | 'phone';

/** Sarlavhani solishtirish uchun normallashtirish. */
export function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.:;,()«»"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Har bir maydon uchun mumkin bo'lgan sarlavhalar (normallashtirilgan). */
const ALIASES: Record<FieldKey, string[]> = {
  externalId: ['id', 'ид', 'код'],
  status: ['статус'],
  contractNo: ['№ договора', 'номер договора', 'договор', 'shartnoma', 'shartnoma raqami'],
  objectName: ['объект', 'obyekt', 'obekt', 'жк'],
  fullName: ['клиент', 'мижоз', 'mijoz', 'фио', 'заказчик', 'инвестор', 'покупатель'],
  category: ['категория', 'kategoriya'],
  totalPrice: ['стоимость', 'сумма договора', 'narx'],
  firstPayment: ['1-взнос', '1 взнос', 'первый взнос', 'первоначальный взнос'],
  monthlyPayment: ['след оплата', 'следующая оплата', 'ежемесячный платеж', 'oylik tolov'],
  nextPaymentDate: ['день оплаты', 'дата оплаты', 'дата платежа'],
  daysOverdue: ['дни просрочки', 'просрочка', 'kechikish'],
  debtFirst: ['долг 1 взнос'],
  debtMonthly: ['долг мес'],
  // 'qarz' shu yerda ATAYLAB qoladi: bu mijozga ko'rsatiladigan matn emas,
  // balki KELADIGAN Excel faylining ustun sarlavhasi. Uni "to'lov" ga
  // almashtirsak, sarlavhasida "qarz" yozilgan fayllar import bo'lmay qoladi.
  debtTotal: ['долг общ', 'общий долг', 'задолженность', 'qarz'],
  contractDate: ['дата договора', 'shartnoma sanasi'],
  months: ['месяцы', 'срок', 'oylar'],
  remainingTotal: ['всего осталось', 'осталось'],
  plannedMonthlyTotal: ['оплата мес'],
  plannedTotal: ['общая оплата'],
  warningCount: ['количества предупреждения', 'количество предупреждений'],
  warningType: ['тип предупреждения'],
  warningMethod: ['метод предупреждения'],
  warningManager: ['менежер предупреждения', 'менеджер предупреждения'],
  warningComment: ['комментарий предупреждения'],
  warningMessage: ['сообщение предупреждения'],
  warningCreatedAt: ['дата создания предупреждения'],
  virtualStatus: ['виртуальный статус'],
  phone: [
    'телефон', 'тел', 'номер телефона', 'номер', 'контакт', 'контактный телефон',
    'phone', 'telefon', 'telefon raqami', 'raqam', 'mobil', 'моб', 'сотовый',
  ],
};

export type ColumnIndex = Partial<Record<FieldKey, number>>;

/**
 * Sarlavha qatoridan ustun indekslarini aniqlaydi (1-based, ExcelJS uslubi).
 * Bir maydonga bir nechta ustun mos kelsa — birinchisi olinadi
 * (`1-взнос` H va R ustunlarida takrorlanadi).
 */
export function buildColumnIndex(headerCells: unknown[]): ColumnIndex {
  const normalized = headerCells.map(normalizeHeader);
  const index: ColumnIndex = {};
  const phoneColumns: number[] = [];

  for (const [field, aliases] of Object.entries(ALIASES) as Array<[FieldKey, string[]]>) {
    for (let i = 0; i < normalized.length; i += 1) {
      const header = normalized[i];
      if (!header) continue;
      const hit = aliases.some((alias) => header === alias || header.startsWith(`${alias} `));
      if (!hit) continue;
      if (field === 'phone') {
        phoneColumns.push(i + 1);
        continue;
      }
      if (index[field] === undefined) index[field] = i + 1;
    }
  }

  if (phoneColumns.length) index.phone = phoneColumns[0];
  return index;
}

/**
 * Telefon ustunlari (uy/mobil/qo'shimcha bo'lishi mumkin).
 *
 * DIQQAT — BIR XIL NOMLI TAKRORIY USTUN OLINMAYDI.
 *
 * Real eksportda ("debitor_prod_test.xlsx") "Телефон" nomli IKKITA ustun
 * bor edi: 4-ustun — mijozning raqami, 32-ustun — fayl oxirida, ogohlantirish
 * (предупреждение) bloki ortida turgan butunlay boshqa raqam. Parser ikkalasini
 * ham olib, begona raqamni mijozning "qo'shimcha raqami" qilib yozib qo'ygan
 * edi. Bunday raqamga xabar yuborish — begona odamga to'lov haqida yozish
 * demakdir.
 *
 * Shuning uchun qoida: bir xil sarlavha ikkinchi marta uchrasa — TASHLAB
 * YUBORILADI. Haqiqiy qo'shimcha raqam ustuni odatda farqlanadigan nomga ega
 * bo'ladi ("Телефон 2", "Доп. телефон", "Qo'shimcha telefon") — bunday
 * ustunlar oldingidek qabul qilinaveradi.
 */
export function findPhoneColumns(headerCells: unknown[]): number[] {
  const normalized = headerCells.map(normalizeHeader);
  const out: number[] = [];
  const seen = new Set<string>();

  normalized.forEach((header, i) => {
    if (!header) return;
    if (!ALIASES.phone.some((alias) => header === alias || header.startsWith(`${alias} `))) return;

    if (seen.has(header)) return;
    seen.add(header);
    out.push(i + 1);
  });

  return out;
}

/** Sarlavha qatorini topish: eng ko'p tanish ustun nomi bor qator. */
export function scoreHeaderRow(cells: unknown[]): number {
  const normalized = cells.map(normalizeHeader).filter(Boolean);
  let score = 0;
  for (const aliases of Object.values(ALIASES)) {
    if (normalized.some((h) => aliases.some((a) => h === a || h.startsWith(`${a} `)))) score += 1;
  }
  return score;
}
