import type { AgentRuleSection } from '@/domain/entities/AgentRule';
import type { AgentLesson, ClientProfile } from '@/domain/entities/AgentMemory';
import { CLIENT_TYPE_LABEL } from '@/domain/entities/AgentMemory';
import type { StyleVersion } from '@/domain/entities/UslubVersiyasi';
import type {
  IAgentRuleRepository,
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import { childLogger } from '@/shared/logger';

const log = childLogger('prompt');
const CACHE_TTL_MS = 10_000;
const MAX_LESSONS = 25;

/** Promptga tushadigan "jonli" qism — bazadan yig'iladi. */
export interface AgentKnowledge {
  readonly sections: AgentRuleSection[];
  readonly lessons: AgentLesson[];
}

/**
 * Agent qoidalari va xotirasini bazadan yig'adi.
 *
 * Kesh qisqa: operator qoidani o'zgartirsa, 10 soniyada kuchga kiradi —
 * lekin har bir xabarda o'nlab so'rov yuborilmaydi.
 *
 * Kesh versiya bo'yicha kalitlanadi (`Map<StyleVersion, ...>`): v1 va v2
 * bo'limlari boshqa-boshqa, aralashib ketsa akkaunt boshqa uslubda
 * yozib yuboradi.
 */
export class PromptComposer {
  private cache = new Map<StyleVersion, { value: AgentKnowledge; expiresAt: number }>();

  constructor(
    private readonly rules: IAgentRuleRepository,
    private readonly lessons: ILessonRepository,
    private readonly profiles: IClientProfileRepository,
  ) {}

  invalidate(): void {
    this.cache.clear();
  }

  async knowledge(style: StyleVersion): Promise<AgentKnowledge> {
    const hit = this.cache.get(style);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const [sections, approved] = await Promise.all([
      this.rules.listSections(),
      this.lessons.listApproved(MAX_LESSONS),
    ]);

    // Bo'lim `null` bo'lsa — ikkala uslubga ham tushadi.
    const mos = sections.filter((s) => s.styleVersion === null || s.styleVersion === style);

    const value: AgentKnowledge = { sections: mos, lessons: approved };
    this.cache.set(style, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /** Bo'limlarni promptga tushadigan matnga aylantiradi. */
  async renderSections(style: StyleVersion): Promise<string> {
    const { sections } = await this.knowledge(style);
    const blocks: string[] = [];

    for (const section of sections) {
      const active = section.rules.filter((r) => r.isEnabled);
      if (!active.length) continue;

      if (section.kind === 'examples') {
        const body = active
          .map(
            (r) =>
              `Vaziyat: ${r.situation ?? ''}\n  ✗ YOMON: ${r.badExample ?? ''}\n` +
              `  ✓ YAXSHI: ${r.goodExample ?? ''}\n  Sabab: ${r.why ?? ''}`,
          )
          .join('\n\n');
        blocks.push(`## ${section.title.toUpperCase()}\n${body}`);
      } else {
        const body = active.map((r) => `- ${r.body ?? ''}`).join('\n');
        blocks.push(`## ${section.title.toUpperCase()}\n${body}`);
      }
    }

    return blocks.join('\n\n');
  }

  /**
   * Tasdiqlangan saboqlar bloki.
   *
   * Bo'limlarga bog'liq emas — saboqlar uslubdan qat'i nazar bir xil,
   * shuning uchun aynan qaysi versiya keshdan olinishi farq qilmaydi.
   */
  async renderLessons(): Promise<string> {
    const { lessons } = await this.knowledge('v1');
    if (!lessons.length) return '';

    const body = lessons
      .map((l) => `- ${l.lesson}${l.timesSeen > 1 ? ` (${l.timesSeen} marta tasdiqlangan)` : ''}`)
      .join('\n');

    return `## OLDINGI SUHBATLARDAN OLINGAN SABOQLAR\n${body}`;
  }

  /** Mijoz bo'yicha shaxsiy xotira bloki. */
  async renderClientMemory(clientId: string): Promise<string> {
    const profile = await this.profiles.find(clientId);
    if (!profile) return '';

    const lines: string[] = [];
    if (profile.clientType) lines.push(`Tipi: ${CLIENT_TYPE_LABEL[profile.clientType]}`);
    if (profile.summary) lines.push(`Eslatma: ${profile.summary}`);
    if (profile.whatWorks) lines.push(`Nima ishlagan: ${profile.whatWorks}`);
    if (profile.bestContactTime) lines.push(`Qulay vaqt: ${profile.bestContactTime}`);

    if (!lines.length) return '';
    return `## SHU MIJOZ HAQIDA ESLAB QOLGANLARING\n${lines.join('\n')}`;
  }

  async profileFor(clientId: string): Promise<ClientProfile | null> {
    return this.profiles.find(clientId);
  }

  /**
   * Dashboard uchun: agentga aynan nima ketayotgani.
   *
   * Versiya berilmasa `v1` — panelning hozirgi (versiyalashdan oldingi)
   * xatti-harakati saqlanadi.
   */
  async preview(style: StyleVersion = 'v1'): Promise<{ sections: string; lessons: string; ruleCount: number }> {
    const [sections, lessons, knowledge] = await Promise.all([
      this.renderSections(style),
      this.renderLessons(),
      this.knowledge(style),
    ]);

    const ruleCount = knowledge.sections.reduce(
      (sum, s) => sum + s.rules.filter((r) => r.isEnabled).length,
      0,
    );

    log.debug({ ruleCount, lessons: knowledge.lessons.length }, 'Prompt yig\'ildi');
    return { sections, lessons, ruleCount };
  }
}
