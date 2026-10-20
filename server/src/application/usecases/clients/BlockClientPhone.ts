import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IClientPhoneBlockRepository } from '@/domain/repositories/IClientPhoneBlockRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import { raqamniUz } from '@/domain/services/telefonToSigi';
import { NotFoundError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('phone-block');

export interface BlockClientPhoneInput {
  readonly clientId: string;
  /** E.164 ko'rinishida — normalizatsiya chaqiruvchida bajariladi. */
  readonly phone: string;
  readonly reason?: string | null;
  /** Tugmani bosgan xodim. */
  readonly actor: string;
}

/**
 * "Bu raqam mijozniki emas" — raqamni mijozdan uzadi.
 *
 * Mijozga yozdik, javob bergan odam boshqa kishi bo'lib chiqdi: raqam eski
 * egasidan chiqib, yangi odamga berilgan. Agent bunday holatda uzr aytadi
 * va begona odamga "boshqa yozilmaydi" deb VA'DA beradi — bu use case
 * o'sha va'dani bajaradi.
 *
 * Qaror OPERATORNIKI, agentniki emas: haqiqiy qarzdor ham xabardan
 * qutulish uchun "adashgansiz" deyishi mumkin, va tekshirilmagan da'vo
 * bo'yicha avtomatik o'chirish undiruvni jimgina yo'qotardi.
 */
export class BlockClientPhoneUseCase {
  constructor(
    private readonly clients: IClientRepository,
    private readonly blocks: IClientPhoneBlockRepository,
    private readonly conversations: IConversationRepository,
    private readonly audit: IAuditRepository,
    private readonly paymentChecks: IPaymentCheckRepository,
  ) {}

  async execute(input: BlockClientPhoneInput): Promise<void> {
    const client = await this.clients.findById(input.clientId);
    if (!client) throw new NotFoundError('Mijoz', input.clientId);

    // 1. Raqamni ro'yxatdan uzamiz. Raqam allaqachon yo'q bo'lishi ham
    //    normal: operator tugmani ikki marta bosishi mumkin.
    const keyingi = raqamniUz(
      { phone: client.phone, extraPhones: client.extraPhones },
      input.phone,
    );
    await this.clients.update(input.clientId, {
      phone: keyingi.phone,
      extraPhones: [...keyingi.extraPhones],
    });

    // 2. Doimiy belgi. Usiz sinxronizatsiya raqamni CRM'dan qaytarib
    //    qo'yardi — 067-migratsiyaning izohiga qarang.
    await this.blocks.block({
      clientId: input.clientId,
      phone: input.phone,
      reason: input.reason ?? null,
      blockedBy: input.actor,
    });

    // 3. Keshdagi Telegram shaxsi BEGONA odamning hisobiga ishora qiladi.
    //    Tozalanmasa, raqam o'chirilgan bo'lsa ham xabar o'shanga
    //    ketaverardi. `unknown` holati mijozda boshqa to'g'ri raqam
    //    qolgan bo'lsa uni qayta qidirishga qo'yadi.
    await this.clients.clearTelegramIdentity(input.clientId);

    // 4. Suhbatni yopamiz. Xabarlar tarixi TEGILMAYDI: begona odamga nima
    //    yozganimiz audit uchun kerak bo'lishi mumkin.
    const conversation = await this.conversations.findByClientId(input.clientId);
    if (conversation) {
      await this.conversations.update(conversation.id, { state: 'closed' });
      // Ochiq to'lov tekshiruvi ham yopiladi — begona odamning "chekini"
      // tugma bilan tasdiqlaydigan hech kim yo'q.
      await this.paymentChecks.cancel(conversation.id);
    }

    await this.audit.record({
      actor: input.actor,
      action: 'client.phone_blocked',
      entity: 'client',
      entityId: input.clientId,
      payload: { phone: input.phone, reason: input.reason ?? null },
    });

    log.info(
      { clientId: input.clientId, hadOtherPhones: keyingi.phone !== null },
      'Raqam mijozdan uzildi',
    );
  }
}
