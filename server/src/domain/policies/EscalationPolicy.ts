import type { EscalationStage } from '@/domain/entities/Conversation';

/**
 * Playbook 8-bo'lim: MDH kollektorlik amaliyotidagi 3 bosqichli eskalatsiya.
 *   Soft  (0–60 kun)   — faqat eslatma, muloyim ohang
 *   Hard  (60–180 kun) — qat'iy talab, shartnoma bekor qilinishi eslatiladi
 *   Legal (180+ kun)   — yozma tan olish, oxirgi muhlat, bekor qilish jarayoni
 *
 * Sof funksiya: I/O yo'q, test qilish oson.
 */
export const STAGE_THRESHOLDS = { hard: 60, legal: 180 } as const;

export function stageForOverdueDays(daysOverdue: number): EscalationStage {
  if (daysOverdue >= STAGE_THRESHOLDS.legal) return 'legal';
  if (daysOverdue >= STAGE_THRESHOLDS.hard) return 'hard';
  return 'soft';
}

export interface StageGuidance {
  readonly stage: EscalationStage;
  readonly label: string;
  /** Agentga beriladigan ohang ko'rsatmasi. */
  readonly tone: string;
  /** Shu bosqichda ruxsat etilgan bosim vositalari. */
  readonly leverage: string[];
}

const GUIDANCE: Record<EscalationStage, StageGuidance> = {
  soft: {
    stage: 'soft',
    label: 'Eslatma bosqichi',
    tone: 'Muloyim, lekin aniq. Kechikish faktini qayd et va sabab so\'ra — bir marta.',
    leverage: [
      'To\'lov jadvali buzilganini eslatish',
      'Aniq sana va summa so\'rash',
    ],
  },
  hard: {
    stage: 'hard',
    label: 'Qat\'iy talab bosqichi',
    tone: 'Qat\'iy, tekis ohang. Bahonalarni qabul qilma, aniq majburiyat talab qil.',
    leverage: [
      'To\'lov jadvali buzilgani shartnomaviy oqibatga olib kelishi',
      'Rahbariyatga hisobot berilishi',
      'Oldin berilgan va bajarilmagan va\'dani eslatish',
    ],
  },
  legal: {
    stage: 'legal',
    label: 'Huquqiy bosqich',
    tone: 'Rasmiy, sovuq, hissiyotsiz. Faktlar va muddatlar bilan gapir.',
    leverage: [
      'Shartnoma 3.7-bandiga ko\'ra quruvchi bir tomonlama bekor qilish huquqi',
      'To\'lovni yozma tan olish xatini so\'rash',
      'Xonadonning sotuvga chiqarilishi va to\'langan pulning 180 bank ish kunida qaytarilishi',
    ],
  },
};

export function guidanceFor(stage: EscalationStage): StageGuidance {
  return GUIDANCE[stage];
}
