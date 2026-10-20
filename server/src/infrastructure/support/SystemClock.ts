import type { IClock } from '@/domain/services/support';
import { zonedParts } from '@/shared/datetime';
import { config } from '@/shared/config';

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }

  todayIso(): string {
    return zonedParts(new Date(), config.TIMEZONE).isoDate;
  }
}
