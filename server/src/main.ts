import { createServer } from 'node:http';
import { createContainer } from '@/composition/container';
import { createApp } from '@/presentation/http/createApp';
import { createSocketServer } from '@/presentation/ws/createSocketServer';
import { runMigrations } from '@/infrastructure/db/migrator';
import { syncRuleSections } from '@/infrastructure/ai/prompt/seedDefaultRules';
import { closePool } from '@/infrastructure/db/pool';
import { config } from '@/shared/config';
import { logger } from '@/shared/logger';
import { sleep } from '@/shared/datetime';
import { setLogSink } from '@/shared/logSink';
import { createDbLogSink } from '@/infrastructure/logging/dbLogSink';

// systemd butun to'xtash uchun 90 soniya beradi. Telegram'ga ketgan
// so'rov osilib qolsa, qolgan to'xtash tartibi (`telegram.shutdown`,
// `closePool`) garovda qolmasin. Qayta aloqadagi agent chaqiruvi
// uzilmaydi (bir necha o'n soniya olishi mumkin) — shuning uchun 45 s.
// Chegarada tugamagan suhbat yo'qolmaydi: tiklangach qayta ko'riladi va
// shu kuni yozilgan bo'lsa ro'yxat shartidan chiqib, o'tkazib yuboriladi.
const BULK_IDLE_TIMEOUT_MS = 45_000;

async function bootstrap(): Promise<void> {
  logger.info({ env: config.NODE_ENV, tz: config.TIMEZONE }, 'Debitor Agent ishga tushmoqda');

  await runMigrations();

  const container = createContainer();

  // Akkaunt nomlari jurnal uchun oldindan yuklanadi — birinchi xatoda ham
  // id emas, "Madina" ko'rinsin.
  await container.services.accountLabels.refresh();

  // Shu qatordan boshlab `warn` va `error` bazaga ham tushadi.
  // Konteyner tayyor bo'lgunicha ular faqat `stdout` ga ketadi.
  setLogSink(
    createDbLogSink(container.repositories.appLog, (item) => {
      container.events.publish({ type: 'log.appended', item });
    }),
  );

  // Agent qoidalari bazada bo'ladi; birinchi ishga tushirishda kodda yozilgan
  // standartlar ko'chiriladi. Keyingi safar operator tahrirlari saqlanadi.
  await syncRuleSections(container.repositories.agentRules, container.repositories.settingsRepo);
  const app = createApp(container);
  const httpServer = createServer(app);
  createSocketServer(httpServer, container);

  // Telegramdan kelgan xabarlar → agent.
  container.services.telegram.onIncomingMessage(async (incoming) => {
    await container.useCases.handleIncoming.execute(incoming);
  });

  // Mijoz xabarlarimizni o'qigani → chatda "o'qildi" belgisi.
  //
  // Operator uchun bu muhim farq: o'qib javob bermayotgan mijoz e'tiborsiz
  // qoldiryapti, xabarni umuman ko'rmagani esa boshqa kanalni talab qiladi.
  container.services.telegram.onMessagesRead(async (event) => {
    const conversation = await container.repositories.conversations.findByPeer(
      event.telegramAccountId,
      event.peerId,
    );
    if (!conversation) return;

    const marked = await container.repositories.messages.markReadUpTo(
      conversation.id,
      event.maxMessageId,
      event.readAt,
    );
    // Hech narsa o'zgarmagan bo'lsa hodisa yubormaymiz — Telegram bir xil
    // yangilanishni takror yuborishi mumkin.
    if (marked > 0) {
      container.events.publish({ type: 'conversation.messages_read', conversationId: conversation.id });
    }
  });

  // Xom xabar oqimi → dashboarddagi "Telegram qutisi" ekranini jonli yangilash.
  // Bu agent mantiqiga ta'sir qilmaydi: faqat ko'rsatish uchun.
  container.services.telegram.onRawMessage((msg) => {
    container.events.publish({
      type: 'telegram.raw_message',
      accountId: msg.telegramAccountId,
      peerId: msg.peerId,
      messageId: msg.messageId,
      text: msg.text,
      out: msg.out,
      date: msg.date.toISOString(),
      senderName: msg.senderName,
      mediaLabel: msg.mediaLabel,
    });
  });

  container.services.scheduler.start();
  container.services.spamWatcher.start();
  container.services.appLogCleaner.start();
  container.services.connectionWatcher.start();
  container.services.eslatmaKuzatuvchi.start();

  httpServer.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, `API tayyor: http://localhost:${config.PORT}`);
  });

  // Akkauntlar FONDA ulanadi — KUTILMAYDI.
  //
  // NEGA: bitta o'lik proksili akkaunt `connectionRetries: 5` bilan
  // ~60 soniya yeydi va shu vaqt davomida panel umuman javob bermasdi;
  // deploy skripti esa xizmatni 60 soniya kutgani uchun har bir deploy
  // "yiqilgan" bo'lib ko'rinardi.
  //
  // NARXI: ilk bir necha soniyada xabar yuborishga urinish
  // `409 TELEGRAM_NOT_CONNECTED` berishi mumkin. Bu mavjud xato yo'li
  // va ulanish kuzatuvchisi baribir tuzatadi.
  // To'xtash boshlangan bo'lsa, vazifani tiklamaymiz (pastga qarang).
  let shuttingDown = false;

  void container.services.telegram
    .bootstrap()
    .catch((err) => {
      logger.error({ err }, 'Telegram akkauntlarni ko\'tarishda xato');
    })
    // Deploy uzgan ommaviy vazifalar akkauntlar ulangandan KEYIN davom
    // etadi — aks holda birinchi mijozlar "ulanmagan" xatosiga tushardi.
    // `bootstrap` yiqilsa ham chaqiriladi: ulanmagan akkaunt uchun
    // vazifaning o'z tekshiruvlari bor. `run()` rad etmaydi.
    // Bootstrap (~60 s) paytida SIGTERM kelgan bo'lsa, `freeze()` allaqachon
    // `clean_stop = TRUE` yozgan: tiklash uni qaytarib FALSE qilib, chiqayotgan
    // jarayonda muzlatilgan holat bilan vazifa boshlardi va keyingi ishga
    // tushish buni avariya deb sanardi.
    .finally(() => {
      if (!shuttingDown) return container.services.bulkJobResumer.run();
    });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'To\'xtatilmoqda...');
    shuttingDown = true;
    // Ommaviy vazifalar BIRINCHI: `beginShutdown` dan keyin "to'xtatildi"
    // holati bazaga yozilmaydi, qator `running` bo'lib qoladi va server
    // ko'tarilgach vazifa davom etadi. Tartib muhim — `stop()` dan oldin.
    // Bu qism yiqilsa ham qolgan to'xtash tartibi bajariladi, `freeze()` esa
    // doim urinib ko'riladi (`clean_stop` yozilmasa deploy avariya sanaladi).
    try {
      container.services.bulkJobStore.beginShutdown();
      container.services.bulkLookup.pauseForShutdown();
      container.services.bulkStart.pauseForShutdown();
      container.services.bulkRecontact.pauseForShutdown();
      const idleAbort = new AbortController();
      const timedOut = await Promise.race([
        Promise.all([
          container.services.bulkLookup.idle(),
          container.services.bulkStart.idle(),
          container.services.bulkRecontact.idle(),
        ]).then(() => false),
        sleep(BULK_IDLE_TIMEOUT_MS, idleAbort.signal).then(() => true),
      ]);
      idleAbort.abort();
      if (timedOut) {
        logger.warn({ limitMs: BULK_IDLE_TIMEOUT_MS }, 'Ommaviy vazifalar chegarada to\'xtamadi, to\'xtash davom etadi');
      }
    } catch (err) {
      logger.error({ err }, 'Ommaviy vazifalarni to\'xtatishda xato');
    } finally {
      try {
        await container.services.bulkJobStore.freeze();
      } catch (err) {
        logger.error({ err }, 'Ommaviy vazifalar holatini muzlatishda xato');
      }
    }
    await container.services.scheduler.stop();
    await container.services.eslatmaKuzatuvchi.stop();
    container.services.spamWatcher.stop();
    container.services.appLogCleaner.stop();
    container.services.connectionWatcher.stop();
    await container.services.telegram.shutdown();
    httpServer.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Ishga tushirib bo\'lmadi');
  process.exit(1);
});
