import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { QongiroqBrifi } from '@/application/services/QongiroqBrifi';
import { ShartnomaTopilmadi } from '@/application/services/QongiroqBrifi';
import type { QongiroqNatijasi } from '@/application/services/QongiroqNatijasi';
import { NotogriKirish } from '@/application/services/QongiroqNatijasi';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import { can, type User } from '@/domain/entities/User';
import { DaqiqaChegarasi } from '@/presentation/mcp/daqiqaChegarasi';
import { childLogger } from '@/shared/logger';

const log = childLogger('qongiroq-mcp');

/** Spec: bitta kalitga daqiqasiga 60 chaqiruv. */
const CHAQIRUV_CHEGARASI = 60;

interface Deps {
  readonly brifi: Pick<QongiroqBrifi, 'tuz'>;
  readonly natija: Pick<QongiroqNatijasi, 'yoz'>;
  readonly audit: Pick<IAuditRepository, 'record'>;
  readonly chegara?: DaqiqaChegarasi;
}

type Natija = 'ok' | 'topilmadi' | 'ruxsat_yoq' | 'chegara' | 'xato';

const xato = (matn: string) => ({ isError: true, content: [{ type: 'text' as const, text: matn }] });

/**
 * Bulutdagi ovozli agent uchun MCP (Streamable HTTP, holatsiz).
 *
 * Har so'rovga YANGI `McpServer` — sessiya yo'q, jarayon qayta ishga
 * tushsa ham mijoz hech narsa yo'qotmaydi. Kirish `authenticate`
 * middleware'idan o'tgan (`req.user`), ruxsat har asbobda alohida.
 *
 * Asboblar ataylab kam: ro'yxat yoki qidiruv yo'q (spec 2-bo'lim).
 */
export function qongiroqMcpRouter(deps: Deps): Router {
  const chegara = deps.chegara ?? new DaqiqaChegarasi(CHAQIRUV_CHEGARASI);
  const router = Router();

  const serverYarat = (user: User): McpServer => {
    const server = new McpServer({ name: 'debitor-qongiroq', version: '1.0.0' });
    // Har chaqiruv (rad etilgani ham) jurnalga tushadi: o'g'irlangan kalit
    // bilan raqamlarni terib ko'rish izsiz qolmasin. Jurnal yozilmasa ham
    // asbob javobi o'zgarmaydi.
    const jurnal = async (
      action: 'calls.brief' | 'calls.record',
      natija: Natija,
      payload: Record<string, string>,
    ): Promise<void> => {
      try {
        await deps.audit.record({
          actor: user.email,
          action,
          entity: 'contract',
          entityId: null,
          payload: { ...payload, natija },
        });
      } catch (err) {
        log.warn({ err, action }, 'qongiroq MCP auditga yozilmadi');
      }
    };
    server.registerTool(
      'qongiroq_oldi',
      {
        title: 'Qo\'ng\'iroqdan oldingi ma\'lumot',
        description:
          'Shartnoma raqami bo\'yicha mijoz haqida ma\'lumot: kechikkan to\'lov, Telegramdagi yozishma, ' +
          'ochiq va\'dalar, oxirgi qo\'ng\'iroqlar (qongiroqlar), mijoz xotirasi va hozir qo\'ng\'iroq qilsa bo\'ladimi (qongiroq_mumkin, sabablar). ' +
          'Har qo\'ng\'iroqdan OLDIN chaqiring. qongiroq_mumkin = false bo\'lsa qo\'ng\'iroq qilmang.',
        inputSchema: { shartnoma_raqami: z.string().min(1).max(64) },
      },
      async ({ shartnoma_raqami }) => {
        const sorilgan = shartnoma_raqami.trim();

        // Ruxsat mantig'i `AuthContext.require` bilan bir xil `can` orqali.
        if (!can(user, 'calls.brief')) {
          await jurnal('calls.brief', 'ruxsat_yoq', { shartnomaRaqami: sorilgan });
          return xato('Ruxsat yo\'q: kalit «Qo\'ng\'iroq agenti» roliga bog\'lanmagan (calls.brief)');
        }
        if (!chegara.ruxsat(user.id)) {
          await jurnal('calls.brief', 'chegara', { shartnomaRaqami: sorilgan });
          return xato('Juda ko\'p so\'rov — daqiqasiga 60 tadan oshmasin, birozdan keyin qayta urinib ko\'ring');
        }
        try {
          const javob = await deps.brifi.tuz(shartnoma_raqami);
          await jurnal('calls.brief', 'ok', { shartnomaRaqami: javob.shartnoma_raqami });
          return { content: [{ type: 'text' as const, text: JSON.stringify(javob) }] };
        } catch (err) {
          if (err instanceof ShartnomaTopilmadi) {
            await jurnal('calls.brief', 'topilmadi', { shartnomaRaqami: sorilgan });
            return xato(err.message);
          }
          log.error({ err }, 'qongiroq_oldi bajarilmadi');
          await jurnal('calls.brief', 'xato', { shartnomaRaqami: sorilgan });
          return xato('Ichki xato — birozdan keyin qayta urinib ko\'ring');
        }
      },
    );

    server.registerTool(
      'qongiroq_natijasi',
      {
        title: 'Qo\'ng\'iroq natijasi',
        description:
          'Qo\'ng\'iroqdan KEYIN chaqiring: natija, qisqa xulosa va (bo\'lsa) va\'da. Bir qo\'ng\'iroq uchun ' +
          'qongiroq_id bir xil bo\'lsin — takror yuborilsa yozuv yangilanadi, ikkinchisi ochilmaydi.',
        inputSchema: {
          shartnoma_raqami: z.string().min(1).max(64),
          qongiroq_id: z.string().min(1).max(200),
          agent_kaliti: z.string().min(1).max(100),
          agent_ismi: z.string().min(1).max(100),
          boshlandi: z.string().min(1).max(40),
          davomiylik_soniya: z.number().int().min(0).max(14_400),
          natija: z.enum(['gaplashildi', 'kotarmadi', 'band', 'boshqa_odam', 'raqam_notogri']),
          xulosa: z.string().max(2000).optional(),
          vada: z.object({ kun: z.string(), summa: z.number().optional() }).optional(),
          transkript: z.string().max(100_000).optional(),
          telefon: z.string().max(32).optional(),
        },
      },
      async (kirish) => {
        const sorilgan = kirish.shartnoma_raqami.trim();
        const qongiroqId = kirish.qongiroq_id.trim();
        if (!can(user, 'calls.record')) {
          await jurnal('calls.record', 'ruxsat_yoq', { shartnomaRaqami: sorilgan, qongiroqId });
          return xato('Ruxsat yo\'q: kalit «Qo\'ng\'iroq agenti» roliga bog\'lanmagan (calls.record)');
        }
        if (!chegara.ruxsat(user.id)) {
          await jurnal('calls.record', 'chegara', { shartnomaRaqami: sorilgan, qongiroqId });
          return xato('Juda ko\'p so\'rov — daqiqasiga 60 tadan oshmasin, birozdan keyin qayta urinib ko\'ring');
        }
        try {
          const javob = await deps.natija.yoz(kirish, user.id);
          await jurnal('calls.record', 'ok', { shartnomaRaqami: sorilgan.toUpperCase(), qongiroqId });
          return { content: [{ type: 'text' as const, text: JSON.stringify(javob) }] };
        } catch (err) {
          if (err instanceof ShartnomaTopilmadi) {
            await jurnal('calls.record', 'topilmadi', { shartnomaRaqami: sorilgan, qongiroqId });
            return xato(err.message);
          }
          if (err instanceof NotogriKirish) {
            await jurnal('calls.record', 'xato', { shartnomaRaqami: sorilgan, qongiroqId });
            return xato(err.message);
          }
          log.error({ err }, 'qongiroq_natijasi bajarilmadi');
          await jurnal('calls.record', 'xato', { shartnomaRaqami: sorilgan, qongiroqId });
          return xato('Ichki xato — birozdan keyin qayta urinib ko\'ring');
        }
      },
    );
    return server;
  };

  router.post('/', async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'API kalit kerak' } });
      return;
    }
    const server = serverYarat(user);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const yoq = (_req: Request, res: Response): void => {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Faqat POST (holatsiz MCP)' } });
  };
  router.get('/', yoq);
  router.delete('/', yoq);

  return router;
}
