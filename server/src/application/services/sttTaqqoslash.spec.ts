import { SttTaqqoslash } from '@/application/services/SttTaqqoslash';
import type { XonzodaTranscript, Message } from '@/domain/entities/Message';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IMediaStorage } from '@/domain/services/IMediaStorage';
import type { ISpeechToText, TranscriptionInput } from '@/domain/services/ISpeechToText';
import type { DomainEvent, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:stt-taqqoslash --workspace=server
 *
 * XonzodaAI solishtiruvi fonda ishlaydi va asosiy oqimga (Nai matni,
 * agent javobi) TEGMASLIGI kerak. Bazaga ham, tarmoqqa ham chiqmaydi.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const xabar = (id: string, kind: string | null, path: string | null = `media/${id}.ogg`): Message =>
  ({
    id,
    conversationId: 'suhbat-1',
    media: kind ? { kind, path, mimeType: 'audio/ogg', sizeBytes: 10, durationSec: 3, fileName: null } : null,
    transcript: 'nai matni',
    transcriptStatus: 'done',
  }) as unknown as Message;

function muhit(opts: {
  available?: boolean;
  natija?: (i: TranscriptionInput) => Promise<{ ok: true; text: string; language: null } | { ok: false; reason: string }>;
  oqishXatosi?: boolean;
} = {}) {
  const yozuvlar: Array<{ id: string; natija: XonzodaTranscript }> = [];
  const hodisalar: DomainEvent[] = [];
  const kirishlar: TranscriptionInput[] = [];
  let parallel = 0;
  let engKop = 0;
  const stt: ISpeechToText = {
    available: opts.available ?? true,
    transcribe: async (i) => {
      kirishlar.push(i);
      parallel += 1;
      engKop = Math.max(engKop, parallel);
      await new Promise((r) => setTimeout(r, 5));
      parallel -= 1;
      return opts.natija ? opts.natija(i) : { ok: true, text: 'xonzoda matni', language: null };
    },
  };
  const storage = {
    read: async (path: string) => {
      if (opts.oqishXatosi) throw new Error('fayl yo\'q');
      return Buffer.from(path);
    },
  } as unknown as IMediaStorage;
  const messages = {
    setXonzodaTranscript: async (id: string, natija: XonzodaTranscript) => {
      yozuvlar.push({ id, natija });
    },
  } as unknown as IMessageRepository;
  const events = { publish: (e: DomainEvent) => void hodisalar.push(e) } as unknown as IEventBus;
  let t = 1000;
  const xizmat = new SttTaqqoslash(stt, storage, messages, events, () => (t += 250));
  return { xizmat, yozuvlar, hodisalar, kirishlar, engKop: () => engKop };
}

// ─── Ovozli xabar — natija yoziladi va panel yangilanadi ─────────────────
{
  const m = muhit();
  m.xizmat.boshla(xabar('m1', 'voice'));
  await m.xizmat.idle();
  check('natija yozildi', m.yozuvlar, [
    { id: 'm1', natija: { status: 'done', text: 'xonzoda matni', error: null, ms: 250 } },
  ]);
  check('message.updated e\'lon qilindi', m.hodisalar, [
    { type: 'message.updated', conversationId: 'suhbat-1', messageId: 'm1' },
  ]);
  check('saqlangan fayl yuborildi', m.kirishlar[0]?.audio.toString(), 'media/m1.ogg');
}

// ─── Ovoz bo'lmagan xabar va fayli yo'q xabar — tegilmaydi ───────────────
{
  const m = muhit();
  m.xizmat.boshla(xabar('r1', 'photo'));
  m.xizmat.boshla(xabar('t1', null));
  m.xizmat.boshla(xabar('v0', 'voice', null));
  await m.xizmat.idle();
  check('rasm, matn, yo\'lsiz ovoz — STT chaqirilmadi', m.kirishlar.length, 0);
  check('hech narsa yozilmadi', m.yozuvlar, []);
}

// ─── Kalit yo'q — o'chiq ─────────────────────────────────────────────────
{
  const m = muhit({ available: false });
  m.xizmat.boshla(xabar('m2', 'voice'));
  await m.xizmat.idle();
  check('kalitsiz — hech narsa qilinmadi', [m.kirishlar.length, m.yozuvlar.length], [0, 0]);
}

// ─── STT xatosi — failed yoziladi, sababi bilan ──────────────────────────
{
  const m = muhit({ natija: async () => ({ ok: false, reason: 'XonzodaAI 502 upstream_error' }) });
  m.xizmat.boshla(xabar('m3', 'audio'));
  await m.xizmat.idle();
  check('xato — failed', m.yozuvlar[0]?.natija, { status: 'failed', text: null, error: 'XonzodaAI 502 upstream_error', ms: 250 });
}

// ─── Faylni o'qib bo'lmadi — failed, xato tashlanmaydi ───────────────────
{
  const m = muhit({ oqishXatosi: true });
  m.xizmat.boshla(xabar('m4', 'voice'));
  await m.xizmat.idle();
  check('o\'qish xatosi — failed', m.yozuvlar[0]?.natija.status, 'failed');
  check('o\'qish xatosi — STT chaqirilmadi', m.kirishlar.length, 0);
}

// ─── Bir vaqtda bitta so'rov (GPU qo'ng'iroqlar bilan umumiy) ────────────
{
  const m = muhit();
  for (const id of ['a', 'b', 'c']) m.xizmat.boshla(xabar(id, 'voice'));
  await m.xizmat.idle();
  check('uchalasi ishlandi', m.yozuvlar.map((y) => y.id), ['a', 'b', 'c']);
  check('parallel so\'rov yo\'q', m.engKop(), 1);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
