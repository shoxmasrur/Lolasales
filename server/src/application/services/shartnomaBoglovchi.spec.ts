import { ShartnomaBoglovchi, MATN_TASDIQ, MATN_TOPILMADI, MATN_CRM_XATO, MATN_HUJJAT_SORASH } from '@/application/services/ShartnomaBoglovchi';
import type { NomalumSuhbat } from '@/domain/entities/NomalumSuhbat';
import type { Conversation } from '@/domain/entities/Conversation';
import type { Client } from '@/domain/entities/Client';
import type { Contract } from '@/domain/entities/Contract';
import type { PreviewResult, CreateResult } from '@/application/usecases/clients/CreateClientFromContract';
import type { DomainEvent } from '@/domain/services/support';
import { ConflictError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:shartnoma-boglovchi --workspace=server
 *
 * Telegramga ham, bazaga ham, CRM'ga ham chiqmaydi (hammasi soxta).
 *
 * NEGA KERAK: notanish odam shartnoma raqamini yozsa, bizning kod (model
 * emas) uni haqiqiy mijozga bog'laydi. Telefon mosligi tekshiruvi buzilsa,
 * begona odam boshqaning shartnomasiga ulanib, uning ma'lumotini ko'radi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const CONV = 'conv-nomalum';
const AKK = 'akk-1';
const MIJOZ = 'mijoz-1';
const RAQAM = 'AB12345';

interface Opts {
  telegramTelefon?: string | null;
  bazadaBor?: boolean;
  mijozTelefoni?: string | null;
  bloklangan?: string[];
  preview?: Partial<PreviewResult>;
  create?: Partial<CreateResult>;
  mavjudSuhbat?: Partial<Conversation> | null;
  urinishlar?: number;
  topilmagan?: number;
  holat?: NomalumSuhbat['holat'];
  mijozTelegram?: string | null;
  boglashXato?: Error;
}

function qur(o: Opts = {}) {
  let suhbat: NomalumSuhbat = {
    conversationId: CONV, holat: o.holat ?? 'kutilmoqda', agentJavoblari: 1, urinishlar: o.urinishlar ?? 0, topilmagan: o.topilmagan ?? 0,
    shartnomaRaqami: RAQAM, topilganClientId: null,
    telegramTelefon: o.telegramTelefon === undefined ? '+998901234567' : o.telegramTelefon,
    sabab: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const k = {
    boglash: [] as Array<Record<string, unknown>>,
    yuborilgan: [] as Array<{ body: string; author: string; meta?: Record<string, unknown> }>,
    convPatches: [] as Array<Record<string, unknown>>,
    events: [] as DomainEvent[],
    preview: 0, execute: 0,
    get suhbat() { return suhbat; },
  };
  const conversation = { id: CONV, clientId: 'nomalum-mijoz', telegramAccountId: AKK } as unknown as Conversation;
  const b = new ShartnomaBoglovchi({
    contracts: {
      findByContractNo: async (no) => (o.bazadaBor !== false && no === RAQAM
        ? ({ id: 'k1', clientId: MIJOZ, contractNo: RAQAM } as unknown as Contract) : null),
    },
    clients: {
      findById: async (id) => (id === 'nomalum-mijoz'
        ? ({ id, nomalum: true, phone: null, extraPhones: [], telegramUserId: '777' } as unknown as Client)
        : ({
          id, phone: o.mijozTelefoni === undefined ? '+998901234567' : o.mijozTelefoni, extraPhones: [],
          telegramUserId: o.mijozTelegram ?? null,
        } as unknown as Client)),
    },
    conversations: {
      findById: async () => conversation,
      // Haqiqiy repo kabi: faqat SHU akkauntdagi tirik suhbat.
      findLiveByClientAndAccount: async (_id, akk) => {
        if (!o.mavjudSuhbat) return null;
        const s = { id: 'conv-mavjud', clientId: MIJOZ, telegramAccountId: AKK, ...o.mavjudSuhbat } as Conversation;
        return s.telegramAccountId === akk ? s : null;
      },
      update: async (_id, patch) => { k.convPatches.push(patch as Record<string, unknown>); return conversation; },
    },
    phoneBlocks: { listForClient: async () => o.bloklangan ?? [] },
    fromContract: {
      preview: async () => {
        k.preview += 1;
        return { outcome: 'ok', existingClient: null, matchedByPhone: null, contract: null, ...o.preview } as PreviewResult;
      },
      execute: async () => {
        k.execute += 1;
        return { outcome: 'created', clientId: MIJOZ, ...o.create } as CreateResult;
      },
    },
    nomalum: {
      ensure: async () => suhbat,
      find: async () => suhbat,
      update: async (_id, patch) => { suhbat = { ...suhbat, ...patch }; return suhbat; },
      holatniAlmashtir: async (_id, eski, yangi) => {
        if (suhbat.holat !== eski) return false;
        suhbat = { ...suhbat, holat: yangi };
        return true;
      },
    },
    boglash: {
      execute: async (input) => {
        if (o.boglashXato) throw o.boglashXato;
        k.boglash.push(input as unknown as Record<string, unknown>);
        return { conversationId: input.conversationId };
      },
    },
    dispatcher: {
      send: async (opt) => {
        k.yuborilgan.push({ body: opt.body, author: opt.author, meta: opt.meta });
        return {} as never;
      },
    },
    events: { publish: (e) => { k.events.push(e); }, subscribe: () => () => undefined },
  });
  return { b, k };
}

async function main(): Promise<void> {
  // 1. Bazada bor, telefon mos → avtomatik bog'lanadi, odamga tayyor matn ketmaydi.
  {
    const { b, k } = qur();
    await b.tekshir(CONV, ' ab-12345 ');
    check('1: boglash.execute chaqirildi', k.boglash.length === 1, JSON.stringify(k.boglash));
    check('1: birlashtir=false va to\'g\'ri mijoz', k.boglash[0]?.birlashtir === false && k.boglash[0]?.clientId === MIJOZ
      && k.boglash[0]?.conversationId === CONV && k.boglash[0]?.actor === 'nomalum-agent');
    check('1: odamga matn yuborilmadi', k.yuborilgan.length === 0);
    check('1: CRM so\'ralmadi (bazada bor)', k.preview === 0 && k.execute === 0);
  }

  // 2. Telefon mos emas → hujjat (pasport / shartnoma 1-beti rasmi) so'raladi.
  // Operator hali chaqirilmaydi: rasm kelgach (`NomalumHujjatQabul`) chaqiriladi.
  {
    const { b, k } = qur({ mijozTelefoni: '+998907777777' });
    await b.tekshir(CONV, RAQAM);
    check('2: bog\'lanmadi', k.boglash.length === 0);
    check('2: holat hujjat_kutilmoqda', k.suhbat.holat === 'hujjat_kutilmoqda', k.suhbat.holat);
    check('2: topilganClientId', k.suhbat.topilganClientId === MIJOZ);
    check('2: sabab yozildi', Boolean(k.suhbat.sabab));
    check('2: shartnomaRaqami saqlandi', k.suhbat.shartnomaRaqami === RAQAM);
    check('2: hujjat so\'rash matni yuborildi', k.yuborilgan.length === 1 && k.yuborilgan[0]?.body === MATN_HUJJAT_SORASH
      && MATN_HUJJAT_SORASH === 'Rahmat! Shaxsingizni tasdiqlash uchun pasportingiz yoki shartnomangizning birinchi beti rasmini yuboring.');
    check('2: muallif agent, meta tayyorMatn', k.yuborilgan[0]?.author === 'agent' && k.yuborilgan[0]?.meta?.tayyorMatn === true
      && k.yuborilgan[0]?.meta?.nomalum === true);
    check('2: needsHuman HALI qo\'yilmadi', !k.convPatches.some((p) => p.needsHuman === true), JSON.stringify(k.convPatches));
    check('2: conversation.updated', k.events.some((e) => e.type === 'conversation.updated'));
  }

  // 2b. Telegram raqami yashirin → ham hujjat (avtomatik bog'lash yo'q).
  {
    const { b, k } = qur({ telegramTelefon: null });
    await b.tekshir(CONV, RAQAM);
    check('2b: yashirin raqam bilan bog\'lanmadi', k.boglash.length === 0 && k.suhbat.holat === 'hujjat_kutilmoqda');
    check('2b: needsHuman yo\'q', !k.convPatches.some((p) => p.needsHuman === true));
  }

  // 2c. Hujjat kutilayotgan suhbatda qayta tekshiruv (poyga) — hech narsa o'zgarmaydi.
  {
    const { b, k } = qur({ holat: 'hujjat_kutilmoqda' });
    await b.tekshir(CONV, RAQAM);
    check('2c: hujjat_kutilmoqda → tegilmadi', k.boglash.length === 0 && k.yuborilgan.length === 0
      && k.suhbat.holat === 'hujjat_kutilmoqda' && k.preview === 0);
  }

  // 3. Bazada yo'q → CRM preview ok → execute created → CRM telefoni bilan qaror.
  {
    const { b, k } = qur({
      bazadaBor: false, mijozTelefoni: null,
      preview: { contract: { contractNo: RAQAM, clientName: 'X', phones: ['998901234567'], objectName: null, overdueTotal: 0, daysOverdue: 0 } },
    });
    await b.tekshir(CONV, RAQAM);
    check('3: preview va execute chaqirildi', k.preview === 1 && k.execute === 1);
    check('3: CRM telefoni mos → bog\'landi', k.boglash.length === 1 && k.boglash[0]?.clientId === MIJOZ);
  }
  {
    const { b, k } = qur({
      bazadaBor: false, mijozTelefoni: null,
      preview: { contract: { contractNo: RAQAM, clientName: 'X', phones: ['+998905555555'], objectName: null, overdueTotal: 0, daysOverdue: 0 } },
    });
    await b.tekshir(CONV, RAQAM);
    check('3b: CRM telefoni mos emas → hujjat', k.boglash.length === 0 && k.suhbat.holat === 'hujjat_kutilmoqda');
  }

  // 4. Topilmadi → `topilmagan` oshadi; ikkinchi marta operatorga.
  // Odam avval salom bergan (agent raqam so'ragan — urinishlar=1): bu
  // topilmagan hisobiga kirmaydi, baribir ikki imkoniyat qoladi.
  {
    const { b, k } = qur({ bazadaBor: false, preview: { outcome: 'not_found' }, urinishlar: 1 });
    await b.tekshir(CONV, RAQAM);
    check('4: topilmagan 1, urinishlar tegilmadi', k.suhbat.topilmagan === 1 && k.suhbat.urinishlar === 1,
      `${k.suhbat.topilmagan}/${k.suhbat.urinishlar}`);
    check('4: topilmadi matni', k.yuborilgan[0]?.body === MATN_TOPILMADI
      && MATN_TOPILMADI === 'Bu raqamli shartnoma topilmadi. Iltimos, raqamni tekshirib, qayta yozing.');
    check('4: hali operatorga emas', k.suhbat.holat === 'kutilmoqda' && !k.convPatches.some((p) => p.needsHuman));
    check('4: execute chaqirilmadi', k.execute === 0);
    await b.tekshir(CONV, RAQAM);
    check('4: ikkinchi marta operatorda', k.suhbat.holat === 'operatorda' && k.suhbat.topilmagan === 2 && k.suhbat.urinishlar === 1, k.suhbat.holat);
    check('4: ikkinchi marta needsHuman', k.convPatches.some((p) => p.needsHuman === true));
  }
  {
    // Tozalab bo'lmaydigan raqam (kirill) → topilmadi yo'li, bazaga ham CRM'ga ham chiqmaydi.
    const { b, k } = qur();
    await b.tekshir(CONV, 'АБ');
    check('4b: yaroqsiz raqam → topilmadi', k.suhbat.topilmagan === 1 && k.preview === 0 && k.boglash.length === 0);
  }

  // 5. CRM xatosi → neytral matn, operatorda.
  for (const outcome of ['error', 'disabled'] as const) {
    const { b, k } = qur({ bazadaBor: false, preview: { outcome } });
    await b.tekshir(CONV, RAQAM);
    check(`5 (${outcome}): CRM xato matni`, k.yuborilgan[0]?.body === MATN_CRM_XATO
      && MATN_CRM_XATO === 'Rahmat! Tekshirib, tez orada javob beramiz.');
    check(`5 (${outcome}): operatorda`, k.suhbat.holat === 'operatorda' && k.convPatches.some((p) => p.needsHuman === true));
  }
  {
    const { b, k } = qur({ bazadaBor: false, create: { outcome: 'error', clientId: null } });
    await b.tekshir(CONV, RAQAM);
    check('5b: execute xatosi → operatorda', k.suhbat.holat === 'operatorda' && k.boglash.length === 0);
  }

  // 6. Mijozning shu akkauntda boshqa suhbati bor → tasdiq.
  {
    const { b, k } = qur({ mavjudSuhbat: {} });
    await b.tekshir(CONV, RAQAM);
    check('6: bog\'lanmadi', k.boglash.length === 0);
    check('6: sabab', k.suhbat.holat === 'hujjat_kutilmoqda' && k.suhbat.sabab === 'Mijozning shu akkauntda boshqa suhbati bor', String(k.suhbat.sabab));
  }
  {
    // Boshqa akkauntdagi suhbat to'siq emas.
    const { b, k } = qur({ mavjudSuhbat: { telegramAccountId: 'akk-2' } });
    await b.tekshir(CONV, RAQAM);
    check('6b: boshqa akkauntdagi suhbat → bog\'landi', k.boglash.length === 1);
  }

  // 6c. Haqiqiy mijozning ENG YANGI suhbati boshqa akkauntda, lekin shu akkauntda ham
  // tirik suhbat bor — baribir topiladi (findLiveByClientAndAccount).
  {
    const { b, k } = qur({ mavjudSuhbat: { id: 'conv-shu-akk' } });
    await b.tekshir(CONV, RAQAM);
    check('6c: shu akkauntdagi suhbat topildi → hujjat', k.boglash.length === 0 && k.suhbat.holat === 'hujjat_kutilmoqda');
  }

  // 6d. Mijozda BOSHQA Telegram hisobi saqlangan → avtomatik almashtirilmaydi.
  {
    const { b, k } = qur({ mijozTelegram: '555' });
    await b.tekshir(CONV, RAQAM);
    check('6d: boshqa Telegram → bog\'lanmadi', k.boglash.length === 0);
    check('6d: sabab', k.suhbat.holat === 'hujjat_kutilmoqda' && k.suhbat.sabab === 'Mijozda boshqa Telegram hisobi bor', String(k.suhbat.sabab));
  }
  {
    // O'sha odamning o'zi (id bir xil) — to'siq emas.
    const { b, k } = qur({ mijozTelegram: '777' });
    await b.tekshir(CONV, RAQAM);
    check('6e: o\'sha Telegram hisobi → bog\'landi', k.boglash.length === 1);
  }

  // 7. Uzilgan (bloklangan) raqam mos deb hisoblanmaydi.
  {
    const { b, k } = qur({ bloklangan: ['+998901234567'] });
    await b.tekshir(CONV, RAQAM);
    check('7: bloklangan raqam → bog\'lanmadi', k.boglash.length === 0 && k.suhbat.holat === 'hujjat_kutilmoqda');
  }

  // 8. Bog'lash poygada ConflictError berdi → tasdiqqa, rad etilmaydi.
  {
    const { b, k } = qur({ boglashXato: new ConflictError('poyga') });
    let otildi = false;
    try { await b.tekshir(CONV, RAQAM); } catch { otildi = true; }
    check('8: rad etilmadi', !otildi);
    // Telefon MOS kelgan (egasi tasdiqlangan), faqat poyga — eski yo'l: darhol operator tasdig'i.
    check('8: tasdiq_kutilmoqda', k.suhbat.holat === 'tasdiq_kutilmoqda' && k.suhbat.topilganClientId === MIJOZ);
    check('8: tasdiq matni va needsHuman', k.yuborilgan[0]?.body === MATN_TASDIQ && k.convPatches.some((p) => p.needsHuman === true));
  }

  // 9. Kutilmagan xato → operatorda, rad etilmaydi.
  {
    const { b, k } = qur({ boglashXato: new Error('baza yiqildi') });
    let otildi = false;
    try { await b.tekshir(CONV, RAQAM); } catch { otildi = true; }
    check('9: rad etilmadi', !otildi);
    check('9: operatorda', k.suhbat.holat === 'operatorda' && k.convPatches.some((p) => p.needsHuman === true));
  }

  // 10. Mijozga ko'rinadigan matnlarda "qarz" yo'q.
  check('10: matnlarda "qarz" yo\'q', ![MATN_TASDIQ, MATN_TOPILMADI, MATN_CRM_XATO, MATN_HUJJAT_SORASH].some((m) => /qarz/i.test(m)));

  if (failed) {
    console.error(`\n${failed} ta tekshiruv yiqildi`);
    process.exit(1);
  }
  console.log('\nHammasi o\'tdi');
}

void main();
