import type {
  ExternalApartment,
  ExternalContract,
  ExternalPayment,
  ExternalPaymentEvent,
} from '@/domain/services/IContractGateway';
import { normalizePhone } from '@/shared/phone';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

const num = (v: unknown): number =>
  v === null || v === undefined || v === '' ? 0 : Number(v) || 0;
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v) || 0;
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** "2025-11-17 00:00:00" yoki "2025-11-16T19:00:00.000000Z" → "2025-11-17" */
function toIsoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m?.[1] ?? null;
}

function toDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `{uz, ru}` shaklida ham, oddiy satr sifatida ham kelishi mumkin. */
function localized(v: unknown): string | null {
  if (typeof v === 'string') return str(v);
  if (v && typeof v === 'object') {
    const o = v as Raw;
    return str(o.uz) ?? str(o.ru) ?? str(o.en);
  }
  return null;
}

const SCHEDULE_TYPES = new Set(['initial_payment', 'monthly']);
/** Hisoblagichlar uchun to'lov. Imlo CRM'niki (`electrocity`) — tuzatilmaydi. */
const METER_TYPE = 'for_electrocity';
const SCHEDULE_STATUSES = new Set(['paid', 'partially', 'waiting']);

function mapSchedule(rows: unknown): ExternalPayment[] {
  if (!Array.isArray(rows)) return [];
  const out: ExternalPayment[] = [];

  for (const r of rows as Raw[]) {
    const datePayment = toIsoDate(r?.date_payment);
    if (!datePayment || r?.id === undefined || r?.id === null) continue;

    const type = SCHEDULE_TYPES.has(r.type) ? r.type : r.type === METER_TYPE ? 'meter' : 'other';
    // Notanish statusni "waiting" deb qabul qilamiz: "to'langan" deb hisoblab
    // kechikkan to'lovni yashirib qo'yishdan ko'ra ortiqcha ko'rsatgan
    // xavfsizroq — raqam operator ko'rigidan o'tadi, aksi esa mijozni
    // umuman chetlab o'tardi.
    const status = SCHEDULE_STATUSES.has(r.status) ? r.status : 'waiting';

    out.push({
      externalId: Number(r.id),
      type,
      amount: num(r.amount),
      amountPaid: num(r.amount_paid),
      datePayment,
      datePaid: toIsoDate(r.date_paid),
      status,
    });
  }

  return out;
}

function mapHistory(rows: unknown): ExternalPaymentEvent[] {
  if (!Array.isArray(rows)) return [];
  const out: ExternalPaymentEvent[] = [];

  for (const r of rows as Raw[]) {
    const datePaid = toIsoDate(r?.date_paid);
    // `external_id` — tashqi havola; bo'lmasa ularning `id` si zaxira.
    // DIQQAT: bu kalit EMAS — bank ko'chirmasi kelganda almashadi.
    // Hodisa `uuid` bo'yicha farqlanadi, izohi `tolovKaliti` da.
    const externalId = str(r?.external_id) ?? (r?.id !== undefined ? String(r.id) : null);
    if (!datePaid || !externalId) continue;

    out.push({
      uuid: str(r?.uuid),
      externalId,
      amount: num(r.amount),
      datePaid,
      paymentType: str(r.payment_type),
      purpose: str(r.purpose),
      isProblematic: Boolean(r.is_problematic),
    });
  }

  return out;
}

function mapApartment(orderApartments: unknown): ExternalApartment | null {
  if (!Array.isArray(orderApartments) || !orderApartments.length) return null;

  const oa = orderApartments[0] as Raw;
  const a = (oa?.apartment ?? {}) as Raw;

  return {
    number: str(oa?.factual_apartment_number) ?? str(a?.number),
    floor: numOrNull(a?.floor),
    rooms: numOrNull(a?.rooms),
    entrance: str(a?.entrance),
    block: localized(a?.block?.name),
    area: numOrNull(oa?.area),
  };
}

/**
 * Xonadonni bitish muddati — CRM'ning "Детали договора" bo'limidagi sana.
 *
 * Birinchi to'lgan pog'ona olinadi: xonadon → blok → bino → obyekt
 * (Xurshid aka bergan tartib, 2026-09-11). Real ma'lumotda bo'shliqlar
 * oldindan aytib bo'lmaydigan joyda: fixture'da xonadonniki to'la,
 * binoniki esa `null`.
 *
 * BLOK DARAJASI hozirgi `order/show` javobida UMUMAN YO'Q — blokda faqat
 * `{id, name, floor}` bor. Tekshiruv ataylab qoldirilgan: CRM maydonni
 * qo'shsa o'zi ishlab ketadi. Uni "ishlamaydigan kod" deb olib tashlamang.
 *
 * Obyekt darajasida maydon nomi boshqa — `build_date`.
 */
export function bitishSanasi(orderApartment: unknown): string | null {
  const a = ((orderApartment as Raw | undefined)?.apartment ?? {}) as Raw;
  return (
    toIsoDate(a.completion_date) ??
    toIsoDate(a.block?.completion_date) ??
    toIsoDate(a.block?.building?.completion_date) ??
    toIsoDate(a.block?.building?.object?.build_date)
  );
}

/**
 * Turar-joy majmuasi nomi.
 *
 * `order/show` javobida yuqori darajadagi `object` maydoni YO'Q (u faqat
 * `order/index` da bor) — nom uyning bloki orqali topiladi.
 */
function objectName(d: Raw): string | null {
  const oa = Array.isArray(d.order_apartments) ? (d.order_apartments[0] as Raw) : undefined;
  return (
    localized(oa?.apartment?.block?.building?.object?.name) ??
    localized(oa?.apartment?.block?.building?.name) ??
    localized(d.object) ??
    null
  );
}

/** Obyekt tugunini (`order_apartments[0]...building.object`) qaytaradi. */
function objectNode(d: Raw): Raw | undefined {
  const oa = Array.isArray(d.order_apartments) ? (d.order_apartments[0] as Raw) : undefined;
  return oa?.apartment?.block?.building?.object as Raw | undefined;
}

/**
 * Obyekt manzili — talabnomada ishlatiladi. Nom kabi blok orqali topiladi,
 * chunki `order/show` da yuqori darajadagi `object` yo'q.
 */
function objectAddress(d: Raw): string | null {
  return localized(objectNode(d)?.address);
}

/**
 * Obyekt kompaniyasining INN'i — talabnoma rekvizitini tanlash kaliti.
 * Raqam ko'rinishida kelsa ham satrga o'giriladi.
 */
function companyInn(d: Raw): string | null {
  const inn = (objectNode(d)?.company_details as Raw | undefined)?.inn;
  if (typeof inn === 'number' && Number.isFinite(inn)) return String(inn);
  return str(inn);
}

/**
 * Oylik to'lov summasi — grafikdagi `monthly` qatorlarning eng ko'p
 * uchraydigan `amount` i.
 *
 * NEGA shunday: API'da alohida ishonchli maydon yo'q
 * (`frontend_data.months` odatda null), grafikda esa oxirgi oy yaxlitlanmagan
 * qoldiq, ba'zan esa bitta katta to'lov ham uchraydi — ularning birortasini
 * olish "oylik to'lov" sifatida noto'g'ri raqam berardi.
 */
function inferMonthlyPayment(schedule: readonly ExternalPayment[]): number | null {
  const counts = new Map<number, number>();
  for (const p of schedule) {
    if (p.type !== 'monthly' || p.amount <= 0) continue;
    counts.set(p.amount, (counts.get(p.amount) ?? 0) + 1);
  }

  let best: number | null = null;
  let bestCount = 0;
  for (const [amount, count] of counts) {
    if (count > bestCount) {
      best = amount;
      bestCount = count;
    }
  }
  return best;
}

function mapPhones(client: Raw | undefined): string[] {
  const raw = Array.isArray(client?.phones) ? client.phones : [];
  const out: string[] = [];
  for (const p of raw as Raw[]) {
    const normalized = normalizePhone(String(p?.phone ?? ''));
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function clientName(client: Raw | undefined): string {
  const a = client?.attributes as Raw | undefined;
  const parts = [a?.last_name?.lotin, a?.first_name?.lotin, a?.middle_name?.lotin]
    .map((v) => str(v))
    .filter((v): v is string => Boolean(v));
  return parts.join(' ') || str(client?.subject?.name) || '';
}

/**
 * Mijozning ismi — alohida, to'liq ism satriga qo'shilmagan holda.
 *
 * `clientName` uchala qismni bitta satrga qo'shadi va undan ismni qaytadan
 * ajratib olish taxminga aylanadi. CRM ismni alohida bergani uchun uni
 * yo'qotmasdan uzatamiz.
 *
 * `subject.name` zaxira sifatida ISHLATILMAYDI: u to'liq ism ("Testov
 * Testoy") bo'lib, undan ismni ajratish yana o'sha taxmin bo'lardi.
 */
function clientFirstName(client: Raw | undefined): string | null {
  return str((client?.attributes as Raw | undefined)?.first_name?.lotin);
}

/**
 * `order/show` javobini bizning turga o'giradi.
 *
 * Javob kutilgan shaklda bo'lmasa `null` qaytaradi — chaqiruvchi buni
 * `sync_error` ga yozadi. Yarim to'ldirilgan obyekt qaytarish noto'g'ri
 * raqamning bazaga tushishiga olib kelardi.
 */
export function mapOrderShow(raw: unknown): ExternalContract | null {
  const d = (raw as Raw)?.data as Raw | undefined;
  if (!d || typeof d !== 'object') return null;

  const orderId = Number(d.id);
  const contractNo = str(d.contract);
  if (!Number.isFinite(orderId) || orderId <= 0 || !contractNo) return null;

  const schedule = mapSchedule(d.payments);
  const oa = Array.isArray(d.order_apartments) ? (d.order_apartments[0] as Raw) : undefined;

  // `total_paid` ham faqat `order/index` da bor. Grafikdagi `amount_paid`
  // yig'indisi bilan bir xil chiqadi (tekshirilgan), shuning uchun shundan
  // hisoblanadi — qo'shimcha so'rov kerak emas.
  const totalPaid = schedule.reduce((sum, p) => sum + p.amountPaid, 0);

  return {
    orderId,
    contractNo,
    clientName: clientName(d.client),
    clientFirstName: clientFirstName(d.client),
    phones: mapPhones(d.client),
    objectName: objectName(d),
    objectAddress: objectAddress(d),
    companyInn: companyInn(d),
    apartment: mapApartment(d.order_apartments),
    completionDate: bitishSanasi(oa),
    status: str(d.status?.type),
    virtualStatus: str(d.virtual_status?.key),
    contractDate: toDate(d.contract_date),
    months: numOrNull(d.months_count) ?? numOrNull(oa?.months?.sold),
    transactionPrice: numOrNull(d.transaction_price),
    initialPayment: numOrNull(d.initial_payment),
    monthlyPayment: inferMonthlyPayment(schedule),
    totalPaid,
    // ICHKI: bu umumiy qoldiq, kechikkan to'lov EMAS.
    remainingTotal: numOrNull(d.total_debt),
    schedule,
    history: mapHistory(d.payment_histories),
  };
}
