import { Api } from 'teleproto';
import type { TelegramPeerKind } from '@/domain/services/ITelegramGateway';

/** Telegram'ning xizmat hisobi (kod yuboradi, kirishlar haqida xabar beradi). */
const TELEGRAM_XIZMAT_ID = '777000';

/**
 * Kiruvchi xabar agentga o'tishi mumkinmi: faqat shaxsiy chatdagi haqiqiy
 * (bot emas, 777000 emas) foydalanuvchi. Guruh va kanal xabari DM sifatida
 * agentga yetib bormasligi shart.
 */
export function kiruvchigaQabul(i: {
  /** `null` — noma'lum peer turi (rad etiladi). */
  peerKind: TelegramPeerKind | null;
  senderIsUser: boolean;
  senderIsBot: boolean;
  senderId: string;
}): boolean {
  if (i.peerKind !== 'user') return false;
  if (!i.senderIsUser || i.senderIsBot) return false;
  return i.senderId !== TELEGRAM_XIZMAT_ID;
}

/**
 * Peer turi. `user` FAQAT `Api.PeerUser` uchun: noma'lum (kutubxona yangi tur
 * qo'shgan yoki `peerId` yo'q) peer shaxsiy chat deb hisoblanmaydi — `null`,
 * `kiruvchigaQabul` uni rad etadi (agent faqat shaxsiy chatga javob beradi).
 */
export function peerKindOf(peer: Api.TypePeer | undefined): TelegramPeerKind | null {
  if (peer instanceof Api.PeerUser) return 'user';
  if (peer instanceof Api.PeerChat) return 'group';
  if (peer instanceof Api.PeerChannel) return 'channel';
  return null;
}
