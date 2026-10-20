import type { CrmKompaniya } from '@/domain/services/rekvizit';

/** CRM'dagi kompaniyalar (obyekt egalari) va ularning bank hisoblari. */
export interface IKompaniyaGateway {
  listCompanies(): Promise<CrmKompaniya[]>;
}
