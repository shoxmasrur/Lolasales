import type { ITalabnomaRepository } from '@/domain/repositories/ITalabnomaRepository';
import type { ITalabnomaSukuti } from '@/domain/services/ITalabnomaSukuti';

/** Sukut = mijozda `yuborildi` holatidagi, muddati tugamagan talabnoma bor. */
export class TalabnomaSukuti implements ITalabnomaSukuti {
  constructor(private readonly talabnomalar: Pick<ITalabnomaRepository, 'faolMuddat'>) {}

  async sukutdami(clientId: string, todayIso: string): Promise<boolean> {
    return (await this.talabnomalar.faolMuddat(clientId, todayIso)) !== null;
  }
}
