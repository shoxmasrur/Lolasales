import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loyihaIldizi } from '@/shared/projectRoot';

const here = path.dirname(fileURLToPath(import.meta.url));
/**
 * Loyiha ildizi — nisbiy yo'llar (MEDIA_DIR) va `.env`
 * shunga nisbatan. Qidiriladi: dev'da bu fayl `server/src/shared` da,
 * bundle'da `server/dist/main.js` ichida (`projectRoot.ts`).
 */
export const projectRoot = loyihaIldizi(here);
loadEnv({ path: path.resolve(projectRoot, '.env'), quiet: true });
loadEnv({ quiet: true });

const boolish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:5174'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL majburiy'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET kamida 16 belgi bo\'lsin'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  ADMIN_EMAIL: z.string().email().default('admin@lolasales.uz'),
  ADMIN_PASSWORD: z.string().default('change-me'),
  ADMIN_NAME: z.string().default('Admin'),
  ENCRYPTION_KEY: z.string().min(16, 'ENCRYPTION_KEY kamida 16 belgi bo\'lsin'),

  TELEGRAM_API_ID: z.coerce.number().int().optional(),
  TELEGRAM_API_HASH: z.string().optional(),
  TELEGRAM_PROXY: z.string().optional(),

  // API kalit (sk-ant-api…) yoki Claude Code obuna tokeni (sk-ant-oat…).
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_CODE_OAUTH_TOKEN: z.string().optional(),
  AGENT_MODEL: z.string().default('claude-sonnet-5'),
  // 'auto' — kalit turini prefiksidan aniqlaydi (tavsiya etiladi).
  AGENT_AUTH_MODE: z.enum(['auto', 'api', 'subscription']).default('auto'),

  // ─── OpenAI (faqat SOLISHTIRISH uchun) ──────────────────────────────────
  // Ishlab turgan agent bularga tegmaydi — `npm run ab-suhbat` stendigina
  // o'qiydi. Kalit bo'lmasa stend faqat hozirgi modelni ko'rsatadi.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5.6'),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),

  // ─── Media va nutqni matnga o'girish (Aisha Group) ──────────────────────
  AISHA_API_KEY: z.string().optional(),
  AISHA_BASE_URL: z.string().default('https://back.aisha.group'),
  STT_LANGUAGE: z.enum(['uz', 'ru', 'en']).default('uz'),
  STT_MAX_MB: z.coerce.number().positive().default(20),
  STT_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  // ─── XonzodaAI STT (o'zimizning platforma) — FAQAT solishtirish uchun ─────
  // Ovozli xabar Aisha bilan birga shunga ham yuboriladi; natija chatda
  // Aisha matni ostida ko'rinadi, agentga bormaydi. Kalit bo'lmasa o'chiq.
  XONZODA_STT_API_KEY: z.string().optional(),
  XONZODA_STT_BASE_URL: z.string().default('https://xonsaroy.adiz.uz/api/v1'),
  MEDIA_DIR: z.string().default('storage/media'),
  /** Bundan katta fayl yuklab olinmaydi (dashboardda faqat belgisi ko'rinadi). */
  MEDIA_MAX_MB: z.coerce.number().positive().default(50),

  // ─── Rasm turini aniqlash (Anthropic vision) ────────────────────────────
  // ANTHROPIC_API_KEY yuqorida e'lon qilingan — tasnifchi o'shani ishlatadi.
  // Model ataylab agentnikidan arzon va tez: bu chaqiruv mijozning
  // javobini to'sib turadi, ya'ni tezlik narxdan muhimroq.
  VISION_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  VISION_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
  VISION_MAX_MB: z.coerce.number().positive().default(10),

  // Hajm bet sonining TAXMINIY o'rnini bosadi — kutubxona qo'shib bet
  // sanash bitta chek uchun ortiqcha. Lekin bu taxmin vektor PDF da
  // yanglishadi: skanerlangan betda 1 rasm ~100-500 kB, VEKTOR PDF da esa
  // (bank tizimlari aynan shunday chiqaradi) bet 20-50 kB, ya'ni bet
  // zichligi ancha yuqori — 5 MB skanerlangan PDF da 10-50 bet bo'lsa,
  // vektor PDF da 100-250 bet bo'lib chiqadi va har bet modelga alohida
  // rasm bo'lib ketadi. Shuning uchun chegara pastroq olingan: chek PDF
  // deyarli har doim 1 MB dan kichik, 2 MB da ham bu buzilmaydi
  // (2026-09-24 qarori, yakuniy ko'rikda 5 dan tushirilgan).
  PDF_MAX_MB: z.coerce.number().positive().default(2),

  OUTREACH_DAILY_LIMIT: z.coerce.number().int().positive().default(40),
  OUTREACH_MIN_DELAY_SEC: z.coerce.number().int().nonnegative().default(60),
  OUTREACH_MAX_DELAY_SEC: z.coerce.number().int().nonnegative().default(180),
  OUTREACH_WINDOW_START: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  OUTREACH_WINDOW_END: z.string().regex(/^\d{2}:\d{2}$/).default('19:00'),
  TIMEZONE: z.string().default('Asia/Tashkent'),
  /**
   * Mijozning ketma-ket xabarlarini bitta javobga birlashtirish uchun kutish
   * vaqti. Odam fikrini bo'lib-bo'lib yozadi — 8 soniya odatda yetadi.
   */
  AGENT_REPLY_DEBOUNCE_MS: z.coerce.number().int().nonnegative().default(8_000),
  /**
   * Ommaviy Telegram tekshiruvida ikki qidiruv orasidagi pauza.
   * Telegram telefon qidiruvini qattiq cheklaydi — tez yuborilsa akkaunt
   * FLOOD_WAIT ga tushadi va soatlab hech narsa yubora olmaydi.
   */
  TELEGRAM_LOOKUP_DELAY_MS: z.coerce.number().int().nonnegative().default(4_000),

  KILL_SWITCH: boolish,
  /**
   * @SpamBot ni har 6 soatda avtomatik so'rash. Standart — o'chiq.
   *
   * Tekshiruvning o'zi ham Telegram uchun faollik: akkaunt @SpamBot ga
   * `/start` yozadi. Buni odam qachon kerakligini bilib bosgani
   * xavfsizroq. Dashboarddagi qo'lda tekshirish tugmasi bunga bog'liq
   * emas va doim ishlaydi.
   */
  SPAM_WATCH_ENABLED: boolish,
  AGENT_AUTO_REPLY: z
    .string()
    .optional()
    .transform((v) => v !== 'false' && v !== '0'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`.env noto'g'ri sozlangan:\n${issues}\n\n.env.example dan nusxa oling.`);
}

export type AppConfig = Readonly<z.infer<typeof schema>>;

export const config: AppConfig = Object.freeze({
  ...parsed.data,
  MEDIA_DIR: path.isAbsolute(parsed.data.MEDIA_DIR)
    ? parsed.data.MEDIA_DIR
    : path.resolve(projectRoot, parsed.data.MEDIA_DIR),
});

export const isProd = config.NODE_ENV === 'production';
