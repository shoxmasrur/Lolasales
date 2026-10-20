import { chekManbai, faylBelgisi, IncomingMediaProcessor } from '@/application/services/IncomingMediaProcessor';
import type { IImageClassifier, ImageClassifyResult } from '@/domain/services/IImageClassifier';
import type { IMediaStorage } from '@/domain/services/IMediaStorage';
import type { ISpeechToText } from '@/domain/services/ISpeechToText';
import type { IncomingMedia } from '@/domain/services/ITelegramGateway';

/**
 * Qo'lda ishga tushiriladi: npm run test:pdf-oqimi --workspace=server
 *
 * Tarmoqqa ham, diskka ham chiqmaydi — hamma port soxta.
 *
 * PDF uchun qoida rasmnikidan QATTIQROQ (2026-09-24): faqat `tolov` chek
 * manbai bo'ladi, `hujjat` va `boshqa` ham `aniqlanmagan` bo'lib
 * operatorga tushadi. Sababi — 2026-09-24 gacha HAR QANDAY PDF operatorda
 * edi va model xato tasniflasa chek e'tibordan chetda qolmasligi kerak.
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

const storage = {
  save: async () => ({ path: 'storage/media/x.pdf', sizeBytes: 100 }),
} as unknown as IMediaStorage;

const stt = { available: false, transcribe: async () => ({ ok: false, reason: 'yo\'q' }) } as unknown as ISpeechToText;

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

function pdf(patch: Partial<IncomingMedia> = {}): IncomingMedia {
  return {
    kind: 'document',
    mimeType: 'application/pdf',
    fileName: 'chek.pdf',
    sizeBytes: 100,
    durationSec: null,
    stickerAlt: null,
    download: async () => Buffer.from('pdf'),
    ...patch,
  } as IncomingMedia;
}

// ─── 1. chekManbai — PDF va rasm qoidalari ───────────────────────────────
check('pdf tolov → tolov', chekManbai('tolov', true) === 'tolov');
check('pdf hujjat → aniqlanmagan', chekManbai('hujjat', true) === 'aniqlanmagan', String(chekManbai('hujjat', true)));
check('pdf boshqa → aniqlanmagan', chekManbai('boshqa', true) === 'aniqlanmagan', String(chekManbai('boshqa', true)));
check('pdf noaniq → aniqlanmagan', chekManbai('noaniq', true) === 'aniqlanmagan');
check('pdf tasnifsiz → aniqlanmagan', chekManbai(null, true) === 'aniqlanmagan');

check('rasm tolov → tolov', chekManbai('tolov', false) === 'tolov');
check('rasm hujjat → tekshiruv YO\'Q', chekManbai('hujjat', false) === null, String(chekManbai('hujjat', false)));
check('rasm boshqa → tekshiruv YO\'Q', chekManbai('boshqa', false) === null, String(chekManbai('boshqa', false)));
check('rasm noaniq → aniqlanmagan', chekManbai('noaniq', false) === 'aniqlanmagan');

// ─── 2. faylBelgisi ──────────────────────────────────────────────────────
check('tolov belgisi chek deydi', faylBelgisi('tolov') === '[mijoz to\'lov cheki yubordi]', faylBelgisi('tolov'));
check('hujjat belgisi neytral', faylBelgisi('hujjat') === '[mijoz PDF fayl yubordi]', faylBelgisi('hujjat'));
check('noaniq belgisi neytral', faylBelgisi('noaniq') === '[mijoz PDF fayl yubordi]', faylBelgisi('noaniq'));
check('tasnifsiz belgi neytral', faylBelgisi(null) === '[mijoz PDF fayl yubordi]', faylBelgisi(null));
check('belgida "rasm" so\'zi yo\'q', !faylBelgisi('hujjat').includes('rasm'), faylBelgisi('hujjat'));

// ─── 3. PDF chek — rasm chek bilan bir xil yo'l ──────────────────────────
{
  const { c, chaqiruv } = tasnifchi({ kind: 'tolov', note: 'Xonsaroy Pay', failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(pdf(), '');
  check('pdf tolov: vision chaqirildi', chaqiruv.length === 1, String(chaqiruv.length));
  check('pdf tolov: manba tolov', r.receiptSource === 'tolov', String(r.receiptSource));
  check('pdf tolov: needsReview rost', r.needsReview === true);
  check('pdf tolov: belgi chek deydi', r.agentText === '[mijoz to\'lov cheki yubordi]', r.agentText);
  check('pdf tolov: tavsif saqlanadi', r.imageNote === 'Xonsaroy Pay', String(r.imageNote));
}

// ─── 4. Chek bo'lmagan PDF — operatorga ──────────────────────────────────
{
  const { c } = tasnifchi({ kind: 'hujjat', note: 'shartnoma', failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(pdf({ fileName: 'shartnoma.pdf' }), '');
  check('pdf hujjat: manba aniqlanmagan', r.receiptSource === 'aniqlanmagan', String(r.receiptSource));
  check('pdf hujjat: needsReview rost', r.needsReview === true);
  check('pdf hujjat: imageKind hujjat yoziladi', r.imageKind === 'hujjat', String(r.imageKind));
  check('pdf hujjat: belgi neytral', r.agentText === '[mijoz PDF fayl yubordi]', r.agentText);
}

// ─── 5. Tasnif yiqildi — bugungi xatti-harakat ───────────────────────────
{
  const { c } = tasnifchi({ kind: 'noaniq', note: null, failed: true });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(pdf(), '');
  check('pdf yiqildi: manba aniqlanmagan', r.receiptSource === 'aniqlanmagan', String(r.receiptSource));
  check('pdf yiqildi: imageStatus failed', r.imageStatus === 'failed', r.imageStatus);
  check('pdf yiqildi: belgi neytral', r.agentText === '[mijoz PDF fayl yubordi]', r.agentText);
}

// ─── 6. PDF bo'lmagan hujjat — hech narsa o'zgarmadi ─────────────────────
{
  const { c, chaqiruv } = tasnifchi({ kind: 'tolov', note: null, failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(
    pdf({ mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileName: 'ariza.docx' }),
    '',
  );
  check('docx: vision chaqirilmaydi', chaqiruv.length === 0, String(chaqiruv.length));
  check('docx: manba aniqlanmagan', r.receiptSource === 'aniqlanmagan', String(r.receiptSource));
  check('docx: belgi eski', r.agentText === '[hujjat]', r.agentText);
}

// ─── 7. Caption belgining o'rnini bosmaydi ───────────────────────────────
{
  const { c } = tasnifchi({ kind: 'tolov', note: null, failed: false });
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(pdf(), 'mana');
  check('caption belgi yoniga qo\'shiladi', r.agentText === 'mana\n[mijoz to\'lov cheki yubordi]', r.agentText);
}

// ─── 8. Tasnifchi o'chiq — PDF vision'ga yuborilmaydi ────────────────────
// `pdfMi(...)` tekshiruvi `visionGaYuborildi` dan oldin turadi: tasnifchi
// o'chiq bo'lsa ham PDF `[hujjat]` emas, neytral `[mijoz PDF fayl yubordi]`
// belgisini oladi (2026-09-24 xatti-harakati).
{
  const { c, chaqiruv } = tasnifchi({ kind: 'tolov', note: null, failed: false }, false);
  const p = new IncomingMediaProcessor(storage, stt, c);
  const r = await p.process(pdf(), '');
  check('tasnifchi o\'chiq: vision chaqirilmadi', chaqiruv.length === 0, String(chaqiruv.length));
  check('tasnifchi o\'chiq: belgi neytral', r.agentText === '[mijoz PDF fayl yubordi]', r.agentText);
  check('tasnifchi o\'chiq: manba aniqlanmagan', r.receiptSource === 'aniqlanmagan', String(r.receiptSource));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
