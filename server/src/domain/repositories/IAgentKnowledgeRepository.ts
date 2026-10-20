import type { AgentRule, AgentRuleSection, NewAgentRule } from '@/domain/entities/AgentRule';
import type {
  AgentLesson,
  ClientProfile,
  ClientProfilePatch,
  LessonStatus,
  NewAgentLesson,
} from '@/domain/entities/AgentMemory';

export interface IAgentRuleRepository {
  /** Barcha bo'limlar qoidalari bilan — prompt shu asosda quriladi. */
  listSections(): Promise<AgentRuleSection[]>;
  countRules(): Promise<number>;

  createSection(data: {
    key: string;
    title: string;
    description?: string | null;
    kind: 'bullets' | 'examples';
    sortOrder: number;
  }): Promise<AgentRuleSection>;

  addRule(data: NewAgentRule): Promise<AgentRule>;
  updateRule(
    id: string,
    patch: Partial<Omit<NewAgentRule, 'sectionId'>> & { isEnabled?: boolean },
  ): Promise<AgentRule>;
  removeRule(id: string): Promise<void>;
  /** Bo'limdagi barcha qoidalarni o'chirish — standart qiymatlarga qaytarish uchun. */
  clearSection(sectionKey: string): Promise<void>;
}

export interface ILessonRepository {
  list(status?: LessonStatus): Promise<AgentLesson[]>;
  /** Promptga tushadigan tasdiqlangan saboqlar. */
  listApproved(limit: number): Promise<AgentLesson[]>;
  /** Bir xil saboq qayta kelsa — yangi yozuv emas, hisoblagich oshadi. */
  recordProposal(data: NewAgentLesson): Promise<AgentLesson>;
  setStatus(id: string, status: LessonStatus, reviewedBy: string | null): Promise<AgentLesson>;
  remove(id: string): Promise<void>;
}

export interface IClientProfileRepository {
  find(clientId: string): Promise<ClientProfile | null>;
  upsert(clientId: string, patch: ClientProfilePatch): Promise<ClientProfile>;
}
