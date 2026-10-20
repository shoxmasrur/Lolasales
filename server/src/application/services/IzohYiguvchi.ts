import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type {
  ChannelComment,
  ChannelInfo,
  ChannelPost,
  ITelegramGateway,
  ResolvedPeer,
  TelegramPeerRef,
} from '@/domain/services/ITelegramGateway';
import type { IClock } from '@/domain/services/support';
import { izohlarniAjrat, type AjratilganIzoh } from '@/domain/services/izohFiltri';
import type { MijozYaratuvchi } from '@/application/services/MijozYaratuvchi';
import type { CreateCampaignUseCase } from '@/application/usecases/campaigns/CreateCampaignUseCase';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { AppError, NotFoundError, TelegramError } from '@/shared/errors';

export interface IzohlarNatijasi {
  readonly items: AjratilganIzoh[];
  /**
   * Telegram FLOOD_WAIT bergani uchun yig'ish erta to'xtadi — `items`
   * to'liq emas. Xato bilan yiqilmaymiz: yig'ilgani ham foydali.
   */
  readonly partial: { readonly reason: string; readonly retryAfterSec: number | null } | null;
}

export interface IzohQatori {
  readonly peer: ResolvedPeer;
  readonly fullName: string;
  readonly text: string;
}

/** "Hammasi" tanlanganda ko'riladigan postlar soni. */
const POST_LIMITI = 100;
/** `source_comment` ga yoziladigan izoh uzunligi. */
const IZOH_UZUNLIGI = 1000;

/**
 * Kanal izohlaridan mijoz olish.
 *
 * Faqat O'QIYDI: kanal va muhokama guruhiga hech narsa yozilmaydi. Leadga
 * birinchi xabar kampaniya orqali, shaxsiy chatda va barcha yuborish
 * limitlariga amal qilgan holda ketadi.
 */
export class IzohYiguvchi {
  constructor(
    private readonly telegram: Pick<ITelegramGateway, 'listDialogs' | 'listCommentChannels' | 'listChannelPosts' | 'getComments'>,
    private readonly clients: Pick<IClientRepository, 'existingTelegramUserIds'>,
    private readonly mijoz: Pick<MijozYaratuvchi, 'guruhdan'>,
    private readonly campaigns: Pick<CreateCampaignUseCase, 'execute'>,
    private readonly settings: Pick<RuntimeSettings, 'get'>,
    private readonly audit: IAuditRepository,
    private readonly clock: IClock,
  ) {}

  kanallar(accountId: string): Promise<ChannelInfo[]> {
    return this.telegram.listCommentChannels(accountId);
  }

  async postlar(accountId: string, channelId: string, sinceDays: number | null): Promise<ChannelPost[]> {
    const kanal = await this.kanalPeer(accountId, channelId);
    return this.telegram.listChannelPosts(accountId, kanal, {
      limit: POST_LIMITI,
      ...(sinceDays ? { sinceDays } : {}),
    });
  }

  async kommentlar(
    accountId: string,
    channelId: string,
    postIds: number[] | 'all',
    sinceDays: number | null,
    filtrsiz: boolean,
  ): Promise<IzohlarNatijasi> {
    const runtime = await this.settings.get();
    const kanal = await this.kanalPeer(accountId, channelId);

    const idlar = postIds === 'all'
      ? (await this.telegram.listChannelPosts(accountId, kanal, {
          limit: POST_LIMITI,
          ...(sinceDays ? { sinceDays } : {}),
        }))
          .filter((p) => p.repliesCount > 0)
          .map((p) => p.id)
      : postIds;

    // Umumiy chegara — barcha postlar bo'yicha jami (akkauntni himoya qiladi).
    let qolgan = runtime.izohLimit;
    const izohlar: ChannelComment[] = [];
    let partial: IzohlarNatijasi['partial'] = null;

    for (const postId of idlar) {
      if (qolgan <= 0) break;
      try {
        const r = await this.telegram.getComments(accountId, kanal, postId, { limit: qolgan });
        izohlar.push(...r);
        qolgan -= r.length;
        if (r.partial) {
          partial = r.partial;
          break;
        }
      } catch (err) {
        if (err instanceof TelegramError && err.telegramCode === 'FLOOD_WAIT' && izohlar.length) {
          partial = { reason: err.message, retryAfterSec: err.retryAfterSec ?? null };
          break;
        }
        throw err;
      }
    }

    const userIds = [...new Set(
      izohlar.flatMap((c) => (c.author.kind === 'user' ? [c.author.peer.telegramUserId] : [])),
    )];
    const mavjud = await this.clients.existingTelegramUserIds(userIds);
    const items = izohlarniAjrat(izohlar, filtrsiz ? null : runtime.izohKalitSozlari, mavjud);
    return { items, partial };
  }

  async mijozQil(
    accountId: string,
    channelTitle: string,
    items: IzohQatori[],
    by: string,
    userId: string | null = null,
  ): Promise<{ created: number; existing: number; campaignId: string | null }> {
    const yangilar: string[] = [];
    let existing = 0;

    for (const item of items) {
      if (!item.peer.accessHash) {
        throw new AppError('Bu odamga shaxsiy xabar yozib bo\'lmaydi', 422, 'NO_ACCESS_HASH');
      }
    }

    for (const item of items) {
      // Hash shu akkaunt O'QIGAN javobdan — mijoz ham shu akkauntga biriktiriladi.
      const { client, created } = await this.mijoz.guruhdan({
        accountId,
        peer: item.peer,
        fullName: item.fullName,
        sourceGroup: channelTitle,
        sourceComment: item.text.slice(0, IZOH_UZUNLIGI),
      });
      if (created) yangilar.push(client.id);
      else existing += 1;
    }

    let campaignId: string | null = null;
    if (yangilar.length) {
      const { campaign } = await this.campaigns.execute({
        name: `Kanal: ${channelTitle} — ${this.clock.todayIso()}`,
        filters: { clientIds: yangilar, limit: yangilar.length },
        userId,
        userEmail: by,
        startNow: true,
      });
      campaignId = campaign.id;
    }

    await this.audit.record({
      actor: by,
      action: 'comments.imported',
      entity: 'telegram_account',
      entityId: accountId,
      payload: { channelTitle, created: yangilar.length, existing, campaignId },
    });

    return { created: yangilar.length, existing, campaignId };
  }

  /** Kanalning access_hash'i akkaunt dialoglaridan olinadi (bitta so'rov). */
  private async kanalPeer(accountId: string, channelId: string): Promise<TelegramPeerRef> {
    const dialogs = await this.telegram.listDialogs(accountId, { limit: 300 });
    const d = dialogs.find((x) => x.kind === 'channel' && x.peerId === channelId);
    if (!d) throw new NotFoundError('Kanal', channelId);
    return { peerId: d.peerId, accessHash: d.accessHash, kind: 'channel' };
  }
}
