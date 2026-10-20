import type { NomalumHolat, NomalumSuhbat } from '@/domain/entities/NomalumSuhbat';
import type { INomalumSuhbatRepository } from '@/domain/repositories/INomalumSuhbatRepository';
import { query } from '@/infrastructure/db/pool';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function map(r: Row): NomalumSuhbat {
  return {
    conversationId: r.conversation_id,
    holat: r.holat,
    agentJavoblari: Number(r.agent_javoblari),
    urinishlar: Number(r.urinishlar),
    topilmagan: Number(r.topilmagan ?? 0),
    shartnomaRaqami: r.shartnoma_raqami ?? null,
    topilganClientId: r.topilgan_client_id ?? null,
    telegramTelefon: r.telegram_telefon ?? null,
    sabab: r.sabab ?? null,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

const USTUN: Record<string, string> = {
  holat: 'holat', agentJavoblari: 'agent_javoblari', urinishlar: 'urinishlar', topilmagan: 'topilmagan',
  shartnomaRaqami: 'shartnoma_raqami', topilganClientId: 'topilgan_client_id', sabab: 'sabab',
};

export class PgNomalumSuhbatRepository implements INomalumSuhbatRepository {
  async ensure(conversationId: string, telegramTelefon: string | null = null): Promise<NomalumSuhbat> {
    // Telefon keyingi xabarda paydo bo'lishi mumkin (odam raqamini ochdi) —
    // borini o'chirmaymiz, yangisi bo'lsa yozamiz.
    const { rows } = await query(
      `INSERT INTO nomalum_suhbatlar (conversation_id, telegram_telefon) VALUES ($1, $2)
       ON CONFLICT (conversation_id) DO UPDATE
         SET telegram_telefon = COALESCE(EXCLUDED.telegram_telefon, nomalum_suhbatlar.telegram_telefon)
       RETURNING *`,
      [conversationId, telegramTelefon],
    );
    return map(rows[0]!);
  }

  async find(conversationId: string): Promise<NomalumSuhbat | null> {
    const { rows } = await query('SELECT * FROM nomalum_suhbatlar WHERE conversation_id = $1', [conversationId]);
    return rows[0] ? map(rows[0]) : null;
  }

  async update(conversationId: string, patch: Parameters<INomalumSuhbatRepository['update']>[1]): Promise<NomalumSuhbat> {
    const sets: string[] = [];
    const values: unknown[] = [conversationId];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || !USTUN[k]) continue;
      values.push(v);
      sets.push(`${USTUN[k]} = $${values.length}`);
    }
    sets.push('updated_at = now()');
    const { rows } = await query(
      `UPDATE nomalum_suhbatlar SET ${sets.join(', ')} WHERE conversation_id = $1 RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error(`nomalum_suhbatlar qatori yo'q: ${conversationId}`);
    return map(rows[0]);
  }

  async holatniAlmashtir(conversationId: string, eski: NomalumHolat, yangi: NomalumHolat): Promise<boolean> {
    // Shart WHERE ichida: tekshiruv va yozish bitta atomar UPDATE — poygada
    // ikkinchi chaqiruv 0 qator oladi.
    const { rows } = await query(
      `UPDATE nomalum_suhbatlar SET holat = $3, updated_at = now()
        WHERE conversation_id = $1 AND holat = $2 RETURNING 1`,
      [conversationId, eski, yangi],
    );
    return rows.length > 0;
  }
}
