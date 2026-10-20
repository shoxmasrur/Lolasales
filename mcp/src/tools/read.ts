import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DebitorApi } from '../api.js';
import { paginationShape, toolError, toolJson } from '../shared.js';

/** Faqat o'qiydigan asboblar — hech narsani o'zgartirmaydi. */
export function registerReadTools(server: McpServer, api: DebitorApi): void {
  server.registerTool(
    'debitor_stats',
    {
      title: 'Umumiy holat',
      description:
        'Debitorlik bo\'yicha umumiy ko\'rsatkichlar: jami qarz, mijozlar soni, ochiq va\'dalar, ' +
        'bugungi yozishmalar, suhbat holatlari va eskalatsiya bosqichlari bo\'yicha taqsimot.',
      inputSchema: {},
    },
    async () => {
      try {
        const data = await api.get<{ stats: unknown }>('/stats/dashboard');
        return toolJson(data.stats);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_search_clients',
    {
      title: 'Mijozlarni qidirish',
      description:
        'Mijozlarni ism, telefon yoki shartnoma raqami bo\'yicha qidiradi. Har biri uchun jami qarz ' +
        'va kechikish kuni qaytadi. Eng katta qarzdorlarni topish uchun sort="debt" ishlating.',
      inputSchema: {
        search: z.string().optional().describe('Ism, telefon yoki shartnoma raqami'),
        sort: z
          .enum(['debt', 'overdue', 'name', 'recent'])
          .optional()
          .describe('Saralash: debt (qarz), overdue (kechikish), name, recent'),
        minDaysOverdue: z.number().int().optional().describe('Shu kundan ko\'p kechikkanlar'),
        hasPhone: z.boolean().optional().describe('Faqat telefon raqami borlar (yoki yo\'qlar)'),
        objectName: z.string().optional().describe('Obyekt nomi bo\'yicha filtr'),
        ...paginationShape,
      },
    },
    async (args) => {
      try {
        return toolJson(
          await api.get('/clients', {
            ...args,
            hasPhone: args.hasPhone === undefined ? undefined : String(args.hasPhone),
          }),
        );
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_get_client',
    {
      title: 'Mijoz kartasi',
      description:
        'Bitta mijozning to\'liq ma\'lumoti: shaxsiy ma\'lumot, barcha shartnomalari, qarz summasi, ' +
        'kechikish kuni, Telegram holati va suhbat mavjudligi.',
      inputSchema: { clientId: z.string().uuid().describe('Mijoz id') },
    },
    async ({ clientId }) => {
      try {
        return toolJson(await api.get(`/clients/${clientId}`));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_client_memory',
    {
      title: 'Mijoz bo\'yicha xotira',
      description:
        'Agent shu mijoz haqida eslab qolgan narsalar: tipi (qochoq / tajovuzkor / qiynalayotgan / ' +
        'yaxshi niyatli), qisqa xulosa va qaysi yondashuv ishlagani.',
      inputSchema: { clientId: z.string().uuid().describe('Mijoz id') },
    },
    async ({ clientId }) => {
      try {
        return toolJson(await api.get(`/agent/client-profile/${clientId}`));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_list_conversations',
    {
      title: 'Suhbatlar ro\'yxati',
      description:
        'Suhbatlar va ularning holati. needsHuman=true bilan operator aralashuvi kutilayotganlarini ' +
        'topish mumkin — bu eng muhim ish navbati.',
      inputSchema: {
        search: z.string().optional().describe('Mijoz ismi yoki telefoni'),
        state: z
          .enum([
            'new', 'contacted', 'negotiating', 'promised', 'agreed',
            'refused', 'unreachable', 'escalated', 'closed',
          ])
          .optional()
          .describe('Suhbat holati'),
        stage: z.enum(['soft', 'hard', 'legal']).optional().describe('Eskalatsiya bosqichi'),
        needsHuman: z.boolean().optional().describe('Faqat inson aralashuvi kerak bo\'lganlar'),
        ...paginationShape,
      },
    },
    async (args) => {
      try {
        return toolJson(
          await api.get('/conversations', {
            ...args,
            needsHuman: args.needsHuman ? 'true' : undefined,
          }),
        );
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_get_conversation',
    {
      title: 'Suhbat va yozishma',
      description:
        'Suhbatning to\'liq yozishmasi, mijoz ma\'lumoti, shartnomalari va ochiq to\'lov va\'dasi. ' +
        'Ovozli xabarlar matnga o\'girilgan holda qaytadi.',
      inputSchema: {
        conversationId: z.string().uuid().describe('Suhbat id'),
        messageLimit: z.number().int().min(1).max(200).optional().describe('Nechta xabar (sukut 50)'),
      },
    },
    async ({ conversationId, messageLimit }) => {
      try {
        const [detail, messages] = await Promise.all([
          api.get(`/conversations/${conversationId}`),
          api.get(`/conversations/${conversationId}/messages`, { limit: messageLimit ?? 50 }),
        ]);
        return toolJson({ ...(detail as object), messages });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_list_promises',
    {
      title: 'To\'lov va\'dalari',
      description:
        'Mijozlar bergan to\'lov va\'dalari. status="pending" — kutilayotgan, "broken" — buzilgan, ' +
        '"kept" — bajarilgan. Buzilgan va\'dalar keyingi bosim uchun eng kuchli asos.',
      inputSchema: {
        status: z.enum(['pending', 'kept', 'broken', 'cancelled']).optional(),
        ...paginationShape,
      },
    },
    async (args) => {
      try {
        return toolJson(await api.get('/stats/promises', args));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_list_campaigns',
    {
      title: 'Kampaniyalar',
      description: 'Undirish kampaniyalari va ularning progressi (yuborilgan, navbatdagi, xato).',
      inputSchema: { ...paginationShape },
    },
    async (args) => {
      try {
        return toolJson(await api.get('/campaigns', args));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_telegram_status',
    {
      title: 'Telegram akkauntlar holati',
      description:
        'Akkauntlar: ulanganmi, @SpamBot bo\'yicha cheklanganmi, kunlik limitdan qanchasi ishlatilgan, ' +
        'qaysi akkauntga nechta mijoz biriktirilgan. Yuborish sekinlashsa — birinchi shu yerga qarang.',
      inputSchema: {},
    },
    async () => {
      try {
        const [accounts, distribution] = await Promise.all([
          api.get('/telegram/accounts'),
          api.get('/telegram/distribution'),
        ]);
        return toolJson({ ...(accounts as object), ...(distribution as object) });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_get_rules',
    {
      title: 'Agent qoidalari',
      description:
        'Debitor agentning muloqot qoidalari: uslub, takrorlanmaslik, to\'lov usullari, ' +
        'tasdiqlangan shartnoma faktlari, taktikalar, taqiqlar va misollar.',
      inputSchema: {},
    },
    async () => {
      try {
        return toolJson(await api.get('/agent/rules'));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_list_lessons',
    {
      title: 'O\'rgangan saboqlar',
      description:
        'Agent suhbatlardan chiqargan xulosalar. status="approved" — ishlatilayotganlari, ' +
        '"proposed" — odam tasdig\'ini kutayotganlari.',
      inputSchema: { status: z.enum(['proposed', 'approved', 'rejected']).optional() },
    },
    async (args) => {
      try {
        return toolJson(await api.get('/agent/lessons', args));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    'debitor_settings',
    {
      title: 'Ish rejimi sozlamalari',
      description:
        'Yuborish tezligi, kunlik limit, ish vaqti oynasi, agentning avtomatik javob rejimi va ' +
        'global to\'xtatish (kill switch) holati.',
      inputSchema: {},
    },
    async () => {
      try {
        return toolJson(await api.get('/settings'));
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
