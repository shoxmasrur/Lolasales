import { tgAuditOrnat, tgHodisaYoz } from '@/infrastructure/telegram/tgAudit';

/**
 * Qo'lda ishga tushiriladi: npm run test:tg-audit
 *
 * NEGA TEKSHIRILADI: bu o'ram HAR BIR Telegram chaqiruvi ustidan o'tadi.
 * Xato yutilib qolsa yoki o'ram o'zi yiqilsa, ilova butunlay ishlamay
 * qoladi — jurnal uchun qo'shilgan kod asosiy ishni buzgan bo'ladi.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(kutilgan);
  if (a === b) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${b})`);
  }
}

interface Qator {
  daraja: 'info' | 'error';
  obj: Record<string, unknown>;
  msg: string;
}

function yigauvchi(): { qatorlar: Qator[]; yozuvchi: { info: (o: Record<string, unknown>, m: string) => void; error: (o: Record<string, unknown>, m: string) => void } } {
  const qatorlar: Qator[] = [];
  return {
    qatorlar,
    yozuvchi: {
      info: (obj, msg) => qatorlar.push({ daraja: 'info', obj, msg }),
      error: (obj, msg) => qatorlar.push({ daraja: 'error', obj, msg }),
    },
  };
}

/** Soat: har chaqiruvda 100 ms oldinga siljiydi. */
function soat(): () => number {
  let t = 1_000_000;
  return () => {
    t += 100;
    return t;
  };
}

class SendMessage {
  className = 'messages.SendMessage';
  constructor(public message: string) {}
}

// ── 1. Muvaffaqiyatli chaqiruv ikki qator yozadi ───────────────────────
{
  const { qatorlar, yozuvchi } = yigauvchi();
  const client: Record<string, unknown> = {
    invoke: async () => ({ className: 'Updates', updates: [] }),
  };
  tgAuditOrnat(client, 'Madina', { yozuvchi, vaqt: soat() });

  const natija = await (client.invoke as (r: unknown) => Promise<unknown>)(new SendMessage('salom'));

  eq('natija chaqiruvchiga yetdi', (natija as Record<string, unknown>).className, 'Updates');
  eq('ikki qator', qatorlar.length, 2);

  eq('so\'rov yo\'nalishi', qatorlar[0]?.obj.yonalish, 'sorov');
  eq('so\'rov xabari', qatorlar[0]?.msg, '→ messages.SendMessage');
  eq('bayroq qo\'yildi', qatorlar[0]?.obj.flag, 'telegram');
  eq('akkaunt qo\'yildi', qatorlar[0]?.obj.akkaunt, 'Madina');
  eq('so\'rov tanasi', (qatorlar[0]?.obj.body as Record<string, unknown>).message, 'salom');

  eq('javob yo\'nalishi', qatorlar[1]?.obj.yonalish, 'javob');
  eq('javob kodi', qatorlar[1]?.obj.kod, 'OK');
  eq('javob darajasi', qatorlar[1]?.daraja, 'info');
  eq('davomiylik o\'lchandi', qatorlar[1]?.obj.msMuddat, 100);
  eq('javob xabari', qatorlar[1]?.msg, '← messages.SendMessage OK 100ms');

  // Ikki qator bitta chaqiruvga tegishli ekani `id` orqali bilinadi.
  eq('id bir xil', qatorlar[0]?.obj.id, qatorlar[1]?.obj.id);
}

// ── 2. RPC xatosi: kod va Telegram belgisi ─────────────────────────────
{
  const { qatorlar, yozuvchi } = yigauvchi();
  const rpc = Object.assign(new Error('A wait of 35 seconds is required'), {
    code: 420,
    errorMessage: 'FLOOD_WAIT_35',
  });
  const client: Record<string, unknown> = {
    invoke: async () => {
      throw rpc;
    },
  };
  tgAuditOrnat(client, 'Madina', { yozuvchi, vaqt: soat() });

  let tutildi: unknown = null;
  try {
    await (client.invoke as (r: unknown) => Promise<unknown>)(new SendMessage('salom'));
  } catch (err) {
    tutildi = err;
  }

  // ENG MUHIMI: xato yutilmaydi va O'ZGARTIRILMAYDI. Yuqoridagi kod
  // FLOOD_WAIT ni tanib, kutish mantiqini ishga soladi.
  eq('asl xato qayta otildi', tutildi === rpc, true);
  eq('javob darajasi xato', qatorlar[1]?.daraja, 'error');
  eq('RPC kodi', qatorlar[1]?.obj.kod, 420);
  eq('Telegram belgisi', qatorlar[1]?.obj.xatoKod, 'FLOOD_WAIT_35');
  eq('bayroq xatoda ham bor', qatorlar[1]?.obj.flag, 'telegram');

  // Xato tanasi: `Object.entries` ko'rmaydigan `name`/`message` endi
  // alohida to'planadi, kutubxona qo'shgan maydonlar esa saqlanadi.
  const body = qatorlar[1]?.obj.body as Record<string, unknown>;
  eq('xato matni saqlandi', body.matn, 'A wait of 35 seconds is required');
  eq('xato nomi saqlandi', body.nom, 'Error');
  eq('kutubxona maydoni: code', body.code, 420);
  eq('kutubxona maydoni: errorMessage', body.errorMessage, 'FLOOD_WAIT_35');
}

// ── 2b. Xato tanasida FLOOD_WAIT ning `seconds` maydoni ham bor ────────
// Operator aynan shu maydonga qarab qancha kutish kerakligini biladi.
{
  const { qatorlar, yozuvchi } = yigauvchi();
  const rpc = Object.assign(new Error('A wait of 35 seconds is required'), {
    code: 420,
    errorMessage: 'FLOOD_WAIT_35',
    seconds: 35,
  });
  const client: Record<string, unknown> = {
    invoke: async () => {
      throw rpc;
    },
  };
  tgAuditOrnat(client, 'Madina', { yozuvchi, vaqt: soat() });

  try {
    await (client.invoke as (r: unknown) => Promise<unknown>)(new SendMessage('salom'));
  } catch {
    // kutilgan
  }

  const body = qatorlar[1]?.obj.body as Record<string, unknown>;
  eq('seconds maydoni yetdi', body.seconds, 35);
}

// ── 2c. Xato tanasida ham maxfiy maydonlar yashiriladi ──────────────────
// Tozalagich xato tanasiga ham javob tanasidek qo'llanishi kerak.
{
  const { qatorlar, yozuvchi } = yigauvchi();
  const rpc = Object.assign(new Error('SESSION_PASSWORD_NEEDED'), {
    code: 401,
    errorMessage: 'SESSION_PASSWORD_NEEDED',
    phoneCode: '54321',
  });
  const client: Record<string, unknown> = {
    invoke: async () => {
      throw rpc;
    },
  };
  tgAuditOrnat(client, 'Madina', { yozuvchi, vaqt: soat() });

  try {
    await (client.invoke as (r: unknown) => Promise<unknown>)(new SendMessage('salom'));
  } catch {
    // kutilgan
  }

  const body = qatorlar[1]?.obj.body as Record<string, unknown>;
  eq('phoneCode yashirildi', body.phoneCode, '[maxfiy]');
}

// ── 2d. Error bo'lmagan qiymat otilsa ham xato qatori yoziladi ─────────
// Kutubxona har doim ham `Error` otavermaydi — oddiy satr yoki boshqa
// qiymat otishi ham mumkin. Bunda ham audit qatori yozilishi va aynan
// o'sha qiymat qayta otilishi kerak.
{
  const { qatorlar, yozuvchi } = yigauvchi();
  const client: Record<string, unknown> = {
    invoke: async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'oddiy satr';
    },
  };
  tgAuditOrnat(client, 'Madina', { yozuvchi, vaqt: soat() });

  let tutildi: unknown = null;
  try {
    await (client.invoke as (r: unknown) => Promise<unknown>)(new SendMessage('salom'));
  } catch (err) {
    tutildi = err;
  }

  eq('aynan o\'sha qiymat qayta otildi', tutildi, 'oddiy satr');
  eq('xato qatori baribir yozildi', qatorlar[1]?.daraja, 'error');
  eq('Error bo\'lmagan xato tanasi', qatorlar[1]?.obj.body, 'oddiy satr');
}

// ── 3. RPC bo'lmagan xato (ulanish uzildi) ─────────────────────────────
// `code` yo'q — kod o'rniga "XATO", sabab xato matnidan olinadi.
{
  const { qatorlar, yozuvchi } = yigauvchi();
  const client: Record<string, unknown> = {
    invoke: async () => {
      throw new Error('socket yopildi');
    },
  };
  tgAuditOrnat(client, 'Madina', { yozuvchi, vaqt: soat() });

  try {
    await (client.invoke as (r: unknown) => Promise<unknown>)(new SendMessage('salom'));
  } catch {
    // kutilgan
  }

  eq('kod topilmadi', qatorlar[1]?.obj.kod, 'XATO');
  eq('sabab matndan', qatorlar[1]?.obj.xatoKod, 'socket yopildi');
}

// ── 4. Jurnal yiqilsa ham chaqiruv ishlaydi ────────────────────────────
// Bu o'ramning asosiy va'dasi: jurnal uchun qo'shilgan kod asosiy ishni
// HECH QACHON buzmaydi.
{
  const client: Record<string, unknown> = { invoke: async () => 'natija' };
  tgAuditOrnat(client, 'Madina', {
    yozuvchi: {
      info: () => {
        throw new Error('jurnal yiqildi');
      },
      error: () => {
        throw new Error('jurnal yiqildi');
      },
    },
    vaqt: soat(),
  });

  const natija = await (client.invoke as (r: unknown) => Promise<unknown>)(new SendMessage('salom'));
  eq('natija baribir qaytdi', natija, 'natija');
}

// ── 5. invokeWithSender ham o'raladi ───────────────────────────────────
{
  const { qatorlar, yozuvchi } = yigauvchi();
  const client: Record<string, unknown> = {
    invoke: async () => 'a',
    invokeWithSender: async () => 'b',
  };
  tgAuditOrnat(client, 'Madina', { yozuvchi, vaqt: soat() });

  await (client.invokeWithSender as (r: unknown) => Promise<unknown>)(new SendMessage('x'));
  eq('invokeWithSender yozildi', qatorlar.length, 2);
  eq('metod nomi', qatorlar[0]?.obj.metod, 'messages.SendMessage');
}

// ── 6. _media.savePart: so'rov IKKINCHI argumentda ─────────────────────
// Imzosi `savePart(dcId, request, signal)`. Argument o'rni chalkashsa,
// jurnalga metod nomi o'rniga DC raqami tushib qolardi.
{
  const { qatorlar, yozuvchi } = yigauvchi();
  const client: Record<string, unknown> = {
    invoke: async () => 'a',
    _media: { savePart: async () => true },
  };
  tgAuditOrnat(client, 'Madina', { yozuvchi, vaqt: soat() });

  class SaveFilePart {
    className = 'upload.SaveFilePart';
    bytes = Buffer.alloc(1024);
  }
  const media = client._media as { savePart: (d: number, r: unknown, s?: unknown) => Promise<unknown> };
  await media.savePart(2, new SaveFilePart(), null);

  eq('savePart yozildi', qatorlar.length, 2);
  eq('metod so\'rovdan olindi', qatorlar[0]?.obj.metod, 'upload.SaveFilePart');
  eq('baytlar yozilmadi', (qatorlar[0]?.obj.body as Record<string, unknown>).bytes, '<1024 bayt>');
}

// ── 7. _media bo'lmasa jimgina o'tkaziladi ─────────────────────────────
// Kutubxona yangilanib ichki a'zo nomi o'zgarsa, ilova YIQILMASLIGI kerak.
{
  const { yozuvchi } = yigauvchi();
  const client: Record<string, unknown> = { invoke: async () => 'a' };
  let yiqildi = false;
  try {
    tgAuditOrnat(client, 'Madina', { yozuvchi, vaqt: soat() });
  } catch {
    yiqildi = true;
  }
  eq('_media yo\'q — xato yo\'q', yiqildi, false);
}

// ── 8. Kiruvchi hodisa bitta qator yozadi ──────────────────────────────
{
  const { qatorlar, yozuvchi } = yigauvchi();
  tgHodisaYoz('Madina', 'NewMessage', { className: 'Message', message: 'salom' }, { yozuvchi });

  eq('bitta qator', qatorlar.length, 1);
  eq('yo\'nalish hodisa', qatorlar[0]?.obj.yonalish, 'hodisa');
  eq('xabar', qatorlar[0]?.msg, '← hodisa NewMessage');
  eq('bayroq', qatorlar[0]?.obj.flag, 'telegram');
  // Hodisa so'rovga javob emas — bog'lanadigan chaqiruv yo'q.
  eq('id yo\'q', qatorlar[0]?.obj.id, undefined);
}

// ── 9. So'rov obyektining `className` getteri yiqilsa ham chaqiruv ketadi
// `tgMetod(request)` `yoz()` GUARDIDAN TASHQARIDA, `await asl(...)`dan
// OLDIN hisoblanadi. U yiqilsa, Telegram chaqiruvining o'zi umuman
// bo'lmay qolardi — buni `xavfsiz()` orqali himoyalaymiz.
{
  const { qatorlar, yozuvchi } = yigauvchi();
  const client: Record<string, unknown> = {
    invoke: async () => 'natija-keldi',
  };
  tgAuditOrnat(client, 'Madina', { yozuvchi, vaqt: soat() });

  const yovuzSorov: Record<string, unknown> = {};
  Object.defineProperty(yovuzSorov, 'className', {
    get(): string {
      throw new Error('className getteri yiqildi');
    },
    enumerable: true,
  });

  const natija = await (client.invoke as (r: unknown) => Promise<unknown>)(yovuzSorov);
  eq('chaqiruv baribir bajarildi', natija, 'natija-keldi');
  eq('metod zaxira qiymatga tushdi', qatorlar[0]?.obj.metod, "noma'lum");
}

// ── 10. Xato obyektining `code` getteri yiqilsa ham ASL XATO qayta otiladi
// `rpcKod(err)` va `xatoSababi(err)` ham guarddan tashqarida edi. Ular
// yiqilsa, `catch` blokidagi kod o'z xatosini otib, upstream'ga ASL
// obyekt o'rniga BOSHQA obyekt ketardi — bu FLOOD_WAIT va 2FA holatini
// tanishni buzardi.
{
  const { yozuvchi } = yigauvchi();
  const yovuzXato = new Error('asl xato matni');
  Object.defineProperty(yovuzXato, 'code', {
    get(): number {
      throw new Error('code getteri yiqildi');
    },
    enumerable: true,
  });
  const client: Record<string, unknown> = {
    invoke: async () => {
      throw yovuzXato;
    },
  };
  tgAuditOrnat(client, 'Madina', { yozuvchi, vaqt: soat() });

  let tutildi: unknown = null;
  try {
    await (client.invoke as (r: unknown) => Promise<unknown>)(new SendMessage('salom'));
  } catch (err) {
    tutildi = err;
  }
  eq('aynan asl xato obyekti qayta otildi', tutildi === yovuzXato, true);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
