import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import type { Container } from '@/composition/container';
import { can, isLocked } from '@/domain/entities/User';
import { checkLogsRoomAccess } from '@/presentation/ws/logsRoomGuard';
import { config } from '@/shared/config';
import { childLogger } from '@/shared/logger';

const log = childLogger('ws');

/**
 * Dashboard real vaqtda yangilanishi uchun: yangi xabar, suhbat holati,
 * kampaniya progressi, agentning "yozmoqda" indikatori.
 */
export function createSocketServer(httpServer: HttpServer, container: Container): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: { origin: config.WEB_ORIGIN.split(',').map((o) => o.trim()), credentials: true },
    path: '/socket.io',
  });

  // Socket ham JWT bilan himoyalanadi — API bilan bir xil token.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Token yo\'q'));
      return;
    }
    try {
      const payload = container.tokens.verify(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Token yaroqsiz'));
    }
  });

  io.on('connection', (socket) => {
    log.debug({ user: socket.data.user?.email }, 'Dashboard ulandi');

    socket.on('conversation:open', (conversationId: string) => {
      if (typeof conversationId === 'string') void socket.join(`conv:${conversationId}`);
    });
    socket.on('conversation:close', (conversationId: string) => {
      if (typeof conversationId === 'string') void socket.leave(`conv:${conversationId}`);
    });

    // logs:unsubscribe kutilayotgan logs:subscribe so'rovini bekor qila
    // olishi uchun bayroq — findById hali javob bermagan bo'lsa ham,
    // xonaga qo'shilish keyin amalga oshmaydi.
    let logsSubscribeActive = false;

    /**
     * Jurnalga obuna — ruxsat AYNAN SHU YERDA tekshiriladi, ulanish
     * paytida emas.
     *
     * NEGA: socket soatlab ochiq turadi va bu orada foydalanuvchining
     * roli o'zgargan bo'lishi mumkin. Obuna paytidagi tekshiruv
     * yangiroq holatni ko'radi. Bu YOLG'IZ tekshiruv emas — har bir
     * `log.appended` hodisasi ham yetkazilishidan oldin xona a'zolarini
     * qayta tekshiradi (pastda, `container.events.subscribe`), chunki
     * socket obunadan keyin ham soatlab ochiq qolishi mumkin.
     * `container.auth.loadUser` ishlatiladi — u qisqa muddatli keshga
     * ega (auth.ts), shuning uchun bu yerda ham, pastdagi qayta
     * tekshiruvda ham bazaga ortiqcha urilmaydi.
     */
    socket.on('logs:subscribe', () => {
      const userId = socket.data.user?.sub as string | undefined;
      if (!userId) return;

      logsSubscribeActive = true;
      void container.auth
        .loadUser(userId)
        .then((user) => {
          if (!logsSubscribeActive) return;
          // can() faqat isActive va rolni tekshiradi, lockedAt'ni emas —
          // isLocked alohida tekshiriladi, xuddi auth.ts (104-114-qator)
          // dagidek: bloklangan hisob mavjud tokeni bilan ham jurnal
          // oqimini olishda davom etmasligi kerak.
          if (!user || !can(user, 'logs.view') || isLocked(user)) return;
          void socket.join('logs');
        })
        .catch(() => undefined);
    });

    socket.on('logs:unsubscribe', () => {
      logsSubscribeActive = false;
      void socket.leave('logs');
    });
  });

  // Domen hodisalarini socket'ga uzatamiz.
  container.events.subscribe((event) => {
    // Jurnal hodisasi FAQAT obuna bo'lganlarga — unda mijoz ismi va
    // telefon raqami bo'lishi mumkin.
    //
    // `io.to('logs').emit(...)` yetarli EMAS: xonaga obuna vaqtida
    // qo'shilgan socket, foydalanuvchining ruxsati keyin olib
    // qo'yilgan yoki hisobi bloklangan/o'chirilgan bo'lsa ham, xonada
    // qolaveradi. Shuning uchun har bir qatordan OLDIN xona a'zolari
    // qayta tekshiriladi — kesh tufayli bu arzon (auth.ts, 15s TTL).
    // Ruxsatdan RAD ETILGAN (`unauthorized`) socket xonadan chiqariladi,
    // shu bilan bu xarajat faqat bir marta to'lanadi. `indeterminate`
    // (loadUser yiqilgan — masalan, Postgres vaqtincha to'yingan) boshqacha:
    // bu qator yetkazilmaydi, LEKIN socket xonada QOLDIRILADI — bazaning
    // vaqtinchalik nosozligi ruxsat bekor qilinganiga dalil emas, keyingi
    // qatorda qayta urinib ko'riladi (checkLogsRoomAccess, logsRoomGuard.ts).
    if (event.type === 'log.appended') {
      const room = io.sockets.adapter.rooms.get('logs');
      if (!room || room.size === 0) return;

      const sockets = new Map<string, ReturnType<typeof io.sockets.sockets.get>>();
      const members = Array.from(room, (socketId) => {
        const s = io.sockets.sockets.get(socketId);
        sockets.set(socketId, s);
        return { socketId, userId: s?.data.user?.sub as string | undefined };
      });

      void checkLogsRoomAccess(members, (userId) => container.auth.loadUser(userId)).then(
        ({ authorized, unauthorized }) => {
          for (const socketId of authorized) sockets.get(socketId)?.emit('log.appended', event);
          for (const socketId of unauthorized) void sockets.get(socketId)?.leave('logs');
        },
      );
      return;
    }

    if ('conversationId' in event && event.conversationId) {
      io.to(`conv:${event.conversationId}`).emit(event.type, event);
    }
    io.emit('event', event);
  });

  return io;
}
