import type { TelegramPeerKind } from '@/domain/services/ITelegramGateway';

/** Telegram'ning xizmat hisobi (kod yuboradi, kirishlar haqida xabar beradi). */
const TELEGRAM_XIZMAT_ID = '777000';

/**
 * Kiruvchi xabar agentga o'tishi mumkinmi: faqat shaxsiy chatdagi haqiqiy
 * (bot emas, 777000 emas) foydalanuvchi. Guruh va kanal xabari DM sifatida
 * agentga yetib bormasligi shart.
 */
export function kiruvchigaQabul(i: {
  peerKind: TelegramPeerKind;
  senderIsUser: boolean;
  senderIsBot: boolean;
  senderId: string;
}): boolean {
  if (i.peerKind !== 'user') return false;
  if (!i.senderIsUser || i.senderIsBot) return false;
  return i.senderId !== TELEGRAM_XIZMAT_ID;
}
