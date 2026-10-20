import type { XaridBosqichi } from '@/domain/entities/Purchase';

/** Eslatma yuboriladigan bosqichlar: mijoz qiziqqan yoki karta olgan, lekin jim. */
const ESLATMA_BOSQICHLARI: readonly XaridBosqichi[] = ['qiziqdi', 'karta_yuborildi'];

export interface EslatmaHolati {
  stage: XaridBosqichi;
  remindedStages: XaridBosqichi[];
  lastOutboundAt: Date | null;
  lastInboundAt: Date | null;
}

/**
 * Bir bosqichga BITTA eslatma: mijoz oxirgi chiquvchi xabardan beri jim,
 * `soat` o'tgan va shu bosqich uchun hali eslatma yuborilmagan.
 */
export function eslatmaKerakmi(i: EslatmaHolati, now: Date, soat: number): boolean {
  if (!ESLATMA_BOSQICHLARI.includes(i.stage)) return false;
  if (i.remindedStages.includes(i.stage)) return false;
  if (!i.lastOutboundAt) return false;
  if (i.lastInboundAt && i.lastInboundAt >= i.lastOutboundAt) return false;
  return now.getTime() - i.lastOutboundAt.getTime() >= soat * 3600_000;
}
