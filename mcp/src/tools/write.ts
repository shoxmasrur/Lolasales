import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DebitorApi } from '../api.js';
import { toolError, toolJson, toolText } from '../shared.js';

/**
 * XAVFSIZ yozish amallari.
 *
 * Bu yerda ATAYLAB yo'q:
 *   • mijozga xabar yuborish
 *   • suhbat boshlash
 *   • kampaniya yaratish/ishga tushirish
 *   • kill switch, sozlamalar, foydalanuvchi boshqaruvi
 *
 * Sabab: bular real mijozlarga bevosita ta'sir qiladi. Boshqa agent xato
 * qilsa, buni orqaga qaytarib bo'lmaydi. Shu amallar faqat dashboard orqali,
 * odam nazorati bilan bajariladi.
 */
export function registerWriteTools(server: McpServer, api: DebitorApi): void {
  server.registerTool(
    'debitor_update_client_memory',
    {
      title: 'Mijoz xotirasini yangilash',
      description:
        'Mijoz haqida agent eslab qoladigan ma\'lumotni yangilaydi. Bu keyingi suhbatlarda ' +
        'agentga beriladi. Faqat aniq bilgan narsangizni yozing.',
      inputSchema: {
        clientId: z.string().uuid().describe('Mijoz id'),
        clientType: z
          .enum(['qochoq', 'tajovuzkor', 'qiynalayotgan', 'yaxshi_niyatli'])
          .nullable()
          .optional()
          .describe('Mijoz tipi'),
        summary: z.string().max(600).nullable().optional().describe('Qisqa xulosa'),
        whatWorks: z.string().max(600).nullable().optional().describe('Qaysi yondashuv ishlagan'),
        bestContactTime: z.string().max(120).nullable().optional().describe('Qulay vaqt'),
      },
    },
    async ({ clientId, ...patch }) => {
      try {
        return toolJson(await api.patch(`/agent/client-profile/${clientId}`, patch));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_update_client_note',
    {
      title: 'Mijoz izohini yangilash',
      description:
        'Mijozning ichki izohini yozadi yoki "bog\'lanmaslik" belgisini qo\'yadi. ' +
        'doNotContact=true qo\'yilsa, tizim bu mijozga umuman yozmaydi.',
      inputSchema: {
        clientId: z.string().uuid().describe('Mijoz id'),
        notes: z.string().max(2000).nullable().optional().describe('Ichki izoh'),
        doNotContact: z.boolean().optional().describe('Bu mijozga umuman yozilmasin'),
      },
    },
    async ({ clientId, ...patch }) => {
      try {
        return toolJson(await api.patch(`/clients/${clientId}`, patch));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_escalate_conversation',
    {
      title: 'Suhbatni operatorga chiqarish',
      description:
        'Suhbatni "inson aralashuvi kerak" deb belgilaydi va agentni to\'xtatadi. ' +
        'Murakkab yoki nozik holatlarda ishlating — mijozga xabar yuborilmaydi, ' +
        'faqat operator ish navbatiga tushadi.',
      inputSchema: {
        conversationId: z.string().uuid().describe('Suhbat id'),
        reason: z.string().min(5).max(400).describe('Nega odam kerak — operator shuni ko\'radi'),
      },
    },
    async ({ conversationId, reason }) => {
      try {
        await api.patch(`/conversations/${conversationId}`, {
          needsHuman: true,
          humanReason: reason,
        });
        return toolText(`Suhbat operatorga chiqarildi. Sabab: ${reason}`);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_set_conversation_state',
    {
      title: 'Suhbat holatini o\'zgartirish',
      description:
        'Suhbat holatini qo\'lda belgilaydi (masalan mijoz boshqa kanal orqali to\'lagani ma\'lum ' +
        'bo\'lsa — "closed"). Mijozga xabar yuborilmaydi.',
      inputSchema: {
        conversationId: z.string().uuid().describe('Suhbat id'),
        state: z
          .enum([
            'contacted', 'negotiating', 'promised', 'agreed',
            'refused', 'unreachable', 'closed',
          ])
          .describe('Yangi holat'),
        agentEnabled: z
          .boolean()
          .optional()
          .describe('Shu suhbatda agent javob berishda davom etsinmi'),
      },
    },
    async ({ conversationId, ...patch }) => {
      try {
        return toolJson(await api.patch(`/conversations/${conversationId}`, patch));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_propose_lesson',
    {
      title: 'Agentga saboq taklif qilish',
      description:
        'Debitor agent uchun yangi saboq taklif qiladi (masalan yangi e\'tiroz turi va unga ' +
        'ishlagan javob). Saboq DARHOL ishlatilmaydi — odam tasdiqlagandan keyin agentning ' +
        'qoidalariga qo\'shiladi.',
      inputSchema: {
        lesson: z.string().min(10).max(600).describe('Qisqa, amal qilsa bo\'ladigan xulosa'),
        evidence: z.string().max(600).nullable().optional().describe('Dalil: mijozning gapi yoki holat'),
        conversationId: z.string().uuid().nullable().optional().describe('Qaysi suhbatdan olingan'),
      },
    },
    async (args) => {
      try {
        const result = await api.post<{ lesson: { id: string; timesSeen: number } }>(
          '/agent/lessons',
          args,
        );
        return toolText(
          `Saboq taklif qilindi (tasdiq kutmoqda). Shu saboq ${result.lesson.timesSeen} marta uchradi. ` +
            'Dashboard → Agent → O\'rgangan saboqlar bo\'limida tasdiqlanadi.',
        );
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
