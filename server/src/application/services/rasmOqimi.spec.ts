import { IncomingMediaProcessor } from '@/application/services/IncomingMediaProcessor';
import type { IImageClassifier, ImageClassifyResult } from '@/domain/services/IImageClassifier';
import type { IMediaStorage } from '@/domain/services/IMediaStorage';
import type { ISpeechToText } from '@/domain/services/ISpeechToText';
import type { IncomingMedia } from '@/domain/services/ITelegramGateway';

/**
 * Qo'lda ishga tushiriladi: npm run test:rasm-oqimi --workspace=server
 *
 * Tarmoqqa ham, diskka ham chiqmaydi — hamma port soxta.
 *
 * Eng muhim tekshiruv: chek tekshiruvi manbai (`receiptSource`). `tolov` —
 * agent "Chekni oldim" deydi; `aniqlanmagan` (noaniq, yiqilgan, tasnifchi
 * o'chiq) — agent jim, operator darhol ko'radi (2026-09-17); hujjat va
 * oddiy rasm tekshiruv OCHMAYDI. PDF alohida yo'lda — `pdfOqimi.spec.ts`.
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

const storage = {
  save: async () => ({ path: 'storage/media/x.jpg', sizeBytes: 100 }),
} as unknown as IMediaStorage;

const stt = { available: false, transcribe: async () => ({ ok: false, reason: 'yo\'q' }) } as ISpeechToText;

function tasnifchi(natija: ImageClassifyResult, available = true) {
  const chaqiruv: string[] = [];
  const c: IImageClassifier = {
    available,
    classify: async () => {
      chaqiruv.push('classify');
      return natija;
    },
  };
  return { c, chaqiruv };
}

function media(patch: Partial<IncomingMedia> = {}): IncomingMedia {
  return {
    kind: 'photo',
    mimeType: 'image/jpeg',
    fileName: 'chek.jpg',
    sizeBytes: 100,
    durationSec: null,
    stickerAlt: null,
    download: async () => Buffer.from('rasm'),
    ...patch,
  } as IncomingMedia;
}

// ─── 1. To'lov — tekshiruv ochiladi ──────────────────────────────────────
{
  const { c } = tasnifchi({ kind: 'tolov', note: 'Payme', failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(media(), '');
  check('tolov: needsReview rost', r.needsReview === true, String(r.needsReview));
  check('tolov: manba tolov', r.receiptSource === 'tolov', String(r.receiptSource));
  check('tolov: imageKind yoziladi', r.imageKind === 'tolov', String(r.imageKind));
  check('tolov: tavsif saqlanadi', r.imageNote === 'Payme', String(r.imageNote));
  check('tolov: belgi chek deydi', r.agentText.includes('to\'lov cheki'), r.agentText);
}

// ─── 1b. Tasniflama (noma'lum mijoz, PII) — vision chaqirilmaydi ────────
{
  const { c, chaqiruv } = tasnifchi({ kind: 'tolov', note: 'x', failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(media(), '', { tasniflama: true });
  check('tasniflama: classify chaqirilmadi', chaqiruv.length === 0, String(chaqiruv.length));
  check('tasniflama: fayl baribir saqlandi (operator ko\'radi)', r.media.path === 'storage/media/x.jpg', String(r.media.path));
  check('tasniflama: imageKind yo\'q, tavsif yo\'q', r.imageKind === null && r.imageNote === null && r.imageStatus === 'none',
    `${r.imageKind}/${r.imageStatus}`);
  const odatiy = tasnifchi({ kind: 'tolov', note: 'x', failed: false });
  await new IncomingMediaProcessor(storage, stt, odatiy.c).process(media(), '', { tasniflama: false });
  check('tasniflama=false: classify chaqirildi', odatiy.chaqiruv.length === 1);
}

// ─── 2. Hujjat — tekshiruv OCHILMAYDI ────────────────────────────────────
{
  const { c } = tasnifchi({ kind: 'hujjat', note: 'shartnoma', failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(media(), '');
  check('hujjat: needsReview YOLG\'ON', r.needsReview === false, String(r.needsReview));
  check('hujjat: chek tekshiruvi yo\'q', r.receiptSource === null, String(r.receiptSource));
  check('hujjat: belgi hujjat deydi', r.agentText.includes('hujjat'), r.agentText);
}

// ─── 3. Boshqa — tekshiruv ochilmaydi ────────────────────────────────────
{
  const { c } = tasnifchi({ kind: 'boshqa', note: null, failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(media(), '');
  check('boshqa: needsReview yolg\'on', r.needsReview === false, String(r.needsReview));
}

// ─── 4. Noaniq — JAVOB keldi va u "bilmadim" ─────────────────────────────
// `failed: false` — model javob berdi, lekin rasmni aniqlay olmadi.
// Chek bo'lishi mumkin: operator ko'radi, agent mijozga hech narsa demaydi.
{
  const { c } = tasnifchi({ kind: 'noaniq', note: null, failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(media(), '');
  check('noaniq: needsReview rost', r.needsReview === true, String(r.needsReview));
  check('noaniq: manba aniqlanmagan', r.receiptSource === 'aniqlanmagan', String(r.receiptSource));
  check('noaniq: imageStatus done', r.imageStatus === 'done', r.imageStatus);
  check('noaniq: belgi aniqlanmaganini aytadi', r.agentText.includes('aniqlanmadi'), r.agentText);
}

// ─── 5. Stiker — vision UMUMAN chaqirilmaydi ─────────────────────────────
{
  const { c, chaqiruv } = tasnifchi({ kind: 'boshqa', note: null, failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(media({ kind: 'sticker', mimeType: null, stickerAlt: '👋' }), '');
  check('stiker: vision chaqirilmaydi', chaqiruv.length === 0, String(chaqiruv.length));
  check('stiker: emoji belgida', r.agentText === '[stiker: 👋]', r.agentText);
  check('stiker: needsReview yolg\'on', r.needsReview === false, String(r.needsReview));
}

// ─── 6. PDF bo'lmagan hujjat — chaqiruvsiz noaniq ────────────────────────
{
  const { c, chaqiruv } = tasnifchi({ kind: 'tolov', note: null, failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(
    media({ kind: 'document', mimeType: 'application/msword', fileName: 'a.doc' }),
    '',
  );
  check('doc: vision chaqirilmaydi', chaqiruv.length === 0, String(chaqiruv.length));
  check('doc: noaniq', r.imageKind === 'noaniq', String(r.imageKind));
  check('doc: manba aniqlanmagan', r.receiptSource === 'aniqlanmagan', String(r.receiptSource));
  // Chaqiruv QILINMADI — bu xato emas, qaror. Shuning uchun `done`:
  // javobimiz bor va u "noaniq".
  check('doc: imageStatus done', r.imageStatus === 'done', r.imageStatus);
  check('doc: belgi rasm demaydi', r.agentText === '[hujjat]', r.agentText);
}

// ─── 7. Tasnifchi o'chirilgan — BUGUNGI xatti-harakat ────────────────────
{
  const { c, chaqiruv } = tasnifchi({ kind: 'tolov', note: null, failed: false }, false);
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(media(), '');
  check('o\'chirilgan: chaqiruv yo\'q', chaqiruv.length === 0, String(chaqiruv.length));
  check('o\'chirilgan: imageStatus none', r.imageStatus === 'none', r.imageStatus);
  check('o\'chirilgan: needsReview rost', r.needsReview === true, String(r.needsReview));
  check('o\'chirilgan: manba aniqlanmagan', r.receiptSource === 'aniqlanmagan', String(r.receiptSource));
}

// ─── 8. Chaqiruv YIQILDI — chek tekshiruvi baribir ochiladi ──────────────
//
// `failed: true` degani "javob kelmadi": Anthropic ishlamayapti, muhlat
// tugadi yoki limitga urildik. Tasnifga ishonib chekni o'tkazib yuborsak,
// to'lagan mijoz qistalaverardi — shuning uchun operator ko'radi.
{
  const { c, chaqiruv } = tasnifchi({ kind: 'noaniq', note: null, failed: true });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(media(), '');
  check('yiqildi: chaqiruv bo\'ldi', chaqiruv.length === 1, String(chaqiruv.length));
  check('yiqildi: needsReview rost', r.needsReview === true, String(r.needsReview));
  check('yiqildi: manba aniqlanmagan', r.receiptSource === 'aniqlanmagan', String(r.receiptSource));
  check(
    'yiqildi: sabab aniqlanmagan matni',
    r.reviewReason === 'Mijoz rasm/fayl yubordi, nimaligi aniqlanmadi — chek bo\'lishi mumkin, tekshiring',
    String(r.reviewReason),
  );
  check('yiqildi: imageStatus failed', r.imageStatus === 'failed', r.imageStatus);
}

// ─── 9. Caption belgini BOSIB KETMAYDI ──────────────────────────────────
//
// Mijoz ko'pincha rasm bilan birga "mana" yoki "to'ladim" deb yozadi.
// Ilgari caption belgining o'rniga qo'yilardi va agent hujjat/noaniq
// qoidalarini umuman ko'rmasdi — ya'ni qoida real trafikning katta
// qismida ishlamasdi.
{
  const { c } = tasnifchi({ kind: 'hujjat', note: null, failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(media(), 'mana');
  check('caption: matn qoladi', r.agentText.includes('mana'), r.agentText);
  check('caption: belgi ham bor', r.agentText.includes('hujjat rasmini'), r.agentText);
}

// ─── 10. Video — rasm so'zlari ishlatilmaydi ────────────────────────────
//
// Telegram video-stiker va GIF ni `video` deb beradi. Kulgili GIF ga
// "bu to'lov cheki edimi?" deb so'rash — bu ish aynan shu chalkashlikni
// yo'q qilish uchun qilinyapti.
{
  const { c, chaqiruv } = tasnifchi({ kind: 'tolov', note: null, failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(media({ kind: 'video', mimeType: 'video/mp4', fileName: 'gif.mp4' }), '');
  check('video: vision chaqirilmaydi', chaqiruv.length === 0, String(chaqiruv.length));
  check('video: o\'z belgisi', r.agentText === '[video]', r.agentText);
  check('video: belgida "rasm" yo\'q', !r.agentText.includes('rasm'), r.agentText);
  check('video: needsReview yolg\'on', r.needsReview === false, String(r.needsReview));
  check('video: chek tekshiruvi yo\'q', r.receiptSource === null, String(r.receiptSource));
}

// ─── 11. HEIC rasm — tasnifchiga YUBORILMAYDI ───────────────────────────
//
// `mediaFromMessage` har qanday `image/*` hujjatni `photo` ga
// aylantiradi, ya'ni iPhone'dan "fayl sifatida" kelgan chek `image/heic`
// bo'lib tushadi. Anthropic bu turni qabul qilmaydi; ilgari u
// `image/jpeg` deb belgilanib yuborilardi va 400 qaytardi.
{
  const { c, chaqiruv } = tasnifchi({ kind: 'tolov', note: null, failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(media({ kind: 'photo', mimeType: 'image/heic', fileName: 'IMG_1.heic' }), '');
  check('heic: vision chaqirilmaydi', chaqiruv.length === 0, String(chaqiruv.length));
  check('heic: noaniq', r.imageKind === 'noaniq', String(r.imageKind));
  check('heic: imageStatus done', r.imageStatus === 'done', r.imageStatus);
  check('heic: manba aniqlanmagan', r.receiptSource === 'aniqlanmagan', String(r.receiptSource));
  check('heic: belgi rasm haqida', r.agentText.includes('rasm'), r.agentText);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
