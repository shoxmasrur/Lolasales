import fs from 'node:fs/promises';
import path from 'node:path';
import { Api, TelegramClient, sessions } from 'teleproto';

import { PgTelegramAccountRepository } from '@/infrastructure/db/repositories/PgTelegramAccountRepository';
import { NaiSpeechToText } from '@/infrastructure/stt/NaiSpeechToText';
import { closePool } from '@/infrastructure/db/pool';
import { logger } from '@/shared/logger';

/**
 * Akkauntning Telegramdagi yozishmalarini faylga chiqaradi — agentni real
 * suhbatlar asosida o'rgatish uchun material.
 *
 *   npm run export-dialogs --workspace=server -- telegram_oila
 *   npm run export-dialogs --workspace=server -- telegram_oila --dialogs 40 --messages 300
 *
 * Ovozli xabarlar Nai STT orqali matnga o'giriladi. Transkript natijasi
 * keshlanadi (`--out` papkasidagi json), shuning uchun skriptni qayta
 * ishga tushirish bir xil audio uchun ikkinchi marta to'lov qildirmaydi.
 *
 * FAQAT O'QIYDI: hech qanday xabar yubormaydi, bazaga yozmaydi.
 */

const { StringSession } = sessions;

interface ExportedMessage {
  id: number;
  date: string;
  out: boolean;
  text: string;
  media: string | null;
  /** Ovozli xabar matni (Nai STT). */
  transcript?: string | null;
  transcriptError?: string;
}

interface ExportedDialog {
  peerId: string;
  title: string;
  username: string | null;
  phone: string | null;
  messages: ExportedMessage[];
}

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function mediaLabel(message: Api.Message): string | null {
  const media = message.media;
  if (!media) return null;
  if (media instanceof Api.MessageMediaPhoto) return 'rasm';
  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (!(doc instanceof Api.Document)) return 'fayl';
    for (const attr of doc.attributes) {
      if (attr instanceof Api.DocumentAttributeAudio) return attr.voice ? 'ovoz' : 'audio';
      if (attr instanceof Api.DocumentAttributeVideo) return 'video';
      if (attr instanceof Api.DocumentAttributeSticker) return 'stiker';
    }
    return 'fayl';
  }
  return 'media';
}

async function main(): Promise<void> {
  const label = process.argv[2] ?? 'telegram_oila';
  const maxDialogs = arg('dialogs', 30);
  const maxMessages = arg('messages', 200);
  const outDir = path.resolve(process.cwd(), process.argv.includes('--out')
    ? process.argv[process.argv.indexOf('--out') + 1]!
    : 'dialog-export');

  const accounts = new PgTelegramAccountRepository();
  const all = await accounts.list();
  const account = all.find((a) => a.label === label);
  if (!account) throw new Error(`"${label}" nomli akkaunt topilmadi`);
  if (!account.session) throw new Error(`"${label}" akkauntida saqlangan sessiya yo'q`);

  await fs.mkdir(outDir, { recursive: true });
  const cachePath = path.join(outDir, 'stt-cache.json');
  const cache: Record<string, string> = await fs
    .readFile(cachePath, 'utf8')
    .then((raw) => JSON.parse(raw) as Record<string, string>)
    .catch(() => ({}));

  const stt = new NaiSpeechToText();
  logger.info({ label, sttAvailable: stt.available }, 'Eksport boshlandi');

  const client = new TelegramClient(
    new StringSession(account.session),
    account.apiId,
    account.apiHash,
    { connectionRetries: 3, autoReconnect: false },
  );
  client.setLogLevel('error' as never);
  await client.connect();

  const dialogs = await client.getDialogs({ limit: maxDialogs * 3 });
  const userDialogs = dialogs.filter(
    (d) => d.entity instanceof Api.User && !d.entity.bot && !d.entity.self,
  );

  logger.info(
    { jami: dialogs.length, shaxsiy: userDialogs.length, olinadi: Math.min(userDialogs.length, maxDialogs) },
    'Suhbatlar topildi',
  );

  const exported: ExportedDialog[] = [];
  let voiceCount = 0;
  let sttOk = 0;

  for (const dialog of userDialogs.slice(0, maxDialogs)) {
    const user = dialog.entity as Api.User;
    const messages = await client.getMessages(dialog.inputEntity, { limit: maxMessages });

    const items: ExportedMessage[] = [];
    for (const message of [...messages].reverse()) {
      const media = mediaLabel(message);
      const item: ExportedMessage = {
        id: Number(message.id),
        date: new Date(Number(message.date) * 1000).toISOString(),
        out: Boolean(message.out),
        text: message.message ?? '',
        media,
      };

      if (media === 'ovoz' || media === 'audio') {
        voiceCount += 1;
        const key = `${account.id}:${dialog.id}:${message.id}`;

        if (cache[key] !== undefined) {
          item.transcript = cache[key];
          sttOk += 1;
        } else if (!stt.available) {
          item.transcriptError = 'NAI_STT_API_KEY sozlanmagan';
        } else {
          try {
            const buffer = (await client.downloadMedia(message, {})) as Buffer | undefined;
            if (!buffer?.length) {
              item.transcriptError = 'Audio yuklab olinmadi';
            } else {
              const result = await stt.transcribe({
                audio: buffer,
                fileName: `voice-${message.id}.ogg`,
                mimeType: 'audio/ogg',
              });
              if (result.ok) {
                item.transcript = result.text;
                cache[key] = result.text;
                sttOk += 1;
                await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));
              } else {
                item.transcriptError = result.reason;
              }
            }
          } catch (err) {
            item.transcriptError = err instanceof Error ? err.message : String(err);
          }
        }
      }

      items.push(item);
    }

    exported.push({
      peerId: String(user.id),
      title: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Nomsiz',
      username: user.username ?? null,
      phone: user.phone ? `+${user.phone.replace(/\D/g, '')}` : null,
      messages: items,
    });

    logger.info({ suhbat: exported.at(-1)!.title, xabarlar: items.length }, 'Olindi');
  }

  await client.disconnect();

  const jsonPath = path.join(outDir, `${label}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(exported, null, 2));

  // O'qish uchun qulay matn — tahlil aynan shundan qilinadi.
  const lines: string[] = [`# ${label} — ${exported.length} ta suhbat\n`];
  for (const dialog of exported) {
    lines.push(`\n## ${dialog.title}${dialog.username ? ` (@${dialog.username})` : ''}`);
    lines.push(`_${dialog.messages.length} ta xabar_\n`);
    for (const m of dialog.messages) {
      const who = m.out ? 'BIZ' : 'MIJOZ';
      const time = m.date.slice(0, 16).replace('T', ' ');
      let body = m.text.trim();
      if (m.transcript) body = `[ovoz] ${m.transcript}`;
      else if (m.transcriptError) body = `[ovoz — o'girilmadi: ${m.transcriptError}]`;
      else if (m.media && !body) body = `[${m.media}]`;
      else if (m.media) body = `[${m.media}] ${body}`;
      if (!body) continue;
      lines.push(`${time}  ${who}: ${body}`);
    }
  }
  const mdPath = path.join(outDir, `${label}.md`);
  await fs.writeFile(mdPath, lines.join('\n'));

  logger.info(
    {
      suhbatlar: exported.length,
      xabarlar: exported.reduce((s, d) => s + d.messages.length, 0),
      ovozli: voiceCount,
      transkript: sttOk,
      json: jsonPath,
      matn: mdPath,
    },
    'Eksport tugadi',
  );
}

try {
  await main();
} catch (err) {
  logger.error({ err }, 'Eksport xatosi');
  process.exitCode = 1;
} finally {
  await closePool();
}
