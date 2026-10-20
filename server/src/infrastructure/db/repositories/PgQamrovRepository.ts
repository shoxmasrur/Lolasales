import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import type { IQamrovRepository } from '@/domain/repositories/IQamrovRepository';
import { query } from '@/infrastructure/db/pool';
import { mijozQamroviSharti } from '@/infrastructure/db/qamrovSharti';

/**
 * Obyekt cheklovi guard'ining SQL'lari (`QamrovTekshiruvchi`). Har biri —
 * bitta so'rov: yozuv mijozgacha JOIN qilinadi va `mijozQamroviSharti`
 * (`cl` alias) bilan tekshiriladi. `$1` — id, qamrov sharti `$2` dan.
 */
export class PgQamrovRepository implements IQamrovRepository {
  private async bormi(q: MijozQamrovi, from: string, id: string): Promise<boolean> {
    const params: unknown[] = [id];
    const shart = mijozQamroviSharti(q, 'cl', params);
    const { rows } = await query(`SELECT 1 ${from} AND ${shart} LIMIT 1`, params);
    return rows.length > 0;
  }

  mijozQamrovdaMi(q: MijozQamrovi, clientId: string): Promise<boolean> {
    return this.bormi(q, 'FROM clients cl WHERE cl.id = $1::uuid', clientId);
  }

  /** O'chirilgan (yopilgan/birlashtirilgan) suhbat cheklanganga ko'rinmaydi — yopiq holatda yiqiladi. */
  suhbatQamrovdaMi(q: MijozQamrovi, conversationId: string): Promise<boolean> {
    return this.bormi(
      q,
      'FROM conversations cv JOIN clients cl ON cl.id = cv.client_id WHERE cv.id = $1::uuid AND cv.deleted_at IS NULL',
      conversationId,
    );
  }

  /** O'chirilgan xabar yoki o'chirilgan suhbatning xabari cheklanganga ko'rinmaydi. */
  xabarQamrovdaMi(q: MijozQamrovi, messageId: string): Promise<boolean> {
    return this.bormi(
      q,
      `FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
       JOIN clients cl ON cl.id = cv.client_id
       WHERE m.id = $1::uuid AND m.deleted_at IS NULL AND cv.deleted_at IS NULL`,
      messageId,
    );
  }

  /**
   * Mijoz darajasida: shartnoma mijozi ko'rinsa — ko'rinadi (o'chirilgan
   * shartnoma ham, kartadagi kabi). Mijozsiz shartnoma (`client_id` hozir
   * NOT NULL, himoya uchun) — o'z obyekti bo'yicha.
   */
  shartnomaQamrovdaMi(q: MijozQamrovi, contractId: string): Promise<boolean> {
    return this.shartnomaSharti(q, 'ct.id = $1::uuid', contractId);
  }

  shartnomaRaqamiQamrovdaMi(q: MijozQamrovi, contractNo: string): Promise<boolean> {
    return this.shartnomaSharti(q, 'ct.contract_no = $1 AND ct.deleted_at IS NULL', contractNo);
  }

  private async shartnomaSharti(q: MijozQamrovi, qayerda: string, qiymat: string): Promise<boolean> {
    const params: unknown[] = [qiymat];
    const shart = mijozQamroviSharti(q, 'cl', params);
    const obyekt = q.cheklangan ? `trim(ct.object_name) = ANY($${params.length}::text[])` : 'TRUE';
    const { rows } = await query(
      `SELECT 1 FROM contracts ct LEFT JOIN clients cl ON cl.id = ct.client_id
        WHERE ${qayerda}
          AND ((cl.id IS NOT NULL AND ${shart}) OR (cl.id IS NULL AND ${obyekt}))
        LIMIT 1`,
      params,
    );
    return rows.length > 0;
  }

  talabnomaQamrovdaMi(q: MijozQamrovi, talabnomaId: string): Promise<boolean> {
    return this.bormi(q, 'FROM talabnomalar t JOIN clients cl ON cl.id = t.client_id WHERE t.id = $1::uuid', talabnomaId);
  }

  async qamrovdagiMijozlar(q: MijozQamrovi, clientIds: string[]): Promise<string[]> {
    const params: unknown[] = [clientIds];
    const shart = mijozQamroviSharti(q, 'cl', params);
    const { rows } = await query<{ id: string }>(
      `SELECT cl.id FROM clients cl WHERE cl.id = ANY($1::uuid[]) AND ${shart}`,
      params,
    );
    return rows.map((r) => r.id);
  }

  /** O'chirilgan suhbat ommaviy amalga o'tmaydi — `suhbatQamrovdaMi` bilan bir xil, yopiq holatda yiqiladi. */
  async qamrovdagiSuhbatlar(q: MijozQamrovi, conversationIds: string[]): Promise<string[]> {
    const params: unknown[] = [conversationIds];
    const shart = mijozQamroviSharti(q, 'cl', params);
    const { rows } = await query<{ id: string }>(
      `SELECT cv.id FROM conversations cv JOIN clients cl ON cl.id = cv.client_id
        WHERE cv.id = ANY($1::uuid[]) AND cv.deleted_at IS NULL AND ${shart}`,
      params,
    );
    return rows.map((r) => r.id);
  }
}
