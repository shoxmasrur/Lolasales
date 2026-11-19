import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { ITelegramGateway } from '@/domain/services/ITelegramGateway';
import type { HamyonTushum } from '@/domain/services/hamyonMosligi';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { childLogger } from '@/shared/logger';

const log = childLogger('hamyoncha');

const BOT_USERNAME = 'hamyoncha_finance_bot';
const BAZA = 'https://webapp.hamyoncha.uz/api';
const SAHIFA = 100;
const MAX_SAHIFA = 5;
const TIMEOUT_MS = 20_000;

interface XomTranzaksiya {
  id?: string | number;
  type?: string;
  amount?: number | string;
  date?: string | null;
  created_at?: string | null;
  state?: string;
  currency?: string | null;
}

/**
 * Hamyoncha (@hamyoncha_finance_bot) mini-ilovasidan KIRIM tranzaksiyalarini o'qiydi.
 *
 * Faqat O'QIYDI. Kirish: akkaunt botning mini-ilovasini ochadi (Telegram
 * `initData`), u `POST /users/auth/webapp` orqali qisqa muddatli token beradi.
 *
 * MAXFIYLIK: `initData` va token LOGGA YOZILMAYDI.
 */
export class HamyonKlienti {
  private token: string | null = null;

  constructor(
    private readonly gateway: Pick<ITelegramGateway, 'openWebApp' | 'listDialogs'>,
    private readonly accounts: Pick<ITelegramAccountRepository, 'listConnected'>,
    private readonly settings: Pick<RuntimeSettings, 'get' | 'update'>,
    private readonly http: typeof fetch = fetch,
  ) {}

  /** `from` dan keyingi tasdiqlangan KIRIMlar (so'mda). */
  async kirimlar(from: Date): Promise<HamyonTushum[]> {
    for (let urinish = 0; urinish < 2; urinish += 1) {
      const token = this.token ?? (await this.kirish());
      const natija = await this.oqi(token, from);
      if (natija !== 'avtorizatsiya') return natija;
      this.token = null; // token eskirgan — qayta kiramiz
    }
    throw new Error('Hamyoncha avtorizatsiyasi bajarilmadi');
  }

  private async oqi(token: string, from: Date): Promise<HamyonTushum[] | 'avtorizatsiya'> {
    const chiqish: HamyonTushum[] = [];
    for (let sahifa = 0; sahifa < MAX_SAHIFA; sahifa += 1) {
      const qs = new URLSearchParams({
        type: 'credit',
        state: 'confirmed',
        from: from.toISOString(),
        limit: String(SAHIFA),
        offset: String(sahifa * SAHIFA),
      });
      const r = await this.http(`${BAZA}/transactions?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (r.status === 401) return 'avtorizatsiya';
      if (!r.ok) throw new Error(`Hamyoncha javobi: HTTP ${r.status}`);

      const d = (await r.json()) as { items?: XomTranzaksiya[]; total?: number };
      const items = d.items ?? [];
      for (const i of items) {
        if (i.id === undefined || i.id === null) continue;
        if ((i.currency ?? 'UZS') !== 'UZS') continue;
        const sana = new Date(i.date ?? i.created_at ?? '');
        const summa = Math.abs(Number(i.amount));
        if (Number.isNaN(sana.getTime()) || !Number.isFinite(summa)) continue;
        chiqish.push({ id: String(i.id), amount: summa, date: sana });
      }
      if (items.length < SAHIFA || (d.total !== undefined && (sahifa + 1) * SAHIFA >= d.total)) break;
    }
    return chiqish;
  }

  private async kirish(): Promise<string> {
    const s = await this.settings.get();
    const ulangan = await this.accounts.listConnected();
    const akkaunt = s.hamyonAkkauntId ? ulangan.find((a) => a.id === s.hamyonAkkauntId) : ulangan[0];
    if (!akkaunt) throw new Error("Hamyoncha uchun ulangan Telegram akkaunt yo'q");

    const bot = s.hamyonBot ?? (await this.botniTopish(akkaunt.id));
    const url = await this.gateway.openWebApp(akkaunt.id, { peerId: bot.peerId, accessHash: bot.accessHash, kind: 'user' });
    const initData = new URLSearchParams(new URL(url).hash.slice(1)).get('tgWebAppData');
    if (!initData) throw new Error('Hamyoncha mini-ilovasi initData bermadi');

    const r = await this.http(`${BAZA}/users/auth/webapp`, {
      method: 'POST',
      headers: { Authorization: `tma ${initData}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`Hamyoncha kirishi: HTTP ${r.status}`);
    const token = ((await r.json()) as { token?: string }).token;
    if (!token) throw new Error('Hamyoncha token bermadi');
    this.token = token;
    log.info('Hamyonchaga kirildi');
    return token;
  }

  /** Bot chati akkaunt dialoglaridan bir marta topiladi va saqlanadi. */
  private async botniTopish(accountId: string): Promise<{ peerId: string; accessHash: string }> {
    const dialoglar = await this.gateway.listDialogs(accountId, { limit: 200 });
    const d = dialoglar.find((x) => x.isBot && x.username === BOT_USERNAME);
    if (!d?.accessHash) throw new Error(`@${BOT_USERNAME} chati akkauntda topilmadi — avval botga /start yuboring`);
    const bot = { peerId: d.peerId, accessHash: d.accessHash };
    await this.settings.update({ hamyonBot: bot });
    return bot;
  }
}
