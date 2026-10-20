import { MijozYaratuvchi } from '@/application/services/MijozYaratuvchi';
import type { Client, NewClient } from '@/domain/entities/Client';
import type { IncomingMessage } from '@/domain/services/ITelegramGateway';

/** Qo'lda ishga tushiriladi: npm run test:mijoz-yaratuvchi --workspace=server (bazasiz). */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

function qurish(opts: { poyga?: boolean } = {}) {
  const rows: Client[] = [];
  let n = 0;
  let poygaQolgan = opts.poyga ?? false;
  const clients = {
    findByTelegramUserId: async (id: string) => {
      // Poyga: birinchi qidiruvda yo'q, create paytida boshqa jarayon yaratib ulguradi.
      if (poygaQolgan) return null;
      return rows.find((r) => r.telegramUserId === id) ?? null;
    },
    findByPhone: async (p: string) => rows.find((r) => r.phone === p) ?? null,
    create: async (d: NewClient) => {
      if (poygaQolgan) {
        poygaQolgan = false;
        rows.push(mijoz(`c${++n}`, d));
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }
      const c = mijoz(`c${++n}`, d);
      rows.push(c);
      return c;
    },
  };
  const xarid: Array<string> = [];
  const kurslar: Array<string> = [];
  const events: unknown[] = [];
  const y = new MijozYaratuvchi(
    clients as never,
    {
      faolXarid: async (id: string) => { xarid.push(id); return { stage: 'yangi' }; },
      kursBelgila: async (id: string, k: string) => { kurslar.push(`${id}:${k}`); return { stage: 'yangi' }; },
    } as never,
    { publish: (e: unknown) => events.push(e) } as never,
  );
  return { y, rows, xarid, kurslar, events };
}

function mijoz(id: string, d: NewClient): Client {
  return {
    id, fullName: d.fullName, phone: d.phone ?? null, source: d.source ?? 'qolda',
    sourceGroup: d.sourceGroup ?? null, sourceComment: d.sourceComment ?? null,
    telegramUserId: d.telegram?.telegramUserId ?? null, telegramAccountId: d.telegram?.telegramAccountId ?? null,
    createdImportBatchId: d.createdImportBatchId ?? null,
  } as unknown as Client;
}

const kiruvchi = (o: Partial<IncomingMessage> = {}): IncomingMessage => ({
  telegramAccountId: 'acc1', telegramUserId: '555', accessHash: 'h', username: 'aziz', fullName: 'Aziz Karimov',
  phone: null, telegramMsgId: 1, text: 'Salom', media: null, receivedAt: new Date(), ...o,
});

(async () => {
  {
    const { y, rows, xarid } = qurish();
    const c = await y.reklamadan(kiruvchi());
    check('reklama: yangi mijoz source=reklama', [rows.length, c.source], [1, 'reklama']);
    check('reklama: ism va telegram shaxsi', [c.fullName, c.telegramUserId, c.telegramAccountId], ['Aziz Karimov', '555', 'acc1']);
    check('reklama: faol xarid ochildi', xarid, ['c1']);
    const c2 = await y.reklamadan(kiruvchi({ telegramMsgId: 2 }));
    check('reklama: ikkinchi chaqiruv mavjudni qaytaradi', [rows.length, c2.id, xarid.length], [1, 'c1', 1]);
  }
  {
    const { y } = qurish();
    check('ism yo\'q — @username', (await y.reklamadan(kiruvchi({ fullName: ' ', telegramUserId: '1' }))).fullName, '@aziz');
    check('ism va username yo\'q — telefon',
      (await y.reklamadan(kiruvchi({ fullName: '', username: null, phone: '+998901234567', telegramUserId: '2' }))).fullName,
      '+998901234567');
  }
  {
    const { y, rows } = qurish({ poyga: true });
    const c = await y.reklamadan(kiruvchi());
    check('poyga: unique xatosidan keyin mavjud mijoz qaytadi, ikkinchisi yaratilmaydi', [rows.length, c.id], [1, 'c1']);
  }
  {
    const { y, rows, xarid } = qurish();
    const a = await y.guruhdan({
      accountId: 'acc1',
      peer: { telegramUserId: '777', accessHash: 'x', username: 'g', firstName: 'G', lastName: null },
      fullName: 'Guruh Odam', sourceGroup: '@kurs_guruh', sourceComment: 'Narxi qancha?',
    });
    check('guruh: yangi', [a.created, a.client.source, a.client.sourceGroup, a.client.sourceComment], [true, 'guruh', '@kurs_guruh', 'Narxi qancha?']);
    const b = await y.guruhdan({
      accountId: 'acc1',
      peer: { telegramUserId: '777', accessHash: 'x', username: 'g', firstName: 'G', lastName: null },
      fullName: 'Guruh Odam', sourceGroup: '@boshqa', sourceComment: 'yana',
    });
    check('guruh: takror — created=false, manba o\'zgarmaydi', [b.created, b.client.sourceGroup, rows.length, xarid.length], [false, '@kurs_guruh', 1, 1]);
  }
  {
    const { y, rows } = qurish();
    const a = await y.raqamdan({ fullName: 'Ali', phone: '+998901112233', courseId: null, batchId: 'b1' });
    check('raqam: yangi', [a.created, a.client.source, (a.client as unknown as { createdImportBatchId: string }).createdImportBatchId], [true, 'raqam', 'b1']);
    const b = await y.raqamdan({ fullName: 'Boshqa', phone: '+998901112233', courseId: null, batchId: 'b2' });
    check('raqam: takror — created=false, manba o\'zgarmaydi', [b.created, b.client.id, (b.client as unknown as { createdImportBatchId: string }).createdImportBatchId, rows.length], [false, 'c1', 'b1', 1]);
    const k = qurish();
    await k.y.raqamdan({ fullName: 'Kursli', phone: '+998905550000', courseId: 'k1', batchId: 'b9' });
    check('raqam: kurs berilsa xarid shu kursga belgilanadi', [k.kurslar, k.xarid], [['c1:k1'], []]);
    const r = qurish();
    await r.y.reklamadan(kiruvchi({ phone: '+998909998877', telegramUserId: '9' }));
    const c = await r.y.raqamdan({ fullName: 'X', phone: '+998909998877', courseId: null, batchId: 'b3' });
    check('raqam: reklama mijozi telefon bo\'yicha topiladi, manba reklama qoladi', [c.created, c.client.source], [false, 'reklama']);
  }
  {
    // Qo'lda qo'shish: ikki marta bosilgan "Qo'shish" — bitta mijoz, ikkinchisi mavjud deb qaytadi.
    const { y, rows, xarid } = qurish();
    const [a1, a2] = await Promise.all([
      y.qoldan({ fullName: 'Vali', phone: '+998907776655', courseId: null }),
      y.qoldan({ fullName: 'Vali', phone: '+998907776655', courseId: null }),
    ]);
    check('qo\'lda: bir vaqtdagi ikki so\'rov — bitta yaratildi', [rows.length, a1.created, a2.created, a2.client.id], [1, true, false, a1.client.id]);
    check('qo\'lda: manba qolda, xarid ochildi', [a1.client.source, xarid], ['qolda', [a1.client.id]]);
    const b = await y.qoldan({ fullName: 'Boshqa', phone: '+998907776655', courseId: null });
    check('qo\'lda: keyingi takror — created=false', [b.created, rows.length], [false, 1]);
  }
  {
    // Unique buzilishi (boshqa jarayon ulgurdi) — 500 emas, mavjud mijoz qaytadi.
    const { y, rows } = qurish();
    const realCreate = (y as unknown as { clients: { create: (d: NewClient) => Promise<Client> } }).clients.create;
    (y as unknown as { clients: { create: (d: NewClient) => Promise<Client> } }).clients.create = async (d) => {
      await realCreate(d);
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    };
    const r = await y.qoldan({ fullName: 'Gani', phone: '+998901010101', courseId: null });
    check('qo\'lda: unique poyga — mavjud qaytadi', [r.created, r.client.id, rows.length], [false, 'c1', 1]);
  }
  process.exitCode = failed ? 1 : 0;
})();
