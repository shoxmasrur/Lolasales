import { BOSQICH_YORLIGI, XARID_BOSQICHLARI, type XaridBosqichi } from '@/domain/entities/Purchase';

export interface VoronkaQatori {
  stage: XaridBosqichi;
  label: string;
  count: number;
  /** count / (rad_etdidan tashqari barcha bosqichlar yig'indisi), 0..1. */
  ulush: number;
}

/**
 * Sotuv voronkasi: XARID_BOSQICHLARI tartibida, "rad_etdi" oxirida.
 * Ulush rad etilganlarsiz asosga nisbatan hisoblanadi; asos 0 bo'lsa hamma ulush 0.
 */
export function voronka(counts: Record<XaridBosqichi, number>): VoronkaQatori[] {
  const asos = XARID_BOSQICHLARI.filter((s) => s !== 'rad_etdi').reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const tartib = [...XARID_BOSQICHLARI.filter((s) => s !== 'rad_etdi'), 'rad_etdi' as const];
  return tartib.map((stage) => {
    const count = counts[stage] ?? 0;
    return { stage, label: BOSQICH_YORLIGI[stage], count, ulush: asos > 0 ? count / asos : 0 };
  });
}
