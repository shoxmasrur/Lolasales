/**
 * Panel filtridagi tayyor davrlar.
 *
 * Mantiq SERVERDA: interfeysda hisoblansa, u yerda sinab bo'lmasdi va
 * oy chegarasidagi xato (masalan 31-martda "o'tgan oy") sezilmay qolardi.
 * Interfeys faqat nomni yuboradi, javobda esa aniq sanalar qaytadi.
 *
 * Sana UTC bo'yicha kesiladi — `contract_payment_events.date_paid` vaqtsiz
 * `DATE` ustuni va u ham shunday taqqoslanadi.
 */
export type PresetKey =
  | 'today'
  | 'this_month'
  | 'last_month'
  | 'quarter'
  | 'half_year'
  | 'year'
  | 'custom';

export const PRESET_KEYS: readonly PresetKey[] = [
  'today', 'this_month', 'last_month', 'quarter', 'half_year', 'year', 'custom',
];

const iso = (d: Date): string => d.toISOString().slice(0, 10);

export function presetRange(key: PresetKey, today: Date): { from: string; to: string } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const to = iso(today);

  switch (key) {
    case 'today':
      return { from: to, to };
    case 'this_month':
      return { from: iso(new Date(Date.UTC(y, m, 1))), to };
    case 'last_month': {
      // O'tgan oy TO'LIQ olinadi — 1-sanadan oxirgi kunigacha. "Bugungacha"
      // deb kesilsa, allaqachon tugagan oy uchun chala raqam chiqardi.
      //
      // Oxirgi kun `Date.UTC(y, m, 0)` orqali: joriy oyning "0-kuni" —
      // oldingi oyning oxirgi kuni. Kabisa yili ham o'zi hisoblanadi.
      return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
    }
    // Oydan ayirishda doim OY BOSHI olinadi. Aks holda 31-martdan bir oy
    // ayirilsa 3-mart chiqib ketardi (fevralda 31-kun yo'q).
    case 'quarter':
      return { from: iso(new Date(Date.UTC(y, m - 2, 1))), to };
    case 'half_year':
      return { from: iso(new Date(Date.UTC(y, m - 5, 1))), to };
    case 'year':
      return { from: iso(new Date(Date.UTC(y, 0, 1))), to };
    case 'custom':
      // O'z oralig'ida sanani foydalanuvchi beradi; bu — boshlang'ich qiymat.
      return { from: iso(new Date(Date.UTC(y, m, 1))), to };
  }
}
