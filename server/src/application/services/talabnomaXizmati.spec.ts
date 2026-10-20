import { TalabnomaXizmati, type TalabnomaXizmatiDeps } from '@/application/services/TalabnomaXizmati';
import { TalabnomaSuhbati } from '@/application/services/TalabnomaSuhbati';
import { XotiradagiTalabnomaRepo } from '@/application/services/talabnomaFake';
import type { Conversation } from '@/domain/entities/Conversation';
import type { TalabnomaNomzodi } from '@/domain/entities/Talabnoma';
import type { SchedulePayment } from '@/domain/repositories/IContractPaymentRepository';
import type { TalabnomaMalumot } from '@/domain/services/ITalabnomaPdf';
import type { Rekvizit, RekvizitNatija } from '@/domain/services/rekvizit';
import { AppError, KillSwitchError } from '@/shared/errors';

/**
 * Qo'lda: npm run test:talabnoma-xizmati --workspace=server
 *
 * «Agent navbati» guruhida: xizmat `shared/logger` orqali `shared/config`
 * ni tortadi. Hamma hamkor — soxta; baza, Telegram, Chromium yo'q.
 */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const xatoKodi = async (fn: () => Promise<unknown>): Promise<string | null> => {
  try { await fn(); return null; } catch (e) { return e instanceof AppError ? e.code : `boshqa: ${String(e)}`; }
};
const xatoMatni = async (fn: () => Promise<unknown>): Promise<string | null> => {
  try { await fn(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
};
const ikkalasi = async (a: () => Promise<unknown>, b: () => Promise<unknown>): Promise<string[]> => {
  const natija = await Promise.allSettled([a(), b()]);
  return natija
    .map((n) => (n.status === 'fulfilled' ? 'ok' : n.reason instanceof AppError ? n.reason.code : 'boshqa'))
    .sort((x, y) => (x === 'ok' ? -1 : y === 'ok' ? 1 : 0));
};

const REK: Rekvizit = {
  kompaniya: 'VATAN RESIDENCE', turi: 'MChJ', inn: '123456789', oked: '41201',
  hisob: '20208000900123456001', mfo: '00873', bank: 'Bank',
};
const HOZIR = new Date('2026-10-16T07:00:00Z'); // juma
const TODAY = '2026-10-16';

const tushmagan: SchedulePayment[] = [
  { dateIso: '2026-08-10', amount: 1000, paid: 0, status: 'overdue', type: 'monthly' },
  { dateIso: '2026-09-10', amount: 1000, paid: 0, status: 'overdue', type: 'monthly' },
];
const tolangan: SchedulePayment[] = [
  { dateIso: '2026-08-10', amount: 1000, paid: 0, status: 'overdue', type: 'monthly' },
  { dateIso: '2026-09-10', amount: 1000, paid: 1000, status: 'paid', type: 'monthly' },
];

const nomzod = (contractId: string, over: Partial<TalabnomaNomzodi> = {}): TalabnomaNomzodi => ({
  contractId, clientId: `k-${contractId}`, contractNo: contractId === 'c1' ? '1234ABC56DE' : `N-${contractId}`,
  contractDate: new Date('2025-03-01T00:00:00Z'), objectName: 'Vatan', objectAddress: 'Toshkent, Olmazor',
  companyInn: '123456789', debtMonthly: 18_900_000, fullName: 'Sardor Aliyev', firstName: 'Sardor',
  qarindoshOrqali: false, virtualStatus: 'sold', ...over,
});

interface Muhit {
  x: TalabnomaXizmati;
  repo: XotiradagiTalabnomaRepo;
  jadval: Map<string, SchedulePayment[]>;
  yuborilganlar: Array<Record<string, unknown>>;
  renderlar: TalabnomaMalumot[];
  /** Har render'ning ikkinchi argumenti (muhrsiz nusxa). */
  renderOpts: Array<{ muhrsiz?: boolean } | undefined>;
  yaratilganSuhbatlar: string[];
  hodisalar: unknown[];
  audit: Array<{ action: string; entityId: string }>;
  resolveSoni: { n: number };
  sinxlar: string[];
  /** Bazadagi chiquvchi xabarlar — "avval yetib borgan" holatini qo'lda yasash uchun. */
  xabarlar: Array<Record<string, unknown>>;
}

function muhit(o: {
  repo?: XotiradagiTalabnomaRepo;
  nomzodlar?: TalabnomaNomzodi[];
  rekvizit?: RekvizitNatija;
  tayyor?: boolean;
  /** Shu shartnomalarga sinx `ok` dan keyin jadvalni to'langanga almashtiradi. */
  syncTolaydi?: string[];
  syncNatija?: 'ok' | 'error' | 'not_found' | 'disabled';
  /** Shu shartnomalarga birinchi `sendMedia` yiqiladi. */
  tgXato?: string[];
  /** Shu mijozlarda tayyor suhbat bor. */
  suhbatBor?: string[];
  /** Jurnal yozuvi yiqiladi (fayl allaqachon ketgan). */
  auditYiqiladi?: boolean;
  /** Shu shartnomalarga birinchi `sendMedia` faylni YETKAZADI, keyin yiqiladi. */
  yetkazibYiqiladi?: string[];
  /** Mijoz maydonlarini almashtirish (`clientId` → qisman `Client`). */
  mijoz?: Map<string, Record<string, unknown>>;
  /** Global to'xtatish yoqilgan. */
  killSwitch?: boolean;
  /** Telegram profili topilmaydi. */
  resolverXato?: boolean;
  /** Suhbat akkaunti hozir yubora olmaydi (ulanmagan). */
  akkauntYopiq?: boolean;
} = {}): Muhit {
  const repo = o.repo ?? new XotiradagiTalabnomaRepo(() => HOZIR);
  if (o.nomzodlar) repo.nomzodlarRoyxati = o.nomzodlar;
  const jadval = new Map<string, SchedulePayment[]>();
  const yuborilganlar: Array<Record<string, unknown>> = [];
  const renderlar: TalabnomaMalumot[] = [];
  const renderOpts: Array<{ muhrsiz?: boolean } | undefined> = [];
  const yaratilganSuhbatlar: string[] = [];
  const hodisalar: unknown[] = [];
  const audit: Array<{ action: string; entityId: string }> = [];
  const resolveSoni = { n: 0 };
  const sinxlar: string[] = [];
  const tgYiqildi = new Set<string>();
  /** Bazadagi chiquvchi xabarlar (dispatcher `create` qilganlar). */
  const xabarlar: Array<{ id: string; clientId: string; fileName: string; status: string; sentAt: Date; authorUserId: string | null; media: { path: string } }> = [];
  const suhbatlar = new Map<string, Conversation>();
  for (const k of o.suhbatBor ?? []) {
    suhbatlar.set(k, { id: `s-${k}`, clientId: k, telegramAccountId: 'a1', peerId: 'p1', peerAccessHash: 'h1', state: 'contacted' } as Conversation);
  }

  const topNomzod = (contractId: string) => repo.nomzodlarRoyxati.find((n) => n.contractId === contractId);

  const deps: TalabnomaXizmatiDeps = {
    talabnomalar: repo,
    rekvizitManbai: {
      rekvizit: async () => { sinxlar.push('rekvizit'); return o.rekvizit ?? { ok: true, rekvizit: REK }; },
      keshniTashla: () => { sinxlar.push('kesh'); },
    },
    pdf: {
      tayyormi: async () => o.tayyor ?? true,
      render: async (m, opts) => { renderlar.push(m); renderOpts.push(opts); return Buffer.from('PDF'); },
    },
    payments: { listSchedule: async (id) => jadval.get(id) ?? tushmagan },
    contractSync: {
      syncOne: async (id) => {
        sinxlar.push(id);
        const outcome = o.syncNatija ?? 'ok';
        if (outcome === 'ok' && o.syncTolaydi?.includes(id)) jadval.set(id, tolangan);
        return { outcome, contractId: id, debtTotal: 0, newPhones: [], error: outcome === 'error' ? 'timeout' : undefined };
      },
    },
    holidays: { list: async () => [] },
    messages: {
      yuborilganFayl: async (clientId, fileName) =>
        ([...xabarlar].reverse().find((m) => m.clientId === clientId && m.fileName === fileName && !['draft', 'failed'].includes(m.status)) ?? null) as never,
    },
    dispatcher: {
      sendMedia: async (opt) => {
        const contractId = repo.nomzodlarRoyxati.find((n) => n.clientId === opt.conversation.clientId)?.contractId ?? '';
        if (o.tgXato?.includes(contractId) && !tgYiqildi.has(contractId)) {
          tgYiqildi.add(contractId);
          throw new KillSwitchError();
        }
        yuborilganlar.push({ ...opt, conversationId: opt.conversation.id });
        const msg = {
          id: `m${yuborilganlar.length}`, clientId: opt.conversation.clientId, fileName: opt.fileName, status: 'sent',
          sentAt: new Date('2026-10-15T09:00:00Z'), authorUserId: opt.authorUserId ?? null,
          media: { path: `talabnoma/${opt.fileName}` },
        };
        xabarlar.push(msg);
        if (o.yetkazibYiqiladi?.includes(contractId) && !tgYiqildi.has(contractId)) {
          tgYiqildi.add(contractId);
          throw new Error('incrementSentToday: baza javob bermadi');
        }
        return msg as never;
      },
    },
    suhbat: new TalabnomaSuhbati({
      conversations: {
        findByClientId: async (clientId) => suhbatlar.get(clientId) ?? null,
        create: async (d) => {
          const s = { id: `s-yangi-${d.clientId}`, clientId: d.clientId, telegramAccountId: d.telegramAccountId ?? null, peerId: null, peerAccessHash: null, state: 'new' } as Conversation;
          yaratilganSuhbatlar.push(d.clientId);
          suhbatlar.set(d.clientId, s);
          return s;
        },
        update: async (id, patch) => {
          const s = [...suhbatlar.values()].find((c) => c.id === id)!;
          const yangi = { ...s, ...patch } as Conversation;
          suhbatlar.set(s.clientId, yangi);
          return yangi;
        },
      },
      resolver: {
        resolve: async () => {
          resolveSoni.n += 1;
          if (o.resolverXato) return { kind: 'not_found' } as never;
          return { kind: 'ok', value: { accountId: 'a1', peer: { telegramUserId: 'p9', accessHash: 'h9', username: null, firstName: null, lastName: null } } };
        },
      },
      events: { publish: (e) => { hodisalar.push(e); } },
    }),
    settings: { get: async () => ({ killSwitch: o.killSwitch ?? false }) as never },
    accounts: {
      findById: async (id) => ({
        id, label: 'A', isEnabled: true, status: o.akkauntYopiq ? 'disconnected' : 'connected',
        floodWaitUntil: null, spamStatus: 'ok', spamUntil: null,
      }) as never,
    },
    clients: {
      findById: async (id) => {
        const n = repo.nomzodlarRoyxati.find((x) => x.clientId === id);
        return n
          ? ({ id, fullName: n.fullName, firstName: n.firstName, doNotContact: false, telegramStatus: 'found', phone: '998901234567', telegramUserId: null, ...o.mijoz?.get(id) } as never)
          : null;
      },
    },
    contracts: {
      findById: async (id) => {
        const n = topNomzod(id);
        return n
          ? ({ id, clientId: n.clientId, contractNo: n.contractNo, contractDate: n.contractDate, objectName: n.objectName, objectAddress: n.objectAddress, debtMonthly: n.debtMonthly, daysOverdue: 70 } as never)
          : null;
      },
    },
    storage: { read: async (p) => Buffer.from(`fayl:${p}`) },
    audit: { record: async (e) => { if (o.auditYiqiladi) throw new Error('db yo\'q'); audit.push({ action: e.action, entityId: e.entityId ?? '' }); } },
    clock: { now: () => HOZIR, todayIso: () => TODAY },
  };
  return {
    x: new TalabnomaXizmati(deps), repo, jadval, yuborilganlar, renderlar, renderOpts, yaratilganSuhbatlar,
    hodisalar, audit, resolveSoni, sinxlar, xabarlar: xabarlar as never,
  };
}

async function main(): Promise<void> {
  // --- tayyorlar ---
  {
    const m = muhit({ nomzodlar: [nomzod('A1'), nomzod('B2')] });
    m.jadval.set('B2', tolangan);
    check('tayyorlar: qoidaga tushmagani chiqmaydi', (await m.x.tayyorlar()).map((q) => q.contractNo), ['N-A1']);
    check('tayyorlar: rekvizit sababi', (await m.x.tayyorlar())[0]!.rekvizit?.ok, true);
    const xApiXato = muhit({ nomzodlar: [nomzod('A1')], rekvizit: { ok: false, sabab: 'Rekvizit olinmadi: CRM javob bermadi' } });
    const xYoq = muhit({ nomzodlar: [nomzod('M1', { objectAddress: null }), nomzod('M2', { objectName: null }), nomzod('M3')] });
    check('tayyorlar: yetishmagan ma\'lumot sababi', (await xYoq.x.tayyorlar()).map((q) => q.malumotYetishmaydi), ['obyekt manzili', 'obyekt nomi', null]);
    // «Holat» ustuni: shartnomaning HOZIRGI CRM holati, kanonik kalit bilan.
    const xHolat = muhit({
      nomzodlar: [
        nomzod('H1'),
        nomzod('H2', { virtualStatus: ' Проц. отказ ' }),
        nomzod('H3', { virtualStatus: 'for_payment' }),
      ],
    });
    check('tayyorlar: shartnoma holati (kalit + CRM nomi)', (await xHolat.x.tayyorlar()).map((q) => q.shartnomaHolati), [
      { kalit: 'sold', nomi: 'Сотилди' },
      { kalit: 'cancellation_process', nomi: 'Проц. отказ' },
      { kalit: 'for_payment', nomi: 'К оплате' },
    ]);
    check('CRM rekvizit xatosi → qator bor, ok:false', (await xApiXato.x.tayyorlar())[0]!.rekvizit, { ok: false, sabab: 'Rekvizit olinmadi: CRM javob bermadi' });

    // INN hali sinxlanmagan — yuborish to'silmaydi (rekvizit `null`):
    // `yubor` avval CRM'dan sinxlaydi va rekvizitni qayta tekshiradi.
    const xInnYoq = muhit({
      nomzodlar: [
        nomzod('I1', { companyInn: null }),
        nomzod('I2', { companyInn: '  ', objectAddress: null }),
        nomzod('I3'),
      ],
      rekvizit: { ok: false, sabab: "Shartnomada kompaniya INN'i yo'q" },
    });
    const innQatorlar = await xInnYoq.x.tayyorlar();
    check('INN yo\'q → rekvizit null (to\'smaydi)', innQatorlar.map((q) => q.rekvizit === null), [true, true, false]);
    check('INN yo\'q → belgi', innQatorlar.map((q) => q.malumotYetishmaydi),
      ["kompaniya INN'i", "kompaniya INN'i, obyekt manzili", null]);
  }

  // --- INN sinxdan keyin ham yo'q — yubor baribir rad etadi ---
  {
    const m = muhit({
      nomzodlar: [nomzod('J1', { companyInn: null })],
      rekvizit: { ok: false, sabab: "Shartnomada kompaniya INN'i yo'q" },
    });
    check('INN sinxdan keyin ham yo\'q → REKVIZIT', await xatoKodi(() => m.x.yubor('J1', 'u1')), 'REKVIZIT');
    check('… avval sinx, keyin kesh tashlanib rekvizit', m.sinxlar, ['J1', 'kesh', 'rekvizit']);
  }

  // --- yubor: hisob raqami har safar CRM'dan yangi olinadi ---
  {
    const m = muhit({ nomzodlar: [nomzod('K1')], suhbatBor: ['k-K1'] });
    await m.x.yubor('K1', 'u1');
    check('yubor: sinx → kesh tashlandi → rekvizit', m.sinxlar, ['K1', 'kesh', 'rekvizit']);
  }

  // --- yubor / qaytaUrin / bekor (bitta umumiy repo: raqamlar ketma-ket) ---
  const repo = new XotiradagiTalabnomaRepo(() => HOZIR);
  repo.nomzodlarRoyxati = [nomzod('c1'), nomzod('c2'), nomzod('c3'), nomzod('c4'), nomzod('c5'), nomzod('c6')];
  const asosiy = muhit({ repo, suhbatBor: ['k-c6'] });
  const { x } = asosiy;

  const t = await x.yubor('c1', 'u1');
  check('raqam 1', t.raqam, 1);
  check('holat yuborildi', t.holat, 'yuborildi');
  const oxirgi = asosiy.yuborilganlar.at(-1)!;
  check('caption aynan', oxirgi.caption, "Assalomu alaykum, Sardor! Shartnoma №1234ABC56DE bo'yicha oxirgi ikki oylik to'lov tushmagani sababli Sizga rasmiy talabnoma yuboryapmiz. Iltimos, tanishib chiqing. Agar to'lovni amalga oshirgan bo'lsangiz, chekini shu yerga yuboring — tezda tekshirib beramiz.");
  check('fayl nomi', oxirgi.fileName, 'Talabnoma ET-01.pdf');
  check('hujjat, pdf, operator', [oxirgi.asDocument, oxirgi.mimeType, oxirgi.author, oxirgi.authorUserId], [true, 'application/pdf', 'human', 'u1']);
  check('muddat', [t.kuchgaKirish, t.muddatSanasi], ['2026-10-21', '2026-10-28']);
  check('pdfPath — xabar media yo\'li', [t.pdfPath, t.messageId, t.sentBy], ['talabnoma/Talabnoma ET-01.pdf', 'm1', 'u1']);
  check('render: raqam, sana, summa, manzil', [asosiy.renderlar.at(-1)!.raqam, asosiy.renderlar.at(-1)!.sanaIso, asosiy.renderlar.at(-1)!.summa, asosiy.renderlar.at(-1)!.objectAddress], [1, TODAY, 18_900_000, 'Toshkent, Olmazor']);
  check('yuborishdan oldin CRM sinx', asosiy.sinxlar.includes('c1'), true);
  check('audit talabnoma.sent', asosiy.audit.at(-1), { action: 'talabnoma.sent', entityId: t.id });
  check('suhbat yo\'q → agent xabarisiz ochiladi', [asosiy.yaratilganSuhbatlar.includes('k-c1'), asosiy.resolveSoni.n], [true, 1]);
  check('conversation.created hodisasi', asosiy.hodisalar.some((h) => JSON.stringify(h) === JSON.stringify({ type: 'conversation.created', conversationId: 's-yangi-k-c1' })), true);
  check('yangi suhbatga peer yozildi va xabar o\'shanga ketdi', oxirgi.conversationId, 's-yangi-k-c1');
  check('ikkinchi yuborish → 409', await xatoKodi(() => x.yubor('c1', 'u1')), 'TALABNOMA_BOR');

  const xTolagan = muhit({ repo, syncTolaydi: ['c2'] });
  check('sync to\'lovni ko\'rsatdi → 409', await xatoKodi(() => xTolagan.x.yubor('c2', 'u1')), 'ENDI_KERAK_EMAS');
  check('ENDI_KERAK_EMAS → yozuv yaratilmaydi', [...repo.rows.values()].some((r) => r.contractId === 'c2'), false);

  const xTgXato = muhit({ repo, tgXato: ['c3', 'c5'] });
  const holat3 = await xatoKodi(() => xTgXato.x.yubor('c3', 'u1'));
  const t3 = [...repo.rows.values()].find((r) => r.contractId === 'c3')!;
  check('Telegram xatosi → xato tashlanadi', holat3, 'KILL_SWITCH');
  check('Telegram xatosi → xato holati, raqam saqlanadi', [t3.holat, t3.raqam], ['xato', 2]);
  check('xato sababi saqlanadi', t3.xatoSababi?.includes('KILL_SWITCH'), true);
  const qayta = await xTgXato.x.qaytaUrin(t3.id, 'u2');
  check('qayta urinish o\'sha raqam', qayta.raqam, 2);
  check('qayta urinish: yuborildi, fayl ET-02', [qayta.holat, xTgXato.yuborilganlar.at(-1)!.fileName, qayta.sentBy], ['yuborildi', 'Talabnoma ET-02.pdf', 'u2']);
  check('qayta urinishda CRM qayta sinx', xTgXato.sinxlar.filter((s) => s === 'c3').length, 2);
  check('qayta urinish: yuborilganni qayta olib bo\'lmaydi', await xatoKodi(() => xTgXato.x.qaytaUrin(t3.id, 'u2')), 'QAYTA_URINIB_BOLMAYDI');
  check('bekor faqat xato', await xatoKodi(() => x.bekorQil(t.id, 'u1')), 'BEKOR_QILIB_BOLMAYDI');

  await xatoKodi(() => xTgXato.x.yubor('c5', 'u1'));
  const t5 = [...repo.rows.values()].find((r) => r.contractId === 'c5')!;
  await xTgXato.x.bekorQil(t5.id, 'u1');
  check('xato → bekor, nomzodlarga qaytadi', [(await repo.findById(t5.id))!.holat, (await repo.nomzodlar(TODAY)).some((n) => n.contractId === 'c5')], ['bekor', true]);
  check('audit talabnoma.cancelled', xTgXato.audit.at(-1), { action: 'talabnoma.cancelled', entityId: t5.id });

  const xSozlanmagan = muhit({ repo, tayyor: false });
  check('rasmlar yo\'q → 503', await xatoKodi(() => xSozlanmagan.x.yubor('c1', 'u1')), 'TALABNOMA_SOZLANMAGAN');
  check('rasmlar yo\'q → ko\'rinish ham 503', await xatoKodi(() => xSozlanmagan.x.korinish('c4')), 'TALABNOMA_SOZLANMAGAN');

  const x2 = muhit({ repo });
  check('parallel ikki yubor → bittasi', await ikkalasi(() => x2.x.yubor('c4', 'u1'), () => x2.x.yubor('c4', 'u2')), ['ok', 'TALABNOMA_BOR']);

  const t6 = await x.yubor('c6', 'u1');
  check('tayyor suhbat bor → yangi ochilmaydi, qidiruv yo\'q', [asosiy.yaratilganSuhbatlar.includes('k-c6'), asosiy.resolveSoni.n, asosiy.yuborilganlar.at(-1)!.conversationId], [false, 1, 's-k-c6']);
  check('pdf: saqlangan fayl', (await x.pdf(t6.id)).toString(), `fayl:${t6.pdfPath}`);
  check('pdf: yo\'q id → 404', await xatoKodi(() => x.pdf('yoq')), 'NOT_FOUND');

  // --- ko'rinish va rad etishlar ---
  {
    const m = muhit({ nomzodlar: [nomzod('p1'), nomzod('p2', { objectAddress: null })] });
    check('ko\'rinish: PDF', (await m.x.korinish('p1')).toString(), 'PDF');
    check('ko\'rinish: raqamsiz, bugungi sana', [m.renderlar[0]!.raqam, m.renderlar[0]!.sanaIso], [null, TODAY]);
    check('ko\'rinish: yozuv yaratilmaydi', m.repo.rows.size, 0);
    check('ko\'rinish: manzil yo\'q → 409', await xatoKodi(() => m.x.korinish('p2')), 'MALUMOT_YETISHMAYDI');
    check('yubor: manzil yo\'q → 409, raqam olinmaydi', [await xatoKodi(() => m.x.yubor('p2', 'u1')), m.repo.rows.size], ['MALUMOT_YETISHMAYDI', 0]);
    check('ko\'rinish: nomzod emas → 404', await xatoKodi(() => m.x.korinish('yoq')), 'NOT_FOUND');

    const r = muhit({ nomzodlar: [nomzod('r1')], rekvizit: { ok: false, sabab: 'INN 1 bo\'yicha kompaniya topilmadi' } });
    check('rekvizit xato → REKVIZIT: sabab', await xatoMatni(() => r.x.yubor('r1', 'u1')), "REKVIZIT: INN 1 bo'yicha kompaniya topilmadi");
    check('rekvizit xato → yozuv yo\'q', r.repo.rows.size, 0);

    const crm = muhit({ nomzodlar: [nomzod('s1')], syncNatija: 'error' });
    check('CRM sinx xatosi → 409 CRM', await xatoKodi(() => crm.x.yubor('s1', 'u1')), 'CRM');
    const jurnal = muhit({ nomzodlar: [nomzod('j1')], auditYiqiladi: true });
    check('fayl ketgach jurnal xatosi → baribir yuborildi (qayta urinishga ochilmaydi)', (await jurnal.x.yubor('j1', 'u1')).holat, 'yuborildi');
    const ochiq = muhit({ nomzodlar: [nomzod('s2')], syncNatija: 'disabled' });
    check('sinx o\'chiq → bazadagi bilan davom', (await ochiq.x.yubor('s2', 'u1')).holat, 'yuborildi');
  }

  // --- avval yetib borgan, lekin `xato` da qolgan yozuv (eski kod yoki
  //     qidiruvning o'zi yiqilgan): bekor qilinmaydi, qayta urinish tiklaydi ---
  {
    const m = muhit({ nomzodlar: [nomzod('y1')] });
    const t = await m.repo.yarat({ contractId: 'y1', clientId: 'k-y1', summa: 18_900_000, rekvizit: REK });
    const raqam = await m.repo.raqamBer(t.id);
    await m.repo.xato(t.id, 'baza javob bermadi');
    m.xabarlar.push({
      id: 'm-eski', clientId: 'k-y1', fileName: `Talabnoma ET-0${raqam}.pdf`, status: 'sent',
      sentAt: new Date('2026-10-15T09:00:00Z'), authorUserId: 'u7', media: { path: 'talabnoma/eski.pdf' },
    });
    check('yetib borgan → bekor qilib bo\'lmaydi', await xatoKodi(() => m.x.bekorQil(t.id, 'u1')), 'TALABNOMA_YETIB_BORGAN');
    check('… holat xato qoldi', (await m.repo.findById(t.id))!.holat, 'xato');
    const tik = await m.x.qaytaUrin(t.id, 'u2');
    check('qayta urinish → yuborilmaydi, o\'sha xabar qayd qilinadi', [m.yuborilganlar.length, tik.holat, tik.messageId, tik.sentBy], [0, 'yuborildi', 'm-eski', 'u7']);
  }

  // --- oldindan aniq xatolar: yozuv ham, ET raqami ham yo'q ---
  {
    const repo2 = new XotiradagiTalabnomaRepo(() => HOZIR);
    repo2.nomzodlarRoyxati = [nomzod('z1'), nomzod('z2'), nomzod('z3'), nomzod('z4')];
    const r = muhit({ repo: repo2, resolverXato: true });
    check('Telegram profili yo\'q → 409, yozuv yo\'q', [await xatoKodi(() => r.x.yubor('z1', 'u1')), repo2.rows.size], ['TELEGRAM_TOPILMADI', 0]);
    const k = muhit({ repo: repo2, killSwitch: true });
    check('kill switch → yozuv yo\'q, suhbat ochilmaydi', [await xatoKodi(() => k.x.yubor('z2', 'u1')), repo2.rows.size, k.yaratilganSuhbatlar.length], ['KILL_SWITCH', 0, 0]);
    const a = muhit({ repo: repo2, akkauntYopiq: true });
    check('akkaunt yubora olmaydi → yozuv yo\'q', [await xatoKodi(() => a.x.yubor('z3', 'u1')), repo2.rows.size], ['ACCOUNT_UNAVAILABLE', 0]);
    const ok = muhit({ repo: repo2 });
    check('… raqam behuda ketmadi: birinchi muvaffaqiyatli → ET-01', (await ok.x.yubor('z4', 'u1')).raqam, 1);
  }

  // --- qayta urinish: yetib borgan, qayta tekshiruv, ism mos emas ---
  {
    const mijoz = new Map<string, Record<string, unknown>>();
    const m = muhit({
      nomzodlar: [nomzod('q1'), nomzod('q2'), nomzod('q3'), nomzod('q4')],
      yetkazibYiqiladi: ['q1'], tgXato: ['q2', 'q3'], mijoz,
    });
    // Dispatcher fayl yetkazilgandan keyin yiqildi → xato; qayta urinish
    // ikkinchi nusxa yubormaydi, o'sha xabarni qayd qiladi.
    // Yetib borgan fayl `xato` ga tushmaydi — aks holda operator uni bekor
    // qilib, mijozga yangi ET raqamli ikkinchi xatni yuborardi.
    const tiklangan = await m.x.yubor('q1', 'u1');
    const tq1 = [...m.repo.rows.values()].find((r) => r.contractId === 'q1')!;
    check('yetkazib yiqildi → bitta yuborish', m.yuborilganlar.length, 1);
    check('yetib borgan → yuborildi, o\'sha xabar', [tiklangan.holat, tiklangan.messageId, tiklangan.pdfPath, tiklangan.sentBy], ['yuborildi', 'm1', 'talabnoma/Talabnoma ET-01.pdf', 'u1']);
    check('yetib borgan → muddat xabar kunidan', [tiklangan.kuchgaKirish, tiklangan.muddatSanasi], ['2026-10-20', '2026-10-27']);
    check('audit talabnoma.recovered', m.audit.at(-1), { action: 'talabnoma.recovered', entityId: tq1.id });

    // Xato paytida mijoz to'ladi → qayta urinish rad, yozuv xato qoladi.
    await xatoKodi(() => m.x.yubor('q2', 'u1'));
    const tq2 = [...m.repo.rows.values()].find((r) => r.contractId === 'q2')!;
    m.jadval.set('q2', tolangan);
    const oldin = m.yuborilganlar.length;
    check('to\'lagandan keyin qayta urinish → ENDI_KERAK_EMAS', await xatoKodi(() => m.x.qaytaUrin(tq2.id, 'u1')), 'ENDI_KERAK_EMAS');
    check('… yuborilmadi, xato qoldi, raqam o\'sha', [m.yuborilganlar.length, (await m.repo.findById(tq2.id))!.holat, (await m.repo.findById(tq2.id))!.raqam], [oldin, 'xato', tq2.raqam]);

    // Bog'lanish taqiqlandi → xuddi shunday.
    await xatoKodi(() => m.x.yubor('q3', 'u1'));
    const tq3 = [...m.repo.rows.values()].find((r) => r.contractId === 'q3')!;
    mijoz.set('k-q3', { doNotContact: true });
    check('do_not_contact → ENDI_KERAK_EMAS', await xatoKodi(() => m.x.qaytaUrin(tq3.id, 'u1')), 'ENDI_KERAK_EMAS');
    check('… xato qoldi', (await m.repo.findById(tq3.id))!.holat, 'xato');
    mijoz.set('k-q3', { telegramStatus: 'name_mismatch' });
    check('qayta urinish: ism mos emas → 409', await xatoKodi(() => m.x.qaytaUrin(tq3.id, 'u1')), 'TELEGRAM_NOMI_MOS_EMAS');

    // Ism mos emas → yubor raqam olmaydi.
    mijoz.set('k-q4', { telegramStatus: 'name_mismatch' });
    check('yubor: ism mos emas → 409, yozuv yo\'q', [await xatoKodi(() => m.x.yubor('q4', 'u1')), [...m.repo.rows.values()].some((r) => r.contractId === 'q4')], ['TELEGRAM_NOMI_MOS_EMAS', false]);
    check('CRM sinx qayta urinishda ham', m.sinxlar.filter((x) => x === 'q2').length, 2);
  }

  // --- chop etish uchun muhrsiz nusxa ---
  {
    const m = muhit({ nomzodlar: [nomzod('h1'), nomzod('h2')] });
    const t = await m.repo.yarat({ contractId: 'h1', clientId: 'k-h1', summa: 12_345_000, rekvizit: { ...REK, kompaniya: 'ESKI REKVIZIT' } });
    await m.repo.raqamBer(t.id);
    // Toshkent bo'yicha 15-oktabr 23:30 = UTC 18:30 — sana Toshkentniki bo'lishi kerak.
    await m.repo.yuborildi(t.id, {
      pdfPath: 'talabnoma/x.pdf', messageId: 'mx', kuchgaKirish: '2026-10-20', muddatSanasi: '2026-10-27',
      sentBy: 'u1', sentAt: new Date('2026-10-15T18:30:00Z'),
    });
    const sinxOldin = m.sinxlar.length;
    const auditOldin = m.audit.length;
    check('chop: PDF', (await m.x.chopEtish(t.id)).toString(), 'PDF');
    const r = m.renderlar.at(-1)!;
    check('chop: saqlangan raqam, summa, rekvizit', [r.raqam, r.summa, r.rekvizit.kompaniya], [1, 12_345_000, 'ESKI REKVIZIT']);
    check('chop: sana — yuborilgan kun (Toshkent)', r.sanaIso, '2026-10-15');
    check('chop: mijoz va shartnoma maydonlari', [r.fullName, r.contractNo, r.objectAddress], ['Sardor Aliyev', 'N-h1', 'Toshkent, Olmazor']);
    check('chop: muhrsiz', m.renderOpts.at(-1), { muhrsiz: true });
    check('chop: CRM sinx yo\'q, audit yo\'q, holat o\'zgarmadi',
      [m.sinxlar.length - sinxOldin, m.audit.length - auditOldin, (await m.repo.findById(t.id))!.holat], [0, 0, 'yuborildi']);
    check('yubor: muhrli (opts yo\'q yoki muhrsiz emas)', (await m.x.yubor('h2', 'u1')) && !m.renderOpts.at(-1)?.muhrsiz, true);

    const x = await m.repo.yarat({ contractId: 'h3', clientId: 'k-h3', summa: 1, rekvizit: REK });
    await m.repo.raqamBer(x.id);
    await m.repo.xato(x.id, 'tg');
    const renderOldin = m.renderlar.length;
    check('chop: xato holati → 409', await xatoKodi(() => m.x.chopEtish(x.id)), 'CHOP_ETIB_BOLMAYDI');
    check('chop: yo\'q id → 404', await xatoKodi(() => m.x.chopEtish('yoq')), 'NOT_FOUND');
    check('chop: rad etilganda render yo\'q', m.renderlar.length, renderOldin);
  }

  if (failed > 0) {
    console.error(`\n${failed} ta tekshiruv yiqildi`);
    process.exit(1);
  }
  console.log('\nHammasi o\'tdi');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
