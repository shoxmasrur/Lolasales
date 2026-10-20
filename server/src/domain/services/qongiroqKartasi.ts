import type { PhoneCall, QongiroqNatijasi } from '@/domain/entities/PhoneCall';
import { normalizePhone } from '@/shared/phone';

/**
 * Mijoz kartasidagi "Qo'ng'iroqlar" bo'limi uchun (spec 6-bo'lim).
 *
 * Transkript shu yerda BOR — bu xodimlar paneli. Tashqi platformaga
 * qaytadigan `qongiroq_oldi` javobida u yo'q (QongiroqBrifi).
 */
export interface KartaQongiroq {
  readonly id: string;
  readonly sana: string;
  readonly agentKaliti: string;
  readonly agentIsmi: string;
  readonly telefon: string | null;
  readonly davomiylikSoniya: number;
  readonly natija: QongiroqNatijasi;
  readonly xulosa: string | null;
  readonly vada: { readonly kun: string; readonly summa: number | null } | null;
  readonly transkript: string | null;
}

export function kartaQongiroqlari(calls: readonly PhoneCall[]): KartaQongiroq[] {
  return calls.map((c) => ({
    id: c.id,
    sana: c.startedAt.toISOString(),
    agentKaliti: c.agentKey,
    agentIsmi: c.agentName,
    telefon: c.phone,
    davomiylikSoniya: c.durationSec,
    natija: c.outcome,
    xulosa: c.summary,
    vada: c.promiseDate ? { kun: c.promiseDate, summa: c.promiseAmount } : null,
    transkript: c.transcript,
  }));
}

/**
 * Ovozli agent "raqam noto'g'ri" degan raqamlar — normallashtirilgan,
 * takrorsiz. Har bir raqam uchun faqat ENG YANGI qo'ng'iroq natijasi
 * hisobga olinadi: keyingi qo'ng'iroq muvaffaqiyatli bo'lsa, belgi chiqmaydi.
 * Kirish qo'ng'iroqlari eng yangisi birinchi tartibda bo'lishi shart
 * (`listRecentForClient` shunday qaytaradi). Faqat BELGI uchun: raqam
 * avtomatik uzilmaydi, qarorni operator qiladi ("bu raqam mijozniki emas" tugmasi).
 */
export function notogriRaqamlar(calls: readonly PhoneCall[]): string[] {
  const korilgan = new Set<string>();
  const natija: string[] = [];
  for (const c of calls) {
    if (!c.phone) continue;
    const n = normalizePhone(c.phone);
    if (!n || korilgan.has(n)) continue;
    korilgan.add(n);
    if (c.outcome === 'raqam_notogri') natija.push(n);
  }
  return natija;
}
