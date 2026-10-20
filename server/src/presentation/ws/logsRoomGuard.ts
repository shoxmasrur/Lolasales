import { can, isLocked } from '@/domain/entities/User';
import type { User } from '@/domain/entities/User';

export interface LogsRoomMember {
  socketId: string;
  userId: string | undefined;
}

export interface LogsRoomAccess {
  /** Hozir ham `logs.view`ga ega — qatorni yetkazish mumkin. */
  authorized: string[];
  /** Ruxsat yo'q, hisob o'chirilgan yoki bloklangan — xonadan chiqarilishi kerak. */
  unauthorized: string[];
  /**
   * `loadUser` yiqildi — ruxsat holatini ANIQLAB BO'LMADI (masalan, Postgres
   * vaqtincha to'yingan yoki ulanish qayta ishga tushirilgandan keyin
   * eskirgan). Bu qator yetkazilmaydi (yetkazishda xato bo'lsa yopiq
   * qolamiz), LEKIN socket xonadan chiqarilmaydi: bazaning vaqtinchalik
   * nosozligi ruxsat bekor qilinganiga dalil emas. Keyingi qatorda qayta
   * urinib ko'riladi — baza tiklangach, operator hech narsa qilmasdan
   * qatorlarni olishni davom ettiradi (aks holda 2-topilma boshqa yo'l
   * bilan qaytadi: socket ulangan ko'rinadi, lekin qatorlar kelmay qoladi).
   */
  indeterminate: string[];
}

/**
 * `logs` xonasidagi har bir socket uchun `logs.view` ruxsatini QAYTA
 * tekshiradi — har bir jurnal qatori yetkazilishidan OLDIN, faqat
 * obuna paytidagi holatga tayanmasdan.
 *
 * NEGA: socket soatlab, hatto kunlab ochiq turishi mumkin. Bu orada
 * administrator foydalanuvchining `logs.view` ruxsatini olib qo'yishi,
 * hisobini bloklashi yoki o'chirishi mumkin. `GET /api/logs` bunday
 * o'zgarishni `AuthContext` keshi (15s) tugaganidan keyin darhol ko'radi,
 * lekin xonaga bir marta qo'shilib qolgan socket bundan mutlaqo ta'sirlanmas
 * edi — mijoz ismi, shartnoma raqami va telefon raqamini o'z ichiga olgan
 * qatorlar soatlab kelib turaverardi. `loadUser` sifatida `AuthContext.
 * loadUser` beriladi — u ham xuddi shu qisqa muddatli keshdan foydalanadi,
 * shuning uchun bu tekshiruv har bir hodisada bazaga urmaydi.
 */
export async function checkLogsRoomAccess(
  members: LogsRoomMember[],
  loadUser: (userId: string) => Promise<User | null>,
): Promise<LogsRoomAccess> {
  const authorized: string[] = [];
  const unauthorized: string[] = [];
  const indeterminate: string[] = [];

  await Promise.all(
    members.map(async ({ socketId, userId }) => {
      if (!userId) {
        unauthorized.push(socketId);
        return;
      }
      let user: User | null;
      try {
        user = await loadUser(userId);
      } catch {
        // Yiqilish — bu "ruxsat yo'q" degani emas, balki "bila olmadik"
        // degani. Chaqiruvchi bu qatorni hali ham yetkazmaydi (fail-closed),
        // lekin socketni xonada saqlab qoladi.
        indeterminate.push(socketId);
        return;
      }
      // can() faqat isActive va rolni tekshiradi, lockedAt'ni emas —
      // isLocked alohida tekshiriladi (auth.ts va logs:subscribe
      // bilan bir xil qoida).
      if (user && can(user, 'logs.view') && !isLocked(user)) {
        authorized.push(socketId);
      } else {
        unauthorized.push(socketId);
      }
    }),
  );

  return { authorized, unauthorized, indeterminate };
}
