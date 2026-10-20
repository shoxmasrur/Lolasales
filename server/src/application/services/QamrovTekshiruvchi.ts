import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import type { IQamrovRepository } from '@/domain/repositories/IQamrovRepository';
import { NotFoundError } from '@/shared/errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Obyekt cheklovi guard'i: bitta yozuv bo'yicha amaldan oldin chaqiriladi.
 *
 * Cheklanmagan qamrovda darhol qaytadi — bazaga so'rov yo'q, xatti-harakat
 * aynan o'zgarmaydi. Cheklanganda yozuv ko'rinmasa `NotFoundError` (404,
 * 403 emas — begona yozuv borligi oshkor qilinmaydi). Yaroqsiz uuid ham
 * 404: SQL'ga yetmaydi (`::uuid` xatosi 500 bermasin).
 */
export class QamrovTekshiruvchi {
  constructor(private readonly repo: IQamrovRepository) {}

  mijoz(q: MijozQamrovi, clientId: string): Promise<void> {
    return this.bitta(q, clientId, 'Mijoz', (id) => this.repo.mijozQamrovdaMi(q, id));
  }

  suhbat(q: MijozQamrovi, conversationId: string): Promise<void> {
    return this.bitta(q, conversationId, 'Suhbat', (id) => this.repo.suhbatQamrovdaMi(q, id));
  }

  xabar(q: MijozQamrovi, messageId: string): Promise<void> {
    return this.bitta(q, messageId, 'Xabar', (id) => this.repo.xabarQamrovdaMi(q, id));
  }

  shartnoma(q: MijozQamrovi, contractId: string): Promise<void> {
    return this.bitta(q, contractId, 'Shartnoma', (id) => this.repo.shartnomaQamrovdaMi(q, id));
  }

  talabnoma(q: MijozQamrovi, id: string): Promise<void> {
    return this.bitta(q, id, 'Talabnoma', (x) => this.repo.talabnomaQamrovdaMi(q, x));
  }

  async shartnomaRaqami(q: MijozQamrovi, contractNo: string): Promise<void> {
    if (!q.cheklangan) return;
    const raqam = contractNo.trim();
    if (raqam === '' || !(await this.repo.shartnomaRaqamiQamrovdaMi(q, raqam))) {
      throw new NotFoundError('Shartnoma');
    }
  }

  /** So'rovdagi mijoz id'laridan faqat qamrovdagilari; kirish tartibi (va takrorlar) saqlanadi. */
  idlarniKesish(q: MijozQamrovi, clientIds: string[]): Promise<string[]> {
    return this.kesish(q, clientIds, (ids) => this.repo.qamrovdagiMijozlar(q, ids));
  }

  /** So'rovdagi suhbat id'laridan faqat qamrovdagilari; kirish tartibi saqlanadi. */
  suhbatIdlarniKesish(q: MijozQamrovi, conversationIds: string[]): Promise<string[]> {
    return this.kesish(q, conversationIds, (ids) => this.repo.qamrovdagiSuhbatlar(q, ids));
  }

  private async bitta(
    q: MijozQamrovi, id: string, nom: string, bormi: (id: string) => Promise<boolean>,
  ): Promise<void> {
    if (!q.cheklangan) return;
    if (!UUID.test(id) || !(await bormi(id))) throw new NotFoundError(nom);
  }

  private async kesish(
    q: MijozQamrovi, ids: string[], qamrovdagi: (ids: string[]) => Promise<string[]>,
  ): Promise<string[]> {
    if (!q.cheklangan) return ids;
    const yaroqli = ids.filter((id) => UUID.test(id));
    const takrorsiz = [...new Set(yaroqli.map((id) => id.toLowerCase()))];
    if (takrorsiz.length === 0) return [];
    const bor = new Set((await qamrovdagi(takrorsiz)).map((id) => id.toLowerCase()));
    return yaroqli.filter((id) => bor.has(id.toLowerCase()));
  }
}
