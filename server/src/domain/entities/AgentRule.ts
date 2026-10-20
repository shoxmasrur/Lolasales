import type { StyleVersion } from '@/domain/entities/UslubVersiyasi';

export type RuleSectionKind = 'bullets' | 'examples';

export interface AgentRuleSection {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly description: string | null;
  readonly kind: RuleSectionKind;
  readonly sortOrder: number;
  /** `null` — bo'lim ikkala uslubga ham tushadi. */
  readonly styleVersion: StyleVersion | null;
  readonly rules: AgentRule[];
}

export interface AgentRule {
  readonly id: string;
  readonly sectionId: string;
  /** `bullets` bo'limlari uchun — qoidaning o'zi. */
  readonly body: string | null;
  /** `examples` bo'limlari uchun. */
  readonly situation: string | null;
  readonly badExample: string | null;
  readonly goodExample: string | null;
  readonly why: string | null;
  readonly isEnabled: boolean;
  readonly sortOrder: number;
  readonly updatedAt: Date;
}

export interface NewAgentRule {
  sectionId: string;
  body?: string | null;
  situation?: string | null;
  badExample?: string | null;
  goodExample?: string | null;
  why?: string | null;
  sortOrder?: number;
  updatedBy?: string | null;
}

/** Bo'lim tartibi — promptdagi ketma-ketlikni belgilaydi. */
export const SECTION_KEYS = [
  'style',
  'anti_repetition',
  'promise_acceptance',
  'after_agreement',
  'contract_facts',
  'tactics',
  'client_types',
  'media',
  'prohibitions',
  'examples',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];
