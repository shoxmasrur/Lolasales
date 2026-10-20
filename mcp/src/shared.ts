import { z } from 'zod';
import { ApiError } from './api.js';

/** MCP SDK javob turi qo'shimcha maydonlarga ruxsat beradi (index signature). */
export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function toolJson(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function toolText(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

/**
 * Xatoni agentga tushunarli qilib qaytaradi.
 * 403 alohida: bu odatda API kalitning roli tor ekanini bildiradi.
 */
export function toolError(err: unknown): ToolResult {
  if (err instanceof ApiError) {
    const hint =
      err.status === 403
        ? '\nIzoh: API kalitingiz roliga bu amal uchun ruxsat berilmagan. ' +
          'Dashboard → Foydalanuvchilar → Rollar bo\'limidan tekshiring.'
        : err.status === 401
          ? '\nIzoh: API kalit yaroqsiz, bekor qilingan yoki muddati tugagan.'
          : '';
    return {
      content: [{ type: 'text', text: `XATO: ${err.message} (${err.code}, HTTP ${err.status})${hint}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: `XATO: ${err instanceof Error ? err.message : 'Noma\'lum xato'}` }],
    isError: true,
  };
}

export const paginationShape = {
  limit: z.number().int().min(1).max(200).optional().describe('Nechta yozuv (maks. 200)'),
  offset: z.number().int().min(0).optional().describe('Nechtasini o\'tkazib yuborish'),
};
