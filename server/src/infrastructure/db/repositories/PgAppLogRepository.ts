import type {
  AppLogFlag,
  AppLogItem,
  AppLogLevel,
  AppLogQuery,
  AppLogRow,
  IAppLogRepository,
} from '@/domain/repositories/IAppLogRepository';
import { jurnalPool, query } from '@/infrastructure/db/pool';

type Row = Record<string, any>;

function mapLevel(v: unknown): AppLogLevel {
  if (v === 'error') return 'error';
  if (v === 'info') return 'info';
  return 'warn';
}

function mapFlag(v: unknown): AppLogFlag | null {
  return v === 'telegram' ? 'telegram' : null;
}

function mapItem(r: Row): AppLogItem {
  return {
    id: String(r.id),
    at: r.at instanceof Date ? r.at : new Date(String(r.at)),
    level: mapLevel(r.level),
    flag: mapFlag(r.flag),
    scope: r.scope ?? null,
    msg: r.msg,
    shartnoma: r.shartnoma ?? null,
    akkaunt: r.akkaunt ?? null,
    mijoz: r.mijoz ?? null,
    payload: r.payload ?? {},
  };
}

// Bu repozitoriyning uchta so'rovi ataylab ikki hovuzga bo'lingan:
//
//  `append`         — yuqori hajmli, otib-unutiladigan yozuv (fire-and-
//                      forget). `jurnalPool`da: domenga kerak bo'lgan
//                      ulanishni hech qachon egallab qolmasligi kerak.
//  `deleteOlderThan` — kuniga bir marta ishlaydi va bitta operatorda
//                      juda ko'p qatorni o'chirishi mumkin, bu esa
//                      ulanishni uzoq band qiladi. `jurnalPool`da,
//                      shunda uzoq tozalash domen ulanishini bog'lab
//                      qo'ymaydi.
//  `list`            — kamdan-kam, operator boshlagan so'rov va u aynan
//                      jurnal hovuzi band bo'lgan paytda ham javob
//                      berishi shart (operator hodisani tekshirmoqchi
//                      bo'lgan payt). Asosiy hovuzda: bitta dashboard
//                      so'rovi 10 ta ulanishli hovuzni sezilarli
//                      yuklamaydi (sabab pool.ts'dagi `jurnalPool`
//                      izohida).
export class PgAppLogRepository implements IAppLogRepository {
  async append(row: AppLogRow): Promise<AppLogItem> {
    const { rows } = await query(
      `INSERT INTO app_log (level, flag, scope, msg, shartnoma, akkaunt, mijoz, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [row.level, row.flag, row.scope, row.msg, row.shartnoma, row.akkaunt, row.mijoz, JSON.stringify(row.payload)],
      // Jurnalning o'z yozuvi — sekin bo'lsa ham ogohlantirish
      // chiqarmaydi, aks holda ogohlantirishning o'zi yana shu yerga
      // yozuv qo'shib, poolni band qilib boraveradi (pool.ts'dagi izoh).
      jurnalPool,
      { skipSlowWarn: true },
    );
    return mapItem(rows[0]!);
  }

  async list(q: AppLogQuery): Promise<AppLogItem[]> {
    const where: string[] = [];
    const params: unknown[] = [];

    // Uchta ko'rinish, uchtasi ham bir-birini istisno qiladi:
    //  bayroq berilgan  → faqat o'sha oqim (Telegram izi to'liq);
    //  faqat xato       → `level = 'error'` (Telegram xatolari ham kiradi);
    //  hammasi          → `info` dan yuqorilari, ya'ni audit izi ko'rinmaydi.
    if (q.flag) {
      params.push(q.flag);
      where.push(`flag = $${params.length}`);
    } else if (q.level === 'error') {
      where.push(`level = 'error'`);
    } else {
      where.push(`level <> 'info'`);
    }

    if (q.q?.trim()) {
      params.push(`%${q.q.trim()}%`);
      const i = params.length;
      where.push(
        `(shartnoma ILIKE $${i} OR akkaunt ILIKE $${i} OR mijoz ILIKE $${i} OR msg ILIKE $${i})`,
      );
    }

    if (q.beforeId) {
      params.push(q.beforeId);
      where.push(`id < $${params.length}`);
    }

    params.push(q.limit);
    // Ataylab `jurnalPool` emas — sabab yuqoridagi klass izohida: bu
    // operatorning dashboard so'rovi, aynan jurnal hovuzi band bo'lgan
    // paytda ham javob berishi kerak, shuning uchun asosiy hovuzda qoladi.
    const { rows } = await query(
      `SELECT * FROM app_log
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY id DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapItem);
  }

  async deleteOlderThan(days: number, flag: AppLogFlag | null): Promise<number> {
    // `flag IS NULL` va `flag = $2` — ikki xil shart, shuning uchun SQL
    // ham ikki xil. `flag = NULL` yozib bo'lmaydi: u hech qachon rost
    // bo'lmaydi va tozalash jimgina hech narsa o'chirmay qo'yardi.
    const { rowCount } = await query(
      `DELETE FROM app_log
        WHERE at < now() - ($1 || ' days')::interval
          AND ${flag ? 'flag = $2' : 'flag IS NULL'}`,
      flag ? [String(days), flag] : [String(days)],
      jurnalPool,
    );
    return rowCount ?? 0;
  }
}
