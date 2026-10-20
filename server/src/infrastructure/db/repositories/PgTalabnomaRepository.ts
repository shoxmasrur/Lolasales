import { BAND_QILUVCHI_HOLATLAR, type Talabnoma, type TalabnomaNomzodi } from '@/domain/entities/Talabnoma';
import { OCHIQ_VADA_HOLATLARI } from '@/domain/entities/PaymentPromise';
import {
  holatKorinishi,
  holatVariantlari,
  kalitgaMosXomlar,
  YOZILADIGAN_SQL_QIYMATLARI,
} from '@/domain/entities/shartnomaHolati';
import type {
  ITalabnomaRepository,
  TalabnomaFiltrVariantlari,
  TalabnomaQatori,
  TalabnomaQuery,
  YangiTalabnoma,
  YuborildiMalumoti,
} from '@/domain/repositories/ITalabnomaRepository';
import type { Page } from '@/domain/repositories/types';
import { query } from '@/infrastructure/db/pool';
import { toDate } from '@/infrastructure/db/mappers';
import { ConflictError, NotFoundError } from '@/shared/errors';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const BAND = `holat IN (${BAND_QILUVCHI_HOLATLAR.map((h) => `'${h}'`).join(',')})`;

function mapTalabnoma(r: Row): Talabnoma {
  return {
    id: r.id,
    contractId: r.contract_id,
    clientId: r.client_id,
    raqam: r.raqam ?? null,
    holat: r.holat,
    summa: Number(r.summa),
    rekvizit: r.rekvizit,
    pdfPath: r.pdf_path ?? null,
    messageId: r.message_id ?? null,
    // DATE satr bo'lib keladi (`pool.ts` 1082 parser) — kun ma'nosida qoladi.
    kuchgaKirish: r.kuchga_kirish ?? null,
    muddatSanasi: r.muddat_sanasi ?? null,
    sentAt: toDate(r.sent_at),
    sentBy: r.sent_by ?? null,
    xatoSababi: r.xato_sababi ?? null,
    createdAt: toDate(r.created_at) ?? new Date(0),
    updatedAt: toDate(r.updated_at) ?? toDate(r.created_at) ?? new Date(0),
  };
}

function mapNomzod(r: Row): TalabnomaNomzodi {
  return {
    contractId: r.contract_id,
    clientId: r.client_id,
    contractNo: r.contract_no,
    contractDate: toDate(r.contract_date),
    objectName: r.object_name ?? null,
    objectAddress: r.object_address ?? null,
    companyInn: r.company_inn ?? null,
    debtMonthly: Number(r.debt_monthly ?? 0),
    fullName: r.full_name,
    firstName: r.first_name ?? null,
    qarindoshOrqali: Boolean(r.qarindosh_orqali),
    virtualStatus: r.virtual_status ?? null,
  };
}

/**
 * Nomzodlar filtri. $1 = bugun (YYYY-MM-DD), $2 = yoziladigan holatlar,
 * $3 = ochiq va'da holatlari.
 *
 * Mijoz sharti `isContactable` (Client.ts) bilan bir xil: biri o'zgarsa
 * ikkinchisi ham — aks holda ro'yxatda turgan mijozga yuborish yiqiladi.
 * `NULLIF(.., '')` — domendagi `Boolean(phone)` bo'sh satrni ham "yo'q" deydi.
 *
 * Va'da MIJOZ bo'yicha tekshiriladi, shartnoma bo'yicha emas: mijoz
 * "15-da to'layman" degan bo'lsa, shu kungacha unga rasmiy talabnoma
 * yuborish va'dani buzgandek ko'rinadi.
 */
const nomzodSql = (istisno = ''): string => `
  SELECT c.id AS contract_id, c.client_id, c.contract_no, c.contract_date, c.object_name,
         c.object_address, c.company_inn, c.debt_monthly, c.virtual_status, cl.full_name, cl.first_name,
         (cp.interlocutor_name IS NOT NULL OR cp.interlocutor_relation IS NOT NULL) AS qarindosh_orqali
    FROM contracts c
    JOIN clients cl ON cl.id = c.client_id
    LEFT JOIN client_profiles cp ON cp.client_id = cl.id
   WHERE c.deleted_at IS NULL
     AND cl.deleted_at IS NULL
     AND NOT cl.nomalum
     AND NOT cl.do_not_contact
     AND cl.telegram_status NOT IN ('blocked', 'deactivated')
     AND (NULLIF(cl.phone, '') IS NOT NULL OR NULLIF(cl.telegram_user_id, '') IS NOT NULL)
     AND c.missed_months >= 2
     AND trim(c.virtual_status) = ANY($2)
     AND NOT EXISTS (SELECT 1 FROM talabnomalar t WHERE t.contract_id = c.id AND t.${BAND}${istisno})
     AND NOT EXISTS (
       SELECT 1 FROM payment_promises p
        WHERE p.client_id = cl.id AND p.deleted_at IS NULL
          AND p.status = ANY($3) AND p.promised_date >= $1::date)`;

const nomzodParams = (todayIso: string): unknown[] => [
  todayIso,
  [...YOZILADIGAN_SQL_QIYMATLARI],
  [...OCHIQ_VADA_HOLATLARI],
];

export class PgTalabnomaRepository implements ITalabnomaRepository {
  async nomzodlar(todayIso: string): Promise<TalabnomaNomzodi[]> {
    // Telegramdagi ismi mos kelmagan mijoz ro'yxatda turmaydi: unga yuborish
    // har doim `TELEGRAM_NOMI_MOS_EMAS` bilan rad etiladi. Bitta shartnomani
    // tekshiradigan `nomzod()` da bu shart YO'Q — u yerda aniq sabab
    // ("avval mijoz kartasida tasdiqlang") `ENDI_KERAK_EMAS` dan foydaliroq.
    const { rows } = await query(
      `${nomzodSql()} AND cl.telegram_status IS DISTINCT FROM 'name_mismatch'
        ORDER BY c.missed_months DESC, c.debt_monthly DESC, c.contract_no`,
      nomzodParams(todayIso),
    );
    return rows.map(mapNomzod);
  }

  async nomzod(contractId: string, todayIso: string, istisnoTalabnomaId?: string): Promise<TalabnomaNomzodi | null> {
    const { rows } = await query(
      `${nomzodSql(' AND t.id IS DISTINCT FROM $5::uuid')} AND c.id = $4`,
      [...nomzodParams(todayIso), contractId, istisnoTalabnomaId ?? null],
    );
    return rows[0] ? mapNomzod(rows[0]) : null;
  }

  async yarat(t: YangiTalabnoma): Promise<Talabnoma> {
    try {
      const { rows } = await query(
        `INSERT INTO talabnomalar (contract_id, client_id, holat, summa, rekvizit)
         VALUES ($1, $2, 'yuborilmoqda', $3, $4::jsonb) RETURNING *`,
        [t.contractId, t.clientId, t.summa, JSON.stringify(t.rekvizit)],
      );
      return mapTalabnoma(rows[0]!);
    } catch (err) {
      // Ikki operator bir vaqtda bosganda poygani baza hal qiladi:
      // ikkinchisi shu indeksga uriladi va 409 oladi.
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23505' && e.constraint === 'talabnomalar_bir_marta') {
        throw new ConflictError('Bu shartnomaga talabnoma allaqachon yuborilgan', 'TALABNOMA_BOR');
      }
      throw err;
    }
  }

  async raqamBer(id: string): Promise<number> {
    // COALESCE — qayta urinishda yangi raqam olinmaydi (ET- raqamlarida
    // teshik va bitta hujjatga ikki raqam bo'lmasin).
    const { rows } = await query<{ raqam: number }>(
      `UPDATE talabnomalar
          SET raqam = COALESCE(raqam, nextval('talabnoma_raqam_seq')), updated_at = now()
        WHERE id = $1 RETURNING raqam`,
      [id],
    );
    if (!rows[0]) throw new NotFoundError('Talabnoma', id);
    return Number(rows[0].raqam);
  }

  async yuborildi(id: string, p: YuborildiMalumoti): Promise<void> {
    const { rowCount } = await query(
      `UPDATE talabnomalar
          SET holat = 'yuborildi', pdf_path = $2, message_id = $3, kuchga_kirish = $4,
              muddat_sanasi = $5, sent_by = $6, sent_at = $7, xato_sababi = NULL, updated_at = now()
        WHERE id = $1 AND holat = 'yuborilmoqda'`,
      [id, p.pdfPath, p.messageId, p.kuchgaKirish, p.muddatSanasi, p.sentBy, p.sentAt],
    );
    if (!rowCount) throw new ConflictError('Talabnoma yuborilmoqda holatida emas', 'TALABNOMA_HOLATI');
  }

  async xato(id: string, sabab: string): Promise<void> {
    const { rowCount } = await query(
      `UPDATE talabnomalar SET holat = 'xato', xato_sababi = $2, updated_at = now()
        WHERE id = $1 AND holat = 'yuborilmoqda'`,
      [id, sabab],
    );
    if (!rowCount) throw new ConflictError('Talabnoma yuborilmoqda holatida emas', 'TALABNOMA_HOLATI');
  }

  async qaytaUrinishgaOl(id: string): Promise<Talabnoma | null> {
    // 10 daqiqadan beri yangilanmagan `yuborilmoqda` — jarayon yiqilib
    // (server qayta ishga tushgan) osilib qolgan deb hisoblanadi. Yangisini
    // olib bo'lmaydi: u hozir boshqa operator qo'lida ketyapti bo'lishi mumkin.
    const { rows } = await query(
      `UPDATE talabnomalar SET holat = 'yuborilmoqda', xato_sababi = NULL, updated_at = now()
        WHERE id = $1
          AND (holat = 'xato' OR (holat = 'yuborilmoqda' AND updated_at < now() - INTERVAL '10 minutes'))
        RETURNING *`,
      [id],
    );
    return rows[0] ? mapTalabnoma(rows[0]) : null;
  }

  async bekorQil(id: string): Promise<boolean> {
    const { rowCount } = await query(
      `UPDATE talabnomalar SET holat = 'bekor', updated_at = now() WHERE id = $1 AND holat = 'xato'`,
      [id],
    );
    return Boolean(rowCount);
  }

  async findById(id: string): Promise<Talabnoma | null> {
    const { rows } = await query('SELECT * FROM talabnomalar WHERE id = $1', [id]);
    return rows[0] ? mapTalabnoma(rows[0]) : null;
  }

  async bandTalabnoma(contractId: string): Promise<Talabnoma | null> {
    const { rows } = await query(`SELECT * FROM talabnomalar WHERE contract_id = $1 AND ${BAND} LIMIT 1`, [contractId]);
    return rows[0] ? mapTalabnoma(rows[0]) : null;
  }

  async list(q: TalabnomaQuery): Promise<Page<TalabnomaQatori>> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.holat) {
      params.push(q.holat);
      where.push(`t.holat = $${params.length}`);
    }
    // Bazadagi ANIQ xom qiymatlar (ustunda shu kalitga ko'rinadiganlari) —
    // `lower()` siz: baza C kollatsiyada, kirillni tushirmaydi
    // (`kalitgaMosXomlar`). Aralash yozilish ham ("Проц. Отказ") topiladi.
    if (q.shartnomaHolati) {
      params.push(kalitgaMosXomlar(await this.xomHolatlar(), q.shartnomaHolati));
      where.push(`trim(c.virtual_status) = ANY($${params.length})`);
    }
    if (q.obyekt) {
      params.push(q.obyekt);
      where.push(`trim(c.object_name) = $${params.length}`);
    }
    if (q.clientId) {
      params.push(q.clientId);
      where.push(`t.client_id = $${params.length}`);
    }
    const limit = Math.min(q.limit ?? 50, 200);
    const offset = q.offset ?? 0;
    const shart = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [{ rows: countRows }, { rows }] = await Promise.all([
      query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM talabnomalar t JOIN contracts c ON c.id = t.contract_id ${shart}`,
        params,
      ),
      query(
        `SELECT t.*, cl.full_name, c.contract_no, c.object_name, c.virtual_status, u.full_name AS sent_by_name
           FROM talabnomalar t
           JOIN clients cl ON cl.id = t.client_id
           JOIN contracts c ON c.id = t.contract_id
           LEFT JOIN users u ON u.id = t.sent_by
           ${shart}
          ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
    ]);
    return {
      items: rows.map((r) => ({
        ...mapTalabnoma(r),
        fullName: r.full_name,
        contractNo: r.contract_no,
        sentByName: r.sent_by_name ?? null,
        objectName: (r.object_name as string | null)?.trim() || null,
        shartnomaHolati: holatKorinishi(r.virtual_status),
      })),
      total: countRows[0]?.count ?? 0,
      limit,
      offset,
    };
  }

  /** Talabnomasi bor shartnomalarning takrorsiz xom `virtual_status` lari (qirqilgan). */
  private async xomHolatlar(): Promise<string[]> {
    const { rows } = await query<{ v: string }>(
      `SELECT DISTINCT trim(c.virtual_status) AS v FROM talabnomalar t
         JOIN contracts c ON c.id = t.contract_id
        WHERE NULLIF(trim(c.virtual_status), '') IS NOT NULL`,
    );
    return rows.map((r) => r.v);
  }

  async filtrVariantlari(): Promise<TalabnomaFiltrVariantlari> {
    // Xom qiymatlar takrorsiz; kanonik kalitga JS'da keltiriladi (kalit va
    // Excel nomi bitta variant bo'lsin).
    const [holatlar, { rows: obyektRows }] = await Promise.all([
      this.xomHolatlar(),
      query<{ v: string }>(
        `SELECT DISTINCT trim(c.object_name) AS v FROM talabnomalar t
           JOIN contracts c ON c.id = t.contract_id
          WHERE NULLIF(trim(c.object_name), '') IS NOT NULL`,
      ),
    ]);
    return {
      holatlar: holatVariantlari(holatlar),
      obyektlar: obyektRows.map((r) => r.v).sort((a, b) => a.localeCompare(b)),
    };
  }

  async faolMuddat(clientId: string, todayIso: string): Promise<string | null> {
    const { rows } = await query<{ muddat: string | null }>(
      `SELECT max(muddat_sanasi)::text AS muddat FROM talabnomalar
        WHERE client_id = $1 AND holat = 'yuborildi' AND muddat_sanasi >= $2::date`,
      [clientId, todayIso],
    );
    return rows[0]?.muddat ?? null;
  }

  async yuborilganlar(clientId: string): Promise<Array<Talabnoma & { contractNo: string }>> {
    const { rows } = await query(
      `SELECT t.*, c.contract_no FROM talabnomalar t
         JOIN contracts c ON c.id = t.contract_id
        WHERE t.client_id = $1 AND t.holat = 'yuborildi'
        ORDER BY t.sent_at DESC`,
      [clientId],
    );
    return rows.map((r) => ({ ...mapTalabnoma(r), contractNo: r.contract_no }));
  }
}
