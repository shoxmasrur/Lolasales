import ExcelJS from 'exceljs';
import type { XomTolov } from '@/domain/services/tushumBelgilari';
import { tushumKitobi, tushumQatorlari } from '@/application/usecases/reports/tushumEksporti';

/** Qo'lda ishga tushiriladi: npm run test:tushum-eksporti --workspace=server */

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const tolov = (o: Partial<XomTolov>): XomTolov => ({
  eventId: 'e',
  contractNo: 'A-1',
  clientName: 'Aliyev Vali',
  objectName: null,
  amount: 0,
  datePaid: '2026-08-20',
  paymentType: 'monthly',
  purpose: null,
  isProblematic: false,
  anchorDate: null,
  grafik: [],
  ...o,
});

const xom: XomTolov[] = [
  tolov({ eventId: '1', contractNo: 'A-1', amount: 1_000_000, anchorDate: '2026-08-01' }),
  tolov({
    eventId: '2', contractNo: 'A-1', amount: 250_000,
    grafik: [{ datePayment: '2026-08-05', datePaid: null, status: 'waiting' }],
  }),
  tolov({ eventId: '3', contractNo: 'B-7', amount: 3_000_000, clientName: 'Karimova Nodira' }),
];

const meta = {
  from: '2026-08-01',
  to: '2026-08-31',
  qamrov: 'all' as const,
  bahsli: false,
  q: null,
  yaratilgan: new Date('2026-09-17T10:00:00Z'),
};

check('qamrov contacted — 1 qator', tushumQatorlari(xom, 'contacted').length, 1);
check('qamrov overdue — 1 qator', tushumQatorlari(xom, 'overdue').length, 1);

const rows = tushumQatorlari(xom, 'all');
const buf = await tushumKitobi(rows, meta).xlsx.writeBuffer();
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buf);

check('varaqlar', wb.worksheets.map((w) => w.name), ['Jami', 'Shartnomalar', "To'lovlar"]);

const tolovlar = wb.getWorksheet("To'lovlar")!;
const shartnomalar = wb.getWorksheet('Shartnomalar')!;
const jami = wb.getWorksheet('Jami')!;

check("To'lovlar: sarlavha + 3 qator", tolovlar.rowCount, 4);
check('Shartnomalar: sarlavha + 2 qator', shartnomalar.rowCount, 3);

const ustunYigindisi = (ws: ExcelJS.Worksheet, sarlavha: string): number => {
  const header = ws.getRow(1).values as unknown[];
  const col = header.indexOf(sarlavha);
  let s = 0;
  for (let i = 2; i <= ws.rowCount; i += 1) s += Number(ws.getRow(i).getCell(col).value ?? 0);
  return s;
};

/** «Jami» varag'ida 1-ustunda shu nom turgan qatorning 3-ustuni (Summa). */
const jamiQiymati = (ws: ExcelJS.Worksheet, nom: string): unknown => {
  for (let i = 1; i <= ws.rowCount; i += 1) {
    if (ws.getRow(i).getCell(1).value === nom) return ws.getRow(i).getCell(3).value;
  }
  return undefined;
};

check("To'lovlar summasi", ustunYigindisi(tolovlar, 'Summa'), 4_250_000);
check('Shartnomalar summasi', ustunYigindisi(shartnomalar, 'Jami summa'), 4_250_000);
check('Jami: hammasi', jamiQiymati(jami, "Hamma to'lovlar"), 4_250_000);
check('Jami: gaplashilgan', jamiQiymati(jami, 'Gaplashilgandan keyin'), 1_000_000);
check('Jami: kechikkan', jamiQiymati(jami, "Kechikkan to'lov"), 250_000);
check('eng katta shartnoma birinchi', shartnomalar.getRow(2).getCell(1).value, 'B-7');
check('summa raqam turida', typeof tolovlar.getRow(2).getCell(5).value, 'number');
check('sana Excel sanasi', tolovlar.getRow(2).getCell(1).value instanceof Date, true);
check('kechikkan belgisi', tolovlar.getRow(3).getCell(11).value, 'ha');

// ─── qamrov filtrlanganda «Jami» birinchi qatori chalg'itmasin ────────────
const rowsTanlangan = tushumQatorlari(xom, 'contacted');
const metaTanlangan = { ...meta, qamrov: 'contacted' as const };
const bufTanlangan = await tushumKitobi(rowsTanlangan, metaTanlangan).xlsx.writeBuffer();
const wbTanlangan = new ExcelJS.Workbook();
await wbTanlangan.xlsx.load(bufTanlangan);
const jamiTanlangan = wbTanlangan.getWorksheet('Jami')!;
check(
  'Jami (contacted): "Tanlangan to\'lovlar" qatori',
  jamiQiymati(jamiTanlangan, "Tanlangan to'lovlar"),
  1_000_000,
);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
