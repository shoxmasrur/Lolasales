import { XotiradagiTalabnomaRepo } from '@/application/services/talabnomaFake';
import type { TalabnomaNomzodi } from '@/domain/entities/Talabnoma';
import type { Rekvizit } from '@/domain/services/rekvizit';
import { AppError } from '@/shared/errors';

/**
 * Qo'lda: npm run test:talabnoma-fake --workspace=server
 *
 * Sof test («Birlik»): soxta repo `shared/config` ni tortmaydi.
 * NEGA: keyingi servis testlari shu soxta repoga tayanadi — u bazadagi
 * qoidalardan (bitta faol talabnoma, raqam bir marta, holat o'tishlari)
 * chetga chiqsa, servis testlari yolg'on yashil bo'lardi.
 */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const REK: Rekvizit = {
  kompaniya: 'VATAN RESIDENCE', turi: 'MChJ', inn: '123456789', oked: '41201',
  hisob: '20208000900123456001', mfo: '00873', bank: 'Bank',
};
const nomzod = (
  contractId: string, clientId = 'cl1', over: Partial<TalabnomaNomzodi> = {},
): TalabnomaNomzodi => ({
  contractId, clientId, contractNo: `N-${contractId}`, contractDate: null, objectName: null,
  objectAddress: null, companyInn: '123456789', debtMonthly: 1000, fullName: 'Ali Valiyev',
  firstName: 'Ali', qarindoshOrqali: false, virtualStatus: 'sold', ...over,
});
const yangi = (contractId: string, clientId = 'cl1') => ({ contractId, clientId, summa: 1000, rekvizit: REK });

const xatoKodi = async (fn: () => Promise<unknown>): Promise<string | null> => {
  try { await fn(); return null; } catch (e) { return e instanceof AppError ? `${e.statusCode}:${e.code}` : 'boshqa'; }
};

async function main(): Promise<void> {
  let hozir = new Date('2026-10-16T10:00:00Z');
  const r = new XotiradagiTalabnomaRepo(() => hozir);
  r.nomzodlarRoyxati = [
    nomzod('k1', 'cl1', { objectName: 'Bunyodkor' }),
    // Excel nomi bilan — filtr kanonik kalit bo'yicha topishi kerak.
    nomzod('k2', 'cl1', { objectName: ' Vatan ', virtualStatus: 'Проц. отказ' }),
    nomzod('k3', 'cl2', { objectName: 'Vatan', virtualStatus: 'for_payment' }),
  ];

  // raqam
  const t1 = await r.yarat(yangi('k1'));
  check('yarat → yuborilmoqda, raqamsiz', [t1.holat, t1.raqam], ['yuborilmoqda', null]);
  // Sahifa osilgan `yuborilmoqda` ni shu maydon bo'yicha taniydi.
  check('yarat → updatedAt qaytadi', (await r.findById(t1.id))?.updatedAt?.toISOString(), '2026-10-16T10:00:00.000Z');
  const n1 = await r.raqamBer(t1.id);
  const n1b = await r.raqamBer(t1.id);
  check('raqamBer ikki marta → bir xil raqam', [n1, n1b], [1, 1]);
  const t2 = await r.yarat(yangi('k2'));
  check('keyingi talabnoma keyingi raqamni oladi', await r.raqamBer(t2.id), 2);

  // unique
  check('ikkinchi yarat (yuborilmoqda) → 409 TALABNOMA_BOR', await xatoKodi(() => r.yarat(yangi('k1'))), '409:TALABNOMA_BOR');

  // nomzodlar band shartnomani chiqaradi
  check('nomzodlar band shartnomalarni chiqarmaydi', (await r.nomzodlar('2026-10-16')).map((n) => n.contractId), ['k3']);
  check('nomzod(k1) → null (band)', await r.nomzod('k1', '2026-10-16'), null);
  check('nomzod(k3) → bor', (await r.nomzod('k3', '2026-10-16'))?.contractNo, 'N-k3');
  r.ismMosEmas.add('cl2');
  check('ism mos emas → ro\'yxatda yo\'q', (await r.nomzodlar('2026-10-16')).map((n) => n.contractId), []);
  check('… lekin nomzod() qaytaradi (aniq sabab yuborishda)', (await r.nomzod('k3', '2026-10-16'))?.contractNo, 'N-k3');
  r.ismMosEmas.delete('cl2');

  // qaytaUrinishgaOl: yangi yuborilmoqda → null, 10 daqiqadan keyin → oladi
  check('yangi yuborilmoqda → qaytaUrinishgaOl null', await r.qaytaUrinishgaOl(t1.id), null);
  hozir = new Date('2026-10-16T10:11:00Z');
  check('10 daqiqadan eski yuborilmoqda → olinadi', (await r.qaytaUrinishgaOl(t1.id))?.holat, 'yuborilmoqda');
  check('darhol ikkinchi marta → null (boshqasi olgan)', await r.qaytaUrinishgaOl(t1.id), null);

  // yuborildi
  await r.yuborildi(t1.id, {
    pdfPath: 'p.pdf', messageId: 'm1', kuchgaKirish: '2026-10-21', muddatSanasi: '2026-10-28',
    sentBy: 'u1', sentAt: hozir,
  });
  const t1y = await r.findById(t1.id);
  check('yuborildi maydonlari', [t1y?.holat, t1y?.muddatSanasi, t1y?.messageId, t1y?.raqam], ['yuborildi', '2026-10-28', 'm1', 1]);
  check('bekorQil yuborildi da → false', await r.bekorQil(t1.id), false);
  check('qaytaUrinishgaOl yuborildi da → null', await r.qaytaUrinishgaOl(t1.id), null);
  check('yuborildi ustiga yarat → 409', await xatoKodi(() => r.yarat(yangi('k1'))), '409:TALABNOMA_BOR');
  check('yuborildi qayta → 409 (yuborilmoqda emas)', await xatoKodi(() => r.xato(t1.id, 'x')), '409:TALABNOMA_HOLATI');

  // xato → qayta urinish → bekor
  await r.xato(t2.id, 'Telegram yiqildi');
  check('xato holati va sababi', [(await r.findById(t2.id))?.holat, (await r.findById(t2.id))?.xatoSababi], ['xato', 'Telegram yiqildi']);
  check('xato ustiga yarat → 409 (xato ham band)', await xatoKodi(() => r.yarat(yangi('k2'))), '409:TALABNOMA_BOR');
  const qayta = await r.qaytaUrinishgaOl(t2.id);
  check('xato → qaytaUrinishgaOl → yuborilmoqda, sabab tozalanadi', [qayta?.holat, qayta?.xatoSababi, qayta?.raqam], ['yuborilmoqda', null, 2]);
  check('bekorQil yuborilmoqda da → false', await r.bekorQil(t2.id), false);
  await r.xato(t2.id, 'yana');
  check('bekorQil xato da → true', await r.bekorQil(t2.id), true);
  check('bekor dan keyin shartnoma yana nomzod', (await r.nomzodlar('2026-10-16')).map((n) => n.contractId), ['k2', 'k3']);
  const t2b = await r.yarat(yangi('k2'));
  check('bekor dan keyin yangi yarat ruxsat', t2b.holat, 'yuborilmoqda');
  check('mavjud bo\'lmagan id → bekorQil false', await r.bekorQil('yoq'), false);
  check('mavjud bo\'lmagan id → raqamBer 404', await xatoKodi(() => r.raqamBer('yoq')), '404:NOT_FOUND');

  // faolMuddat / yuborilganlar / list
  check('faolMuddat (muddat ≥ bugun)', await r.faolMuddat('cl1', '2026-10-16'), '2026-10-28');
  check('faolMuddat muddat o\'tgan → null', await r.faolMuddat('cl1', '2026-10-29'), null);
  check('faolMuddat muddat kunining o\'zi → bor', await r.faolMuddat('cl1', '2026-10-28'), '2026-10-28');
  check('yuborilganlar faqat yuborildi, contractNo bilan', (await r.yuborilganlar('cl1')).map((t) => [t.id, t.contractNo]), [[t1.id, 'N-k1']]);
  const sahifa = await r.list({ holat: 'bekor', limit: 10 });
  check('list holat bo\'yicha, fullName/contractNo bilan', [sahifa.total, sahifa.items[0]?.fullName, sahifa.items[0]?.contractNo], [1, 'Ali Valiyev', 'N-k2']);
  check('list hammasi', (await r.list({})).total, 3);
  r.foydalanuvchilar.set('u1', 'Dildora');
  const ismlar = (await r.list({})).items.map((t) => [t.id, t.sentByName]);
  check('list sentByName: yuborgan ismi, yubormaganda null', ismlar.find((x) => x[0] === t1.id)?.[1], 'Dildora');
  check('list sentByName: sentBy yo\'q → null', ismlar.find((x) => x[0] === t2b.id)?.[1], null);

  // Shartnoma holati / obyekt: ustun va server tomondagi filtr
  const k2qator = (await r.list({ holat: 'bekor' })).items[0];
  check('list: shartnoma holati kanonik kalit + CRM nomi', k2qator?.shartnomaHolati, { kalit: 'cancellation_process', nomi: 'Проц. отказ' });
  check('list: obyekt nomi (qirqilgan)', k2qator?.objectName, 'Vatan');
  check('list: shartnomaHolati filtri (Excel nomi ham)', (await r.list({ shartnomaHolati: 'cancellation_process' })).total, 2);
  check('list: obyekt filtri', (await r.list({ obyekt: 'Bunyodkor' })).items.map((t) => t.id), [t1.id]);
  check('list: filtrlar AND', (await r.list({ shartnomaHolati: 'sold', obyekt: 'Vatan' })).total, 0);
  check('list: talabnoma holati + shartnoma holati', (await r.list({ holat: 'bekor', shartnomaHolati: 'cancellation_process' })).total, 1);
  check('list: filtrdan keyin sahifalash', (await r.list({ shartnomaHolati: 'cancellation_process', limit: 1, offset: 1 })).items.length, 1);
  // Aralash harfli yozilish: ko'rinish ham, filtr ham `cancellation_process`.
  r.nomzodlarRoyxati.push(nomzod('k4', 'cl3', { objectName: 'Vatan', virtualStatus: 'Проц. Отказ' }));
  const t4 = await r.yarat(yangi('k4', 'cl3'));
  check('aralash harfli "Проц. Отказ" → ko\'rinish kaliti',
    (await r.list({ holat: 'yuborilmoqda', obyekt: 'Vatan' })).items.find((t) => t.id === t4.id)?.shartnomaHolati,
    { kalit: 'cancellation_process', nomi: 'Проц. отказ' });
  check('… va filtr uni topadi', (await r.list({ shartnomaHolati: 'cancellation_process' })).items.some((t) => t.id === t4.id), true);
  // Mijoz bo'yicha («Batafsil» oynasi): faqat shu mijozniki, boshqa filtrlar bilan AND.
  check('list: clientId filtri', (await r.list({ clientId: 'cl3' })).items.map((t) => t.id), [t4.id]);
  check('list: clientId — cl1 da 3 ta', (await r.list({ clientId: 'cl1' })).total, 3);
  check('list: clientId + holat (AND)', (await r.list({ clientId: 'cl3', holat: 'bekor' })).total, 0);
  check('list: talabnomasi yo\'q mijoz → bo\'sh', (await r.list({ clientId: 'cl2' })).total, 0);
  await r.xato(t4.id, 'x');
  await r.bekorQil(t4.id);
  r.rows.delete(t4.id);
  r.nomzodlarRoyxati.pop();
  check('filtrVariantlari: faqat talabnomasi borlar, takrorsiz', await r.filtrVariantlari(), {
    holatlar: [{ kalit: 'sold', nomi: 'Сотилди' }, { kalit: 'cancellation_process', nomi: 'Проц. отказ' }],
    obyektlar: ['Bunyodkor', 'Vatan'],
  });

  if (failed > 0) {
    console.error(`\n${failed} ta tekshiruv yiqildi`);
    process.exit(1);
  }
  console.log('\nHammasi o\'tdi');
}

void main();
