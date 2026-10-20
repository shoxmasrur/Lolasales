import ExcelJS from 'exceljs';
import {
  belgila,
  jamiYigindi,
  qamrovgaMos,
  shartnomalarKesimi,
  type Qamrov,
  type TushumQatori,
  type XomTolov,
} from '@/domain/services/tushumBelgilari';

export interface EksportMeta {
  readonly from: string;
  readonly to: string;
  readonly qamrov: Qamrov;
  readonly bahsli: boolean;
  readonly q: string | null;
  readonly yaratilgan: Date;
}

export const QAMROV_NOMI: Record<Qamrov, string> = {
  all: "Hamma to'lovlar",
  contacted: 'Faqat gaplashilganlar',
  overdue: 'Faqat kechikkanlar',
};

const BELGI_NOMI = { ha: 'ha', yoq: "yo'q", nomalum: "noma'lum" } as const;
const PUL = '#,##0';
const SANA = 'dd.mm.yyyy';

/** Excel sanasi: UTC yarim tun — aks holda mintaqa sanani bir kun surardi. */
const sana = (iso: string | null): Date | null => (iso ? new Date(`${iso}T00:00:00Z`) : null);

export function tushumQatorlari(xom: readonly XomTolov[], qamrov: Qamrov): TushumQatori[] {
  return xom.map(belgila).filter((r) => qamrovgaMos(r, qamrov));
}

function sarlavha(ws: ExcelJS.Worksheet, ustunlar: Array<{ nom: string; kengligi: number; format?: string }>): void {
  ws.columns = ustunlar.map((u) => ({ width: u.kengligi, style: u.format ? { numFmt: u.format } : {} }));
  const row = ws.addRow(ustunlar.map((u) => u.nom));
  row.font = { bold: true };
}

/**
 * Uch varaqli kitob. Hamma yig'indi bitta `rows` dan hisoblanadi — varaqlar
 * orasida raqam farq qilishi mumkin emas.
 *
 * Oqim rejimi ATAYLAB ishlatilmaydi: «Jami» birinchi varaq va u oxirgi
 * qatorlarni bilishi kerak. Bir yillik davr ham xotiraga sig'adi.
 */
export function tushumKitobi(rows: readonly TushumQatori[], meta: EksportMeta): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.created = meta.yaratilgan;
  const frozen = { views: [{ state: 'frozen' as const, ySplit: 1 }] };

  // ─── Jami ────────────────────────────────────────────────────────────
  const j = jamiYigindi(rows);
  const jami = wb.addWorksheet('Jami');
  jami.columns = [{ width: 34 }, { width: 12 }, { width: 20, style: { numFmt: PUL } }];
  jami.addRow(['Tushumlar hisoboti']).font = { bold: true, size: 13 };
  jami.addRow(['Davr', `${meta.from} — ${meta.to}`]);
  jami.addRow(['Qamrov', QAMROV_NOMI[meta.qamrov]]);
  jami.addRow(["Bahsli to'lovlar", meta.bahsli ? "qo'shilgan" : 'chiqarilgan']);
  jami.addRow(['Qidiruv', meta.q ?? '—']);
  jami.addRow(['Yaratilgan', meta.yaratilgan.toISOString().slice(0, 16).replace('T', ' ') + ' UTC']);
  jami.addRow([]);
  jami.addRow(['', 'Soni', 'Summa']).font = { bold: true };
  // Qamrov filtrlangan bo'lsa, birinchi qator "hamma to'lov" emas — chalg'itmasin.
  const birinchiQatorNomi = meta.qamrov === 'all' ? "Hamma to'lovlar" : "Tanlangan to'lovlar";
  jami.addRow([birinchiQatorNomi, j.hammasi.soni, j.hammasi.summa]);
  jami.addRow(['Gaplashilgandan keyin', j.gaplashilgan.soni, j.gaplashilgan.summa]);
  jami.addRow(["Kechikkan to'lov", j.kechikkan.soni, j.kechikkan.summa]);
  jami.addRow(["Grafigi yo'q (noma'lum)", j.nomalum.soni, j.nomalum.summa]);
  if (meta.bahsli) jami.addRow(["Shundan bahsli", j.bahsli.soni, j.bahsli.summa]);
  jami.addRow([]);
  jami.addRow(["Faqat CRM bilan sinxronlangan shartnomalar to'lovlari kiradi."]);
  jami.addRow(["«Gaplashilgan» — to'lov birinchi xabardan keyin kelgan; bu sababni isbotlamaydi."]);
  jami.addRow(["«Kechikkan» — to'lov kuni grafikda muddati o'tgan, yopilmagan qator bo'lgan."]);

  // ─── Shartnomalar ───────────────────────────────────────────────────
  const sh = wb.addWorksheet('Shartnomalar', frozen);
  sarlavha(sh, [
    { nom: 'Shartnoma №', kengligi: 16 },
    { nom: 'Mijoz', kengligi: 32 },
    { nom: 'Obyekt', kengligi: 24 },
    { nom: "To'lovlar soni", kengligi: 12 },
    { nom: 'Jami summa', kengligi: 18, format: PUL },
    { nom: 'Gaplashilgandan keyin', kengligi: 20, format: PUL },
    { nom: "Kechikkan to'lov", kengligi: 18, format: PUL },
    { nom: 'Birinchi xabar', kengligi: 14, format: SANA },
  ]);
  for (const s of shartnomalarKesimi(rows)) {
    sh.addRow([
      s.contractNo, s.clientName, s.objectName ?? '', s.soni,
      s.jami, s.gaplashilgandanKeyin, s.kechikkan, sana(s.anchorDate),
    ]);
  }

  // ─── To'lovlar ──────────────────────────────────────────────────────
  const tl = wb.addWorksheet("To'lovlar", frozen);
  sarlavha(tl, [
    { nom: "To'lov sanasi", kengligi: 13, format: SANA },
    { nom: 'Shartnoma №', kengligi: 16 },
    { nom: 'Mijoz', kengligi: 32 },
    { nom: 'Obyekt', kengligi: 24 },
    { nom: 'Summa', kengligi: 16, format: PUL },
    { nom: "To'lov turi", kengligi: 14 },
    { nom: 'Maqsad', kengligi: 30 },
    { nom: 'Gaplashilgan', kengligi: 12 },
    { nom: 'Birinchi xabar', kengligi: 14, format: SANA },
    { nom: 'Xabardan keyin (kun)', kengligi: 12 },
    { nom: 'Kechikkan', kengligi: 11 },
    { nom: 'Kechikish (kun)', kengligi: 12 },
    { nom: 'Bahsli', kengligi: 8 },
  ]);
  for (const r of rows) {
    tl.addRow([
      sana(r.datePaid), r.contractNo, r.clientName, r.objectName ?? '', r.amount,
      r.paymentType ?? '', r.purpose ?? '',
      r.gaplashilgan ? 'ha' : "yo'q", sana(r.anchorDate), r.xabardanKeyinKun ?? '',
      BELGI_NOMI[r.kechikkan], r.kechikishKuni ?? '', r.isProblematic ? 'ha' : "yo'q",
    ]);
  }

  return wb;
}
