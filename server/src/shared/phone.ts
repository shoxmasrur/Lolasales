/**
 * O'zbekiston raqamlarini E.164 ga keltirish.
 * Kirish variantlari: 901234567, 901234567, +998 90 123-45-67, 998901234567,
 * 8 90 123 45 67, (90) 123-45-67 va h.k.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');
  if (!digits) return null;

  // 998XXXXXXXXX (12 raqam)
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  // XXXXXXXXX (9 raqam) — operator kodi bilan
  if (digits.length === 9) return `+998${digits}`;
  // 0XXXXXXXXX yoki 8XXXXXXXXX (eski format)
  if (digits.length === 10 && (digits.startsWith('0') || digits.startsWith('8'))) {
    return `+998${digits.slice(1)}`;
  }
  // Boshqa davlat raqami — 10..15 oralig'ida bo'lsa qabul qilamiz
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;

  return null;
}

export function isValidPhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw) !== null;
}

/** Bir katakda bir nechta raqam bo'lishi mumkin: "901234567 / 935556677" */
export function extractPhones(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parts = String(raw).split(/[,;/|\n]+/);
  const out: string[] = [];
  for (const p of parts) {
    const n = normalizePhone(p);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Ko'rsatish uchun: +998 90 123 45 67 */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}
