export interface TranscriptionInput {
  readonly audio: Buffer;
  readonly fileName: string;
  readonly mimeType: string | null;
  /** 'uz' | 'ru' | 'en'. Berilmasa sozlamadagi til ishlatiladi. */
  readonly language?: string;
  readonly durationSec?: number | null;
}

export type TranscriptionResult =
  | { readonly ok: true; readonly text: string; readonly language: string | null }
  | { readonly ok: false; readonly reason: string };

/**
 * Ovozli xabarni matnga o'girish.
 * Provayder almashtirilsa (Nai → boshqa xizmat) faqat implementatsiya o'zgaradi.
 */
export interface ISpeechToText {
  readonly available: boolean;
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}
