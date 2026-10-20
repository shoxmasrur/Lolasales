import { Api, TelegramClient, sessions } from 'teleproto';

import { PgTelegramAccountRepository } from '@/infrastructure/db/repositories/PgTelegramAccountRepository';
import { closePool } from '@/infrastructure/db/pool';
import { logger } from '@/shared/logger';

/**
 * "Xabar yetib bordi, keyin yo'qoldi" — sababini o'lchaydi.
 *
 *   npm run check-ttl --workspace=server
 *   npm run check-ttl --workspace=server -- telegram_oila
 *
 * NIMA TEKSHIRADI:
 *
 *  1) Akkauntning UMUMIY avto-o'chirish sozlamasi
 *     (`messages.getDefaultHistoryTTL`). Telegram ilovasida bu
 *     Sozlamalar → Maxfiylik → "Xabarlarni avtomatik o'chirish". Yoqilgan
 *     bo'lsa, akkaunt BOSHLAYDIGAN har bir yangi suhbatga o'sha muddat
 *     o'rnatiladi va xabarlar IKKALA tomondan ham o'chib ketadi.
 *
 *  2) Har bir suhbatning O'Z taymeri (`Dialog.ttlPeriod`) — umumiy
 *     sozlama o'chiq bo'lsa ham alohida suhbatda yoqilgan bo'lishi mumkin.
 *
 * Bizning kodimiz TTL o'rnatmaydi (`SetHistoryTTL` hech qayerda
 * chaqirilmaydi) — shuning uchun topilgan har qanday taymer akkauntning
 * o'zida qo'lda yoqilgan degani.
 *
 * FAQAT O'QIYDI: hech narsa yubormaydi, o'zgartirmaydi, bazaga yozmaydi.
 */

const { StringSession } = sessions;

/** Sekundni odam o'qiydigan ko'rinishga o'giradi. */
function humanTtl(seconds: number): string {
  if (seconds <= 0) return 'o\'chiq';
  if (seconds % 86400 === 0) {
    const days = seconds / 86400;
    if (days === 7) return '1 hafta';
    if (days === 30 || days === 31) return '1 oy';
    return `${days} kun`;
  }
  if (seconds % 3600 === 0) return `${seconds / 3600} soat`;
  return `${seconds} soniya`;
}

async function checkAccount(
  accounts: PgTelegramAccountRepository,
  label: string | null,
): Promise<void> {
  const all = await accounts.list();
  const targets = label ? all.filter((a) => a.label === label) : all;

  if (!targets.length) {
    throw new Error(label ? `"${label}" nomli akkaunt topilmadi` : 'Akkaunt yo\'q');
  }

  for (const account of targets) {
    if (!account.session) {
      logger.warn({ label: account.label }, 'Sessiya yo\'q — o\'tkazib yuborildi');
      continue;
    }

    const client = new TelegramClient(
      new StringSession(account.session),
      account.apiId,
      account.apiHash,
      { connectionRetries: 3, autoReconnect: false },
    );
    client.setLogLevel('error' as never);
    await client.connect();

    try {
      // ─── 1. Umumiy avto-o'chirish ───────────────────────────────────────
      const def = (await client.invoke(
        new Api.messages.GetDefaultHistoryTTL(),
      )) as Api.DefaultHistoryTTL;
      const defaultPeriod = Number(def.period ?? 0);

      logger.info(
        { akkaunt: account.label, avtoOchirish: humanTtl(defaultPeriod) },
        defaultPeriod > 0
          ? 'DIQQAT: umumiy avto-o\'chirish YOQILGAN — yangi suhbatlarda xabarlar o\'z-o\'zidan o\'chadi'
          : 'Umumiy avto-o\'chirish o\'chiq',
      );

      // ─── 2. Suhbatlarning o'z taymerlari ────────────────────────────────
      const dialogs = await client.getDialogs({ limit: 200 });
      const withTtl = dialogs.filter((d) => Number(d.dialog?.ttlPeriod ?? 0) > 0);

      logger.info(
        { akkaunt: account.label, jami: dialogs.length, taymerli: withTtl.length },
        'Suhbatlar tekshirildi',
      );

      for (const dialog of withTtl) {
        const user = dialog.entity instanceof Api.User ? dialog.entity : null;
        logger.warn(
          {
            suhbat: dialog.name || dialog.title || 'Nomsiz',
            peerId: dialog.id ? String(dialog.id) : null,
            username: user?.username ?? null,
            taymer: humanTtl(Number(dialog.dialog.ttlPeriod)),
          },
          'Suhbatda avto-o\'chirish taymeri bor',
        );
      }
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }
}

async function main(): Promise<void> {
  const label = process.argv[2] ?? null;
  await checkAccount(new PgTelegramAccountRepository(), label);
}

main()
  .catch((err) => {
    logger.error({ err }, 'Tekshiruv xatosi');
    process.exitCode = 1;
  })
  .finally(() => void closePool());
