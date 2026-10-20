import type { AgentRunner, AgentTurnResult } from '@/application/services/AgentRunner';
import type { ReplyDebouncer } from '@/application/services/ReplyDebouncer';
import { agentFailureReason } from '@/application/services/agentFailure';
import { isTerminal } from '@/domain/entities/Conversation';
import type { Message } from '@/domain/entities/Message';
import { readableBody } from '@/domain/entities/Message';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';
import { AbortedError, NomalumMijozXatosi, NotFoundError, StaleTurnError, ValidationError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('agent-retry');

/** Agentning o'zi ham shuncha xabarni ko'radi — bir xil oyna. */
const HISTORY_LIMIT = 20;

export interface RetryAgentTurnInput {
  readonly conversationId: string;
  readonly userEmail: string;
}

/**
 * "Qayta urinish" tugmasi.
 *
 * Agent texnik xatodan keyin O'ZI uyg'onmaydi: u faqat mijozdan yangi xabar
 * kelganda chaqiriladi. Mijoz esa javob kutib turibdi va yozmaydi — suhbat
 * muzlab qoladi. Bu use case aynan shu muzlashni yechadi.
 *
 * "Qayerda qolganini eslash" uchun alohida narsa kerak emas: agent har
 * navbatda oxirgi 20 xabar tarixini qayta oladi.
 */
export class RetryAgentTurnUseCase {
  constructor(
    private readonly conversations: IConversationRepository,
    private readonly messages: IMessageRepository,
    private readonly clients: IClientRepository,
    private readonly agent: AgentRunner,
    private readonly replies: ReplyDebouncer,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
    private readonly clock: IClock,
  ) {}

  async execute(input: RetryAgentTurnInput): Promise<AgentTurnResult> {
    const conversation = await this.conversations.findById(input.conversationId);
    if (!conversation) throw new NotFoundError('Suhbat', input.conversationId);

    // Noma'lum suhbatga asosiy agent qayta urinmaydi: javobni noma'lum
    // agent beradi. Bayroqqa tegishdan OLDIN rad etiladi.
    const client = await this.clients.findById(conversation.clientId);
    if (client?.nomalum) throw new NomalumMijozXatosi();

    if (!conversation.needsHuman || conversation.humanKind !== 'agent_error') {
      throw new ValidationError('Bu suhbat texnik xato tufayli to\'xtamagan — qayta urinish yordam bermaydi');
    }

    // `AgentRunner` bunday suhbatda XATO otmaydi — u shunchaki
    // `sent: false` qaytaradi. Oldindan tekshirmasak, bayroq tushirilgan,
    // lekin hech narsa yuborilmagan holat yuzaga kelardi va suhbat
    // operator navbatidan jimgina yo'qolardi.
    if (!conversation.agentEnabled || isTerminal(conversation.state)) {
      throw new ValidationError('Agent bu suhbatda javob bera olmaydi — o\'chirilgan yoki suhbat yakunlangan');
    }

    // Nima qilishni bayroqni TUSHIRISHDAN OLDIN aniqlaymiz: bajarib
    // bo'lmaydigan urinish suhbatni bayroqsiz qoldirsa, u operator
    // ro'yxatidan butunlay yo'qolib ketardi.
    const recent = await this.messages.recentByConversation(input.conversationId, HISTORY_LIMIT);
    const incoming = unansweredText(recent);

    if (recent.length && !incoming) {
      throw new ValidationError('Javobsiz xabar yo\'q — agentni chaqirishga sabab yo\'q');
    }

    // Bayroqni tushirish ham, chaqiruv ham navbat qulfi ICHIDA: aks holda
    // debouncer bilan bir vaqtda ishlab, mijoz ikkita xabar olishi mumkin.
    return this.replies.runNow(conversation.id, async () => {
      await this.conversations.update(conversation.id, { needsHuman: false, humanReason: null });
      this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });

      try {
        const result = incoming
          ? await this.agent.reply(conversation.id, incoming)
          : await this.agent.firstContact(conversation.id);

        await this.audit.record({
          actor: input.userEmail,
          action: 'conversation.agent_retry',
          entity: 'conversation',
          entityId: conversation.id,
          payload: { firstContact: !incoming, sent: result.sent },
        });

        return result;
      } catch (err) {
        // Urinish paytida mijozning O'ZI yozdi — urinish "yiqilmadi",
        // shunchaki keraksiz bo'lib qoldi. Bayroqni qaytarmaymiz:
        // mijozning yangi xabari debouncer buferida turibdi va agent
        // unga o'zi javob beradi, ya'ni suhbat operator ishini
        // talab qilmaydi.
        //
        // Bu shox `AbortedError` dan OLDIN turishi shart —
        // `StaleTurnError` undan meros oladi. Aks holda operator
        // bannerda "agent o'chirilgan" degan yozuvni ko'rardi,
        // holbuki hech kim hech narsani o'chirmagan.
        if (err instanceof StaleTurnError) {
          log.info(
            { conversationId: conversation.id },
            'Qayta urinish eskirdi — mijoz yangi xabar yubordi, javobni agent beradi',
          );
          throw err;
        }

        // Operator urinishning O'ZINI to'xtatdi (agentni o'chirdi) — bu
        // nosozlik emas. Lekin bayroqni tushirib ketib bo'lmaydi: mijozning
        // javobsiz xabari joyida turibdi va suhbat bayroqsiz qolsa operator
        // ro'yxatidan butunlay yo'qolib ketardi (yuqoridagi izohga qarang).
        //
        // Shuning uchun suhbatni AVVALGI holatiga qaytaramiz — o'sha
        // `agent_error` turi bilan, "Qayta urinish" tugmasi ishlab tursin:
        // operator agentni qayta yoqib, urinishni takrorlashi mumkin.
        // Faqat sabab rost yoziladi: "Agent xatosi: Amal to'xtatildi" emas,
        // to'xtatilgani aytiladi.
        if (err instanceof AbortedError) {
          log.info({ conversationId: conversation.id }, 'Qayta urinish to\'xtatildi');
          await this.conversations.update(conversation.id, {
            needsHuman: true,
            humanKind: 'agent_error',
            humanReason: 'Qayta urinish to\'xtatildi — agent o\'chirilgan',
          });
          this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
          throw err;
        }

        log.error({ conversationId: conversation.id, err }, 'Qayta urinish ham yiqildi');
        // Tiklovchi `update` o'zi ham yiqilishi mumkin (masalan baza
        // vaqtincha ishlamasa). Uning xatosi asl `err`ni almashtirib
        // yubormasin — chaqiruvchi haqiqiy sababni (masalan Claude limiti)
        // ko'rishi kerak, "bazaga yozib bo'lmadi" emas.
        await this.conversations
          .update(conversation.id, {
            needsHuman: true,
            humanKind: 'agent_error',
            humanReason: agentFailureReason(err, this.clock.now()),
          })
          .catch((e) => log.error({ conversationId: conversation.id, err: e }, 'Bayroqni tiklab bo\'lmadi'));
        this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
        throw err;
      }
    });
  }
}

/**
 * Oxirgi chiquvchi xabardan KEYIN kelgan mijoz xabarlari.
 *
 * Eski, allaqachon javob berilgan xabarni agentga qayta berish — eng
 * xavfli xato: agent o'sha javobni takrorlaydi va mijoz buni darhol sezadi.
 */
function unansweredText(recent: Message[]): string {
  const lastOutbound = [...recent].reverse().find((m) => m.direction === 'out');
  const after = lastOutbound?.createdAt.getTime() ?? 0;

  return recent
    .filter((m) => m.direction === 'in' && m.createdAt.getTime() > after)
    .map((m) => readableBody(m))
    .filter(Boolean)
    .join('\n');
}
