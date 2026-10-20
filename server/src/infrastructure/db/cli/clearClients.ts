import { closePool, query, withTransaction } from '@/infrastructure/db/pool';
import { logger } from '@/shared/logger';

/**
 * Mijozlar, shartnomalar va suhbatlarni tozalaydi (sinov ma'lumotlarini olib tashlash).
 *
 * O'CHIRISH YUMSHOQ: hech narsa bazadan yo'qolmaydi — clients, contracts,
 * conversations, messages, client_profiles, payment_promises va
 * campaign_targets jadvallarida `deleted_at` qo'yiladi (032-migratsiya).
 * Ro'yxatlar bo'shaydi, tarix esa joyida qoladi va dashboarddagi
 * "O'chirilgan" tabidan qaytarish mumkin.
 *
 * NIMA QOLADI (ataylab):
 *   • agent_rules / agent_rule_sections — agentga o'rgatilgan qoidalar va misollar
 *   • agent_lessons — suhbatlardan olingan umumiy saboqlar (011-migratsiya izohiga
 *     qarang: mijozlar tozalanganda saboqlar saqlanib qolishi kerak)
 *   • users, roles, telegram_accounts, settings
 *
 * Skript avval nima o'chishini ko'rsatadi va tasdiq so'raydi.
 * Tasdiqsiz ishlatish uchun: `--yes`.
 */

interface Counts {
  clients: number;
  contracts: number;
  conversations: number;
  messages: number;
  profiles: number;
  promises: number;
}

async function counts(): Promise<Counts> {
  const { rows } = await query<Record<keyof Counts, string>>(`
    SELECT (SELECT COUNT(*) FROM clients          WHERE deleted_at IS NULL) AS clients,
           (SELECT COUNT(*) FROM contracts        WHERE deleted_at IS NULL) AS contracts,
           (SELECT COUNT(*) FROM conversations    WHERE deleted_at IS NULL) AS conversations,
           (SELECT COUNT(*) FROM messages         WHERE deleted_at IS NULL) AS messages,
           (SELECT COUNT(*) FROM client_profiles  WHERE deleted_at IS NULL) AS profiles,
           (SELECT COUNT(*) FROM payment_promises WHERE deleted_at IS NULL) AS promises
  `);
  const r = rows[0]!;
  return {
    clients: Number(r.clients),
    contracts: Number(r.contracts),
    conversations: Number(r.conversations),
    messages: Number(r.messages),
    profiles: Number(r.profiles),
    promises: Number(r.promises),
  };
}

/** Terminaldan bitta qator o'qiydi (tasdiq uchun). */
async function ask(question: string): Promise<string> {
  process.stdout.write(question);
  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (chunk) => {
      process.stdin.pause();
      resolve(String(chunk).trim());
    });
  });
}

async function clearClients(): Promise<void> {
  const before = await counts();

  if (before.clients === 0) {
    logger.info('Baza allaqachon toza — mijoz yo\'q');
    return;
  }

  logger.info(before, 'Belgilanadigan yozuvlar');

  if (!process.argv.includes('--yes')) {
    const answer = await ask(
      `\n${before.clients} ta mijoz, ${before.conversations} ta suhbat va `
      + `${before.messages} ta xabar ro'yxatlardan olib tashlanadi.\n`
      + 'Ma\'lumot bazada qoladi va dashboarddan qaytarish mumkin.\n'
      + 'Davom etilsinmi? (ha/yo\'q): ',
    );
    if (!['ha', 'h', 'yes', 'y'].includes(answer.toLowerCase())) {
      logger.info('Bekor qilindi — hech narsa o\'chirilmadi');
      return;
    }
  }

  // CASCADE endi ishlamaydi (hech narsa DELETE qilinmayapti), shuning
  // uchun har bir jadval bitta vaqt belgisi bilan o'zi belgilanadi.
  await withTransaction(async (tx) => {
    await query(
      `UPDATE messages SET deleted_at = now()
        WHERE deleted_at IS NULL
          AND conversation_id IN (SELECT id FROM conversations WHERE deleted_at IS NULL)`,
      [],
      tx,
    );
    for (const table of ['payment_promises', 'campaign_targets', 'client_profiles',
                         'conversations', 'contracts', 'clients']) {
      await query(`UPDATE ${table} SET deleted_at = now() WHERE deleted_at IS NULL`, [], tx);
    }
    await query(
      `UPDATE clients SET deleted_by = 'clearClients CLI' WHERE deleted_by IS NULL AND deleted_at IS NOT NULL`,
      [],
      tx,
    );
  });

  const after = await counts();
  logger.info(after, 'Tozalandi (yozuvlar bazada qoldi)');

  const lessons = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM agent_lessons WHERE deleted_at IS NULL',
  );
  const rules = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM agent_rules WHERE is_enabled AND deleted_at IS NULL',
  );
  logger.info(
    { saboqlar: Number(lessons.rows[0]!.count), qoidalar: Number(rules.rows[0]!.count) },
    'Agent bilimi saqlanib qoldi',
  );
}

try {
  await clearClients();
} catch (err) {
  logger.error({ err }, 'Tozalash xatosi');
  process.exitCode = 1;
} finally {
  await closePool();
}
