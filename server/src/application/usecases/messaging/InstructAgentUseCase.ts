import type { AgentRunner, AgentTurnResult } from '@/application/services/AgentRunner';
import type { ReplyDebouncer } from '@/application/services/ReplyDebouncer';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { agentFailureReason } from '@/application/services/agentFailure';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ConversationPatch, IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';
import {
  AbortedError,
  CrmUnavailableError,
  NomalumMijozXatosi,
  NotFoundError,
  StaleTurnError,
  ValidationError,
} from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('agent-topshirigi');

/** Topshiriq mavzu, xat emas — uzun matn modelni chalg'itadi. */
export const TOPSHIRIQ_MAX = 1000;

export interface InstructAgentInput {
  readonly conversationId: string;
  readonly instruction: string;
  readonly userId: string;
  readonly userEmail: string;
}

/**
 * "Agentga topshiriq" tugmasi (2026-09-15).
 *
 * Operator NIMA haqida gaplashishni yozadi, xabarni agent o'zi tuzib
 * yuboradi va suhbatni davom ettiradi. Real holat: mijoz va'da kuni
 * to'lamadi va jim qoldi, operator salomni qo'lda yozdi — agent esa bunday
 * holatda o'zi davom ettira olmasdi, operator hamma xabarni o'zi yozishi
 * kerak edi.
 *
 * Topshiriq mijozga KETMAYDIGAN qayd bo'lib chatga yoziladi (`note`):
 * operator nima so'raganini ko'radi, agent esa keyingi javoblarda ham
 * o'sha maqsadni tarixdan biladi.
 *
 * Tekshiruvlarning HAMMASI qayd yozilishidan OLDIN: bajarib bo'lmaydigan
 * topshiriq chatda qolsa, operator "agent yozdi" deb o'ylardi, mijozga esa
 * hech narsa ketmasdi.
 */
export class InstructAgentUseCase {
  constructor(
    private readonly conversations: IConversationRepository,
    private readonly messages: IMessageRepository,
    private readonly clients: IClientRepository,
    private readonly agent: AgentRunner,
    private readonly replies: ReplyDebouncer,
    private readonly settings: RuntimeSettings,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
    private readonly clock: IClock,
  ) {}

  async execute(input: InstructAgentInput): Promise<AgentTurnResult> {
    const instruction = input.instruction.trim();
    if (!instruction) {
      throw new ValidationError('Topshiriq bo\'sh — agent nima haqida yozishini yozing');
    }
    if (instruction.length > TOPSHIRIQ_MAX) {
      throw new ValidationError(`Topshiriq ${TOPSHIRIQ_MAX} belgidan oshmasin — mavzuni qisqa yozing`);
    }

    const conversation = await this.conversations.findById(input.conversationId);
    if (!conversation) throw new NotFoundError('Suhbat', input.conversationId);

    // Noma'lum suhbatga asosiy agent topshirig'i berilmaydi: javobni
    // noma'lum agent beradi. Tekshiruv BIRINCHI: aks holda qayd yozilib,
    // bayroq o'zgarib, keyin `operatorTurn` rad etgach suhbat bekorga
    // `agent_error` bo'lib qolardi.
    const client = await this.clients.findById(conversation.clientId);
    if (client?.nomalum) throw new NomalumMijozXatosi();

    const runtime = await this.settings.get();
    if (runtime.killSwitch) {
      throw new ValidationError('Favqulodda to\'xtatish yoqilgan — agent hozir hech kimga yozmaydi');
    }

    // `escalated` bu yerda to'siq EMAS: operator masalani ko'rib chiqib,
    // suhbatni agentga ongli ravishda qaytaryapti ("Hal qilindi — agentga
    // qaytarish" tugmasi bilan bir xil). `closed` esa yakuniy.
    if (conversation.state === 'closed') {
      throw new ValidationError('Suhbat yopilgan — agent unda yozmaydi');
    }

    if (client?.telegramStatus === 'blocked' || client?.telegramStatus === 'deactivated') {
      throw new ValidationError('Mijoz bizni bloklagan yoki akkaunti o\'chirilgan — xabar yetib bormaydi');
    }

    // Birinchi murojaat boshqa yo'l: u tanishtiruv, kunlik kvota va ish
    // oynasi bilan keladi. Bu tugma faqat BOSHLANGAN suhbatni davom ettiradi.
    if (!(await this.messages.hasOutbound(conversation.id))) {
      throw new ValidationError('Suhbat hali boshlanmagan — avval birinchi xabar yuborilsin');
    }

    // Agent konteksti (mijoz, xarid, sotuvdagi kurslar) qayd yozilishidan
    // OLDIN quriladi: u yiqilsa chatda "topshiriq berildi" qaydi qolib,
    // mijozga hech narsa ketmagan bo'lardi. Ommaviy qayta aloqa navbati
    // bunday suhbatni o'tkazib yuboradi va keyinroq qayta urinadi.
    await this.agent.buildContext(conversation.clientId);

    // Qayd, bayroq va chaqiruv navbat qulfi ICHIDA: aks holda debouncer
    // bilan bir vaqtda ishlab, mijoz ikkita xabar olishi mumkin edi.
    return this.replies.runNow(conversation.id, async () => {
      const note = await this.messages.create({
        conversationId: conversation.id,
        direction: 'note',
        author: 'system',
        authorUserId: input.userId,
        body: instruction,
        // Holat CHECK ro'yxatidan tanlanadi va `draft` bo'lmasligi shart:
        // `recentByConversation` qoralamalarni tashlab ketadi, qayd esa
        // agent tarixida turishi kerak.
        status: 'sent',
        meta: { kind: 'operator_instruction', by: input.userEmail },
      });
      this.events.publish({ type: 'message.created', conversationId: conversation.id, messageId: note.id });

      // Suhbat agentga TO'LIQ qaytadi: mijoz javob yozsa ham agent o'zi
      // davom ettiradi. Faqat bayroqni tushirib, agentni o'chiq qoldirish
      // topshiriqni bitta xabarga qisqartirib qo'yardi.
      const patch: ConversationPatch = {
        needsHuman: false,
        humanReason: null,
        humanKind: null,
        agentEnabled: true,
        ...(conversation.state === 'escalated' ? { state: 'negotiating' as const } : {}),
      };
      await this.conversations.update(conversation.id, patch);
      this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });

      try {
        const result = await this.agent.operatorTurn(conversation.id);

        await this.audit.record({
          actor: input.userEmail,
          action: 'conversation.agent_instruction',
          entity: 'conversation',
          entityId: conversation.id,
          payload: { chars: instruction.length, sent: result.sent },
        });

        return result;
      } catch (err) {
        // Shu payt mijozning O'ZI yozdi: uning xabari debouncer buferida
        // va agent unga javob beradi — topshiriq tarixda turibdi, ya'ni
        // o'sha javob ham uni hisobga oladi. Bayroqni qaytarish shart emas.
        // `AbortedError` dan OLDIN — `StaleTurnError` undan meros oladi.
        if (err instanceof StaleTurnError) {
          log.info({ conversationId: conversation.id }, 'Topshiriq eskirdi — mijoz yozdi, javobni agent beradi');
          throw err;
        }

        // CRM oradagi soniyalarda yiqildi (yuqoridagi tekshiruvdan o'tgan).
        // Bu AGENT xatosi emas: suhbat operatorga CHIQARILMAYDI, bayroqlar
        // topshiriqdan oldingi holatiga qaytariladi. Ommaviy navbatda
        // yuzlab suhbat bir vaqtda operator ro'yxatiga tushib ketardi.
        // Qayd qoladi — bu kamdan-kam poyga, operator uni ko'radi.
        if (err instanceof CrmUnavailableError) {
          log.warn({ conversationId: conversation.id }, 'Operator topshirig\'i bajarilmadi — CRM javob bermadi');
          await this.conversations
            .update(conversation.id, {
              needsHuman: conversation.needsHuman,
              humanReason: conversation.humanReason,
              humanKind: conversation.humanKind,
              agentEnabled: conversation.agentEnabled,
              state: conversation.state,
            })
            .catch((e) => log.error({ conversationId: conversation.id, err: e }, 'Bayroqni qaytarib bo\'lmadi'));
          this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
          throw err;
        }

        // Qayd o'chirilmaydi: operator nima so'raganini ko'rib turishi va
        // "Qayta urinish" bilan davom ettira olishi kerak.
        const reason = err instanceof AbortedError
          ? 'Operator topshirig\'i to\'xtatildi — agent o\'chirilgan'
          : agentFailureReason(err, this.clock.now());
        log.error({ conversationId: conversation.id, err }, 'Operator topshirig\'i bajarilmadi');

        await this.conversations
          .update(conversation.id, { needsHuman: true, humanKind: 'agent_error', humanReason: reason })
          .catch((e) => log.error({ conversationId: conversation.id, err: e }, 'Bayroqni tiklab bo\'lmadi'));
        this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
        throw err;
      }
    });
  }
}
