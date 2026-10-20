import type { Contract, ContractUpsert } from '@/domain/entities/Contract';
import type { Page, Pagination } from '@/domain/repositories/types';

export interface ContractQuery extends Pagination {
  clientId?: string;
  search?: string;
  objectName?: string;
  minDebt?: number;
  minDaysOverdue?: number;
  sort?: 'debt' | 'overdue' | 'recent';
}

export interface IContractRepository {
  findById(id: string): Promise<Contract | null>;
  findByContractNo(contractNo: string): Promise<Contract | null>;
  /** `includeDeleted` faqat o'chirilgan mijoz kartasi uchun. */
  findByClientId(clientId: string, options?: { includeDeleted?: boolean }): Promise<Contract[]>;
  search(query: ContractQuery): Promise<Page<Contract>>;
  /** contract_no bo'yicha upsert — import qayta-qayta yurgizilishi mumkin. */
  upsert(data: ContractUpsert): Promise<{ contract: Contract; created: boolean }>;
  /** Mijozning eng katta kechikishli shartnomasi — agent shu bo'yicha gaplashadi. */
  findPrimaryForClient(clientId: string): Promise<Contract | null>;
  /** Tirik shartnomalardagi obyekt nomlari (qirqilgan, takrorsiz, tartiblangan). */
  obyektNomlari(): Promise<string[]>;
}
