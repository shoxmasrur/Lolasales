import type { XaridBosqichi } from '@/domain/entities/Purchase';
import type { Conversation, EscalationStage } from '@/domain/entities/Conversation';
import { CHEK_TEKSHIRUVI_MUDDATI_KUNLAR } from '@/domain/entities/PaymentCheck';
import type {
  ConversationFilterOptions,
  ConversationListItem,
  ConversationPatch,
  ConversationQuery,
  EslatmaNomzodi,
  IConversationRepository,
  ResetSummary,
} from '@/domain/repositories/IConversationRepository';
import type { Page } from '@/domain/repositories/types';
import { query, withTransaction } from '@/infrastructure/db/pool';
import { mapConversation } from '@/infrastructure/db/mappers';
import { HAMMASI, type MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import { mijozQamroviSharti } from '@/infrastructure/db/qamrovSharti';
import { NotFoundError } from '@/shared/errors';

export class PgConversationRepository implements IConversationRepository {
  async findById(id: string): Promise<Conversation | null> {
    const { rows } = await query('SELECT * FROM conversations WHERE id = $1 AND deleted_at IS NULL', [id]);
    return rows[0] ? mapConversation(rows[0]) : null;
  }

  async findByClientId(clientId: string): Promise<Conversation | null> {
    const { rows } = await query(
      `SELECT * FROM conversations WHERE client_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [clientId],
    );
    return rows[0] ? mapConversation(rows[0]) : null;
  }

  async findLiveByClientAndAccount(clientId: string, telegramAccountId: string | null): Promise<Conversation | null> {
    // `IS NOT DISTINCT FROM` — akkauntsiz (NULL) suhbat ham solishtirilsin.
    const { rows } = await query(
      `SELECT * FROM conversations
        WHERE client_id = $1 AND telegram_account_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL
        LIMIT 1`,
      [clientId, telegramAccountId],
    );
    return rows[0] ? mapConversation(rows[0]) : null;
  }

  async reassignClient(conversationId: string, clientId: string): Promise<void> {
    await query(
      `UPDATE conversations SET client_id = $2, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL`,
      [conversationId, clientId],
    );
  }

  async yopish(conversationId: string): Promise<void> {
    // Noma'lum suhbat haqiqiy mijozning mavjud suhbatiga qo'shilganda ishlatiladi.
    await query(
      `UPDATE conversations SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
      [conversationId],
    );
  }

  async findByPeer(telegramAccountId: string, peerId: string): Promise<Conversation | null> {
    const { rows } = await query(
      `SELECT * FROM conversations
        WHERE telegram_account_id = $1 AND peer_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [telegramAccountId, peerId],
    );
    return rows[0] ? mapConversation(rows[0]) : null;
  }

  /**
   * Mijozning hozirgi akkaunti bo'yicha tiklaymiz, ixtiyoriy akkaunt
   * bilan emas: "bitta mijoz — bitta akkaunt" qoidasi shu tarzda
   * saqlanadi va suhbat mijozga biriktirilgan raqamdan davom etadi.
   */
  async restoreOrphanedAccounts(): Promise<number> {
    const { rowCount } = await query(
      `UPDATE conversations cv
          SET telegram_account_id = cl.telegram_account_id, updated_at = now()
         FROM clients cl
        WHERE cl.id = cv.client_id
          AND cv.telegram_account_id IS NULL
          AND cl.telegram_account_id IS NOT NULL
          AND cv.deleted_at IS NULL
          AND cl.deleted_at IS NULL`,
    );
    return rowCount ?? 0;
  }

  async list(q: ConversationQuery, qamrov: MijozQamrovi = HAMMASI): Promise<Page<ConversationListItem>> {
    // O'chirilgan suhbat ham, o'chirilgan mijozning suhbati ham ko'rinmaydi.
    const where: string[] = ['cv.deleted_at IS NULL', 'cl.deleted_at IS NULL'];
    const params: unknown[] = [];
    // Obyekt cheklovi. Cheklanmaganda shart QO'SHILMAYDI — SQL aynan avvalgidek.
    // Shartda `NOT cl.nomalum` bor: noma'lumlar cheklanganga ko'rinmaydi.
    if (qamrov.cheklangan) where.push(mijozQamroviSharti(qamrov, 'cl', params));

    if (q.search) {
      params.push(`%${q.search.trim()}%`);
      where.push(`(cl.full_name ILIKE $${params.length} OR cl.phone ILIKE $${params.length})`);
    }
    if (q.state) {
      params.push(q.state);
      where.push(`cv.state = $${params.length}`);
    }
    if (q.stage) {
      params.push(q.stage);
      where.push(`cv.stage = $${params.length}`);
    }
    if (q.needsHuman) where.push('cv.needs_human = TRUE');
    if (q.unreadOnly) where.push('cv.unread_count > 0');
    if (q.objectName) {
      // Mijozning bir nechta shartnomasi bo'lishi mumkin — bittasi shu
      // obyektda bo'lsa yetarli. `EXISTS` qatorni ko'paytirmaydi, JOIN esa
      // ko'paytirardi va ro'yxatda bitta suhbat ikki marta chiqardi.
      params.push(q.objectName);
      where.push(`EXISTS (SELECT 1 FROM contracts ct
                           WHERE ct.client_id = cl.id AND ct.deleted_at IS NULL
                             AND ct.object_name = $${params.length})`);
    }
    if (q.telegramAccountId) {
      params.push(q.telegramAccountId);
      where.push(`cv.telegram_account_id = $${params.length}`);
    }
    if (q.clientId) {
      params.push(q.clientId);
      where.push(`cv.client_id = $${params.length}`);
    }
    if (q.blocked) where.push(`cl.telegram_status = 'blocked'`);
    // Noma'lum mijozlar oddiy ro'yxatda ham ko'rinadi (belgi bilan); bu filtr faqat ularni ajratadi.
    if (q.nomalum) where.push('cl.nomalum');
    // "Chek keldi": tugma ko'rinadigan (ochiq, muddat ichidagi) chek tekshiruvi bor suhbatlar.
    if (q.receiptPending) {
      where.push(`EXISTS (SELECT 1 FROM payment_checks pc
                           WHERE pc.conversation_id = cv.id AND pc.status = 'reviewing'
                             AND pc.created_at > now() - interval '${CHEK_TEKSHIRUVI_MUDDATI_KUNLAR} days')`);
    }

    const limit = Math.min(q.limit ?? 50, 200);
    const offset = q.offset ?? 0;

    const base = `
      FROM conversations cv
      JOIN clients cl ON cl.id = cv.client_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(ct.debt_monthly), 0) AS debt_monthly,
               COALESCE(SUM(ct.debt_total), 0) AS debt_total,
               COALESCE(MAX(ct.days_overdue), 0) AS days_overdue
          FROM contracts ct WHERE ct.client_id = cl.id AND ct.deleted_at IS NULL
      ) agg ON TRUE
      LEFT JOIN LATERAL (
        SELECT m.body, m.direction FROM messages m
         -- Operator topshirig'i (note) mijoz bilan yozishma emas — ro'yxatda
         -- "Siz: …" bo'lib oxirgi xabar o'rnida turmasin.
         WHERE m.conversation_id = cv.id AND m.deleted_at IS NULL AND m.direction <> 'note'
         ORDER BY m.created_at DESC LIMIT 1
      ) lm ON TRUE
      WHERE ${where.join(' AND ')}
    `;

    const [{ rows: countRows }, { rows }] = await Promise.all([
      query<{ count: number }>(`SELECT COUNT(*)::int AS count ${base}`, params),
      query(
        `SELECT cv.*, cl.full_name, cl.phone, cl.nomalum, agg.debt_monthly, agg.debt_total, agg.days_overdue,
                lm.body AS last_body, lm.direction AS last_direction
         ${base}
         -- Faqat vaqt bo'yicha (2026-09-15): "Inson kerak" suhbatlari tepaga
         -- qotib qolmaydi — operatorlar ularni ro'yxat boshida doim turgani
         -- uchun yangi xabarlarni pastda ko'rmay qolardi. Ularni alohida ko'rish
         -- uchun "Inson kerak" filtri bor. "cv.id" — oxirgi teng qiymatlar
         -- orasida tartib barqaror bo'lsin, aks holda sahifalar orasida
         -- suhbat tushib qolishi yoki takrorlanishi mumkin.
         ORDER BY cv.last_message_at DESC NULLS LAST, cv.created_at DESC, cv.id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
    ]);

    const items: ConversationListItem[] = rows.map((r) => ({
      conversation: mapConversation(r),
      clientName: r.full_name,
      clientPhone: r.phone ?? null,
      debtMonthly: Number(r.debt_monthly ?? 0),
      debtTotal: Number(r.debt_total ?? 0),
      daysOverdue: Number(r.days_overdue ?? 0),
      lastMessageBody: r.last_body ?? null,
      lastMessageDirection: r.last_direction ?? null,
      nomalum: Boolean(r.nomalum),
    }));

    return { items, total: countRows[0]?.count ?? 0, limit, offset };
  }

  async filterOptions(qamrov: MijozQamrovi = HAMMASI): Promise<ConversationFilterOptions> {
    // Obyekt cheklovi: cheklanmaganda SQL va parametrlar aynan avvalgidek.
    // Cheklanganda ikkala ro'yxat ham faqat ko'rinadigan mijozlar suhbatlaridan
    // (mijoz darajasida: ko'rinadigan mijozning boshqa obyektdagi shartnomasi ham).
    const obyektParams: unknown[] = [];
    const obyektSharti = qamrov.cheklangan ? ` AND ${mijozQamroviSharti(qamrov, 'cl', obyektParams)}` : '';
    const akkauntParams: unknown[] = [];
    const akkauntJoin = qamrov.cheklangan
      ? `
           JOIN clients cl ON cl.id = cv.client_id AND cl.deleted_at IS NULL`
      : '';
    const akkauntSharti = qamrov.cheklangan ? ` AND ${mijozQamroviSharti(qamrov, 'cl', akkauntParams)}` : '';

    const [objects, accounts] = await Promise.all([
      query<{ object_name: string }>(
        `SELECT DISTINCT ct.object_name
           FROM conversations cv
           JOIN clients cl ON cl.id = cv.client_id AND cl.deleted_at IS NULL
           JOIN contracts ct ON ct.client_id = cl.id AND ct.deleted_at IS NULL
          WHERE cv.deleted_at IS NULL AND ct.object_name IS NOT NULL${obyektSharti}
          ORDER BY 1`,
        obyektParams,
      ),
      // Akkaunt o'chirilgan bo'lsa ham suhbatlari qoladi; JOIN bunday
      // qatorni tashlab ketadi, ya'ni ro'yxatda faqat tanlash mumkin
      // bo'lganlari turadi.
      query<{ id: string; label: string }>(
        `SELECT DISTINCT ta.id, ta.label
           FROM conversations cv
           JOIN telegram_accounts ta ON ta.id = cv.telegram_account_id${akkauntJoin}
          WHERE cv.deleted_at IS NULL${akkauntSharti}
          ORDER BY ta.label`,
        akkauntParams,
      ),
    ]);

    return {
      objects: objects.rows.map((r) => r.object_name),
      accounts: accounts.rows.map((r) => ({ id: r.id, label: r.label })),
    };
  }

  async create(data: {
    clientId: string;
    telegramAccountId?: string | null;
    stage: EscalationStage;
  }): Promise<Conversation> {
    const { rows } = await query(
      `INSERT INTO conversations (client_id, telegram_account_id, stage)
       VALUES ($1, $2, $3)
       -- Unique indeks endi qisman (faqat tirik suhbatlar), shuning uchun
       -- ON CONFLICT ga ham o'sha shart yozilishi shart — aks holda
       -- Postgres indeksni topa olmay xato beradi.
       ON CONFLICT (client_id, telegram_account_id) WHERE deleted_at IS NULL
         DO UPDATE SET stage = EXCLUDED.stage
       RETURNING *`,
      [data.clientId, data.telegramAccountId ?? null, data.stage],
    );
    return mapConversation(rows[0]!);
  }

  async update(id: string, patch: ConversationPatch): Promise<Conversation> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, value: unknown) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };

    if (patch.state !== undefined) push('state', patch.state);
    if (patch.stage !== undefined) push('stage', patch.stage);
    if (patch.agentEnabled !== undefined) push('agent_enabled', patch.agentEnabled);
    if (patch.needsHuman !== undefined) push('needs_human', patch.needsHuman);
    if (patch.humanReason !== undefined) push('human_reason', patch.humanReason);
    // `human_kind` bog'liqligi ikki tomonlama bo'lishi kerak: bayroq
    // TUSHGANDA ham, boshqa manbadan (masalan `PromiseWatcher`,
    // `PaymentCheckService`, `HandleIncomingMessageUseCase`) QAYTA
    // qo'yilganda ham turi oshkora berilmasa tozalanadi. Aks holda eski
    // 'agent_error' yangi sababning ustida qolib ketardi — operator
    // "Agent to'xtab qoldi: <buzilgan va'da matni>" degan yolg'on bannerni
    // va tegishli bo'lmagan "Qayta urinish" tugmasini ko'rardi.
    //
    // `else if` shart: bitta ustunni ikki marta `SET` qilib bo'lmaydi
    // ("multiple assignments to same column").
    if (patch.humanKind !== undefined) push('human_kind', patch.humanKind);
    else if (patch.needsHuman !== undefined) push('human_kind', null);
    if (patch.agentSessionId !== undefined) push('agent_session_id', patch.agentSessionId);
    if (patch.summary !== undefined) push('summary', patch.summary);
    if (patch.telegramAccountId !== undefined) push('telegram_account_id', patch.telegramAccountId);
    if (patch.peerId !== undefined) push('peer_id', patch.peerId);
    if (patch.peerAccessHash !== undefined) push('peer_access_hash', patch.peerAccessHash);

    if (!sets.length) {
      const current = await this.findById(id);
      if (!current) throw new NotFoundError('Suhbat', id);
      return current;
    }

    params.push(id);
    const { rows } = await query(
      `UPDATE conversations SET ${sets.join(', ')}
        WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('Suhbat', id);
    return mapConversation(rows[0]);
  }

  async touchInbound(id: string, at: Date): Promise<void> {
    // `nudge_count` shu yerda nolga qaytadi: mijozning har qanday javobi
    // sukut zanjirini uzadi. Alohida metod qilinmadi — inbound yozuvi
    // butun tizimda faqat shu yerdan o'tadi, ya'ni ikkinchi chaqiruv
    // joyi unutilib qolishi mumkin bo'lgan yagona xato manbai bo'lardi.
    await query(
      `UPDATE conversations
          SET last_message_at = $2, last_inbound_at = $2,
              unread_count = unread_count + 1, nudge_count = 0
        WHERE id = $1`,
      [id, at],
    );
  }

  async touchOutbound(id: string, at: Date): Promise<void> {
    await query(
      `UPDATE conversations SET last_message_at = $2, last_outbound_at = $2 WHERE id = $1`,
      [id, at],
    );
  }

  async findEslatmaNomzodlari(limit: number): Promise<EslatmaNomzodi[]> {
    const { rows } = await query(
      `SELECT c.id AS conversation_id, c.client_id, p.id AS purchase_id, p.stage,
              p.reminded_stages, c.last_outbound_at, c.last_inbound_at
         FROM conversations c
         JOIN clients cl ON cl.id = c.client_id
         JOIN purchases p ON p.client_id = c.client_id
        WHERE c.deleted_at IS NULL
          AND p.stage = ANY($2::text[])
          AND NOT (p.stage = ANY(p.reminded_stages))
          AND c.last_outbound_at IS NOT NULL
          AND (c.last_inbound_at IS NULL OR c.last_inbound_at < c.last_outbound_at)
          AND c.agent_enabled
          AND NOT c.needs_human
          AND cl.telegram_status NOT IN ('blocked', 'deactivated')
          AND NOT EXISTS (
            SELECT 1 FROM payment_checks pc
             WHERE pc.conversation_id = c.id AND pc.status = 'reviewing'
          )
        ORDER BY c.last_outbound_at ASC
        LIMIT $1`,
      [limit, ['qiziqdi', 'karta_yuborildi']],
    );
    return rows.map((r) => ({
      conversationId: r.conversation_id as string,
      clientId: r.client_id as string,
      purchaseId: r.purchase_id as string,
      stage: r.stage as XaridBosqichi,
      remindedStages: (r.reminded_stages ?? []) as XaridBosqichi[],
      lastOutboundAt: r.last_outbound_at as Date,
      lastInboundAt: (r.last_inbound_at as Date | null) ?? null,
    }));
  }

  async markRead(id: string): Promise<void> {
    await query('UPDATE conversations SET unread_count = 0 WHERE id = $1', [id]);
  }

  /**
   * Barcha yozishmalarni tozalaydi — sinovni noldan boshlash uchun.
   *
   * O'CHIRISH YUMSHOQ: suhbatlar, xabarlar, to'lov va'dalari va mijoz
   * profillari `deleted_at` bilan belgilanadi, bazadan yo'qolmaydi
   * (032-migratsiya izohiga qarang). Ya'ni "tozalash" — ro'yxatlarni
   * bo'shatish, tarixni yo'q qilish emas.
   *
   * MIJOZLAR VA SHARTNOMALAR QOLADI: import qayta bajarilmasin. Agentning
   * qoidalari va saboqlari ham tegilmaydi (011-migratsiya izohiga qarang).
   *
   * `resetCampaigns` yoqilsa, kampaniya nishonlari "pending" holatiga
   * qaytariladi va tugagan kampaniyalar qayta ishga tushadi — aks holda
   * o'sha mijozlarga ikkinchi marta xabar ketmaydi.
   */
  async resetAll(options: { resetCampaigns: boolean }): Promise<ResetSummary> {
    return withTransaction(async (client) => {
      const counted = await query<{
        conversations: string;
        messages: string;
        promises: string;
        profiles: string;
      }>(
        `SELECT (SELECT COUNT(*) FROM conversations    WHERE deleted_at IS NULL) AS conversations,
                (SELECT COUNT(*) FROM messages         WHERE deleted_at IS NULL) AS messages,
                (SELECT COUNT(*) FROM payment_promises WHERE deleted_at IS NULL) AS promises,
                (SELECT COUNT(*) FROM client_profiles  WHERE deleted_at IS NULL) AS profiles`,
        [],
        client,
      );
      const before = counted.rows[0]!;

      // Bitta vaqt belgisi — bu tozalash partiyasini keyin ajratib olish mumkin.
      // CASCADE endi ishlamaydi (hech narsa DELETE qilinmayapti), shuning
      // uchun bolalarni ham o'zimiz belgilaymiz.
      await query(
        `UPDATE messages SET deleted_at = now()
          WHERE deleted_at IS NULL
            AND conversation_id IN (SELECT id FROM conversations WHERE deleted_at IS NULL)`,
        [],
        client,
      );
      await query(
        'UPDATE payment_promises SET deleted_at = now() WHERE deleted_at IS NULL',
        [],
        client,
      );
      await query('UPDATE conversations SET deleted_at = now() WHERE deleted_at IS NULL', [], client);
      // Agentning shu mijoz haqidagi xotirasi ham tozalanadi — aks holda
      // yangi suhbat eski taassurot bilan boshlanadi.
      await query('UPDATE client_profiles SET deleted_at = now() WHERE deleted_at IS NULL', [], client);

      let targets = 0;
      if (options.resetCampaigns) {
        const reset = await query(
          `UPDATE campaign_targets
              SET state = 'pending', conversation_id = NULL, sent_at = NULL,
                  attempts = 0, skip_reason = NULL
            WHERE state <> 'pending'`,
          [],
          client,
        );
        targets = reset.rowCount ?? 0;

        await query(
          `UPDATE campaigns
              SET status = 'running', completed_at = NULL
            WHERE status = 'completed'`,
          [],
          client,
        );
      }

      return {
        conversations: Number(before.conversations),
        messages: Number(before.messages),
        promises: Number(before.promises),
        profiles: Number(before.profiles),
        campaignTargets: targets,
      };
    });
  }
}
