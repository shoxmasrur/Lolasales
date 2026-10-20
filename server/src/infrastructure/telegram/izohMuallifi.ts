import type { CommentAuthor } from '@/domain/services/ITelegramGateway';

/**
 * `messages.getReplies` javobidagi foydalanuvchi — MTProto turidan
 * ajratilgan (bazasiz va kutubxonasiz test uchun).
 */
export interface IzohUser {
  id: string;
  /** `min` foydalanuvchida null: uning hash'i bilan shaxsiy xabar yozib bo'lmaydi. */
  accessHash: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  bot: boolean;
}

export type IzohFromId = { kind: 'user' | 'channel' | 'none'; id: string };

/**
 * Izoh muallifini aniqlaydi.
 *
 * - foydalanuvchi → `user` (access_hash O'QIGAN akkauntniki — faqat u yoza oladi);
 * - kanal/guruh nomidan → `anonim` (kanal nomi bilan);
 * - `fromId` yo'q yoki foydalanuvchi javobda yo'q → `anonim` "Anonim";
 * - bot → `null` (izoh ro'yxatiga umuman tushmaydi).
 */
export function izohMuallifi(
  fromId: IzohFromId,
  users: Map<string, IzohUser>,
  chats: Map<string, { title: string }>,
): CommentAuthor | null {
  if (fromId.kind === 'channel') {
    return { kind: 'anonim', title: chats.get(fromId.id)?.title || 'Anonim' };
  }
  if (fromId.kind === 'none') return { kind: 'anonim', title: 'Anonim' };

  const u = users.get(fromId.id);
  if (!u) return { kind: 'anonim', title: 'Anonim' };
  if (u.bot) return null;

  const ism = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return {
    kind: 'user',
    peer: {
      telegramUserId: u.id,
      accessHash: u.accessHash,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
    },
    fullName: ism || (u.username ? `@${u.username}` : 'Telegram foydalanuvchisi'),
  };
}
