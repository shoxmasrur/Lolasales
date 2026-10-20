import pg from 'pg';
import { config } from '@/shared/config';
import { childLogger } from '@/shared/logger';
import { alsKontekstidanTashqarida } from '@/infrastructure/logging/dbLogSink';

const log = childLogger('db');

// NUMERIC va BIGINT'ni JS number sifatida qaytaramiz — bizda 2^53 dan katta
// pul summasi bo'lmaydi (kurs narxlari million so'mlar atrofida).
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number.parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10)));
// DATE — vaqt mintaqasi siljishisiz, satr sifatida (YYYY-MM-DD)
pg.types.setTypeParser(1082, (v) => v);

export type Sql = pg.Pool | pg.PoolClient;

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// ALS konteksdan tashqarida: bu ishlovchi modul yuklanishida ro'yxatdan
// o'tgan, lekin uning socket'i `dbLogSink`ning `append` konteksti ICHIDA
// tug'ilgan bo'lishi mumkin (pool yuklama ostida aynan shu payt o'sadi) —
// shunda `log.error` rekursiya himoyasiga tushib, `app_log`ga
// yozilmasdan qolardi (dbLogSink.ts'dagi CHEKKA HOLAT izohiga qarang).
pool.on('error', (err) => alsKontekstidanTashqarida(() => log.error({ err }, 'Postgres pool xatosi')));

/**
 * Jurnal yozuvlari uchun ALOHIDA hovuz.
 *
 * NEGA KERAK: Telegram audit izi yoqilgandan keyin har bir MTProto
 * chaqiruvi ikkita `INSERT` beradi. Ommaviy kampaniyada bu yuzlab
 * parallel yozuv degani va ular asosiy hovuzning 10 ta ulanishini
 * domen so'rovlari (suhbat, xabar, mijoz) bilan BO'LISHARDI.
 *
 * Yomoni shundaki, halqa o'zini kuchaytiradi: domen so'rovlari 500ms
 * dan oshsa, har biri "Sekin so'rov" ogohlantirishini beradi, u esa
 * yana bitta `INSERT`. Yuqoridagi `skipSlowWarn` bayrog'i jurnalning
 * O'ZINI shu halqadan chiqargan edi, lekin jurnal boshqalarni och
 * qoldirib, keyin ularning ogohlantirishlari orqali halqaga qaytishini
 * to'xtata olmasdi.
 *
 * Alohida hovuz bu bog'liqlikni butunlay uzadi: jurnal qancha band
 * bo'lmasin, domen so'rovlari uchun 10 ta ulanish tegilmasdan turadi.
 * Evaziga og'ir yuk ostida audit qatori YO'QOLISHI mumkin — ulanish
 * kutish vaqti tugaydi va `dbLogSink` `stderr` ga bir marta
 * ogohlantirish yozadi. Bu ataylab tanlangan almashuv: iz to'liqligidan
 * ko'ra ilovaning ishlashi muhimroq.
 *
 * DIQQAT: bu hovuz FAQAT yozuv tomoni uchun (`append`, `deleteOlderThan`)
 * — `app_log`ning HAR BIR so'rovi bu yerdan o'tmaydi. Operatorning
 * dashboard o'qishi (`PgAppLogRepository.list`) ataylab asosiy `pool`da
 * qoladi: aynan shu o'qish ommaviy kampaniya tufayli jurnal hovuzi band
 * bo'lgan paytda kerak bo'ladi — operator nima bo'layotganini shu payt
 * bilishi kerak, `jurnalPool`ning 3 ta ulanishi band bo'lib, timeout
 * bersa ham emas.
 *
 * `max: 3` — yozuv qisqa va indeksli, uchta ulanish daqiqasiga minglab
 * qatorni bemalol oladi. `connectionTimeoutMillis` esa asosiy
 * hovuznikidan qisqa: navbat cho'zilib xotirada o'sib ketgandan ko'ra
 * tez va ovoz chiqarib yiqilgani ma'qul.
 */
export const jurnalPool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,
});

// Asosiy hovuzdagi bilan bir xil sabab: bu ishlovchi `append` konteksti
// ichida tug'ilgan socket uchun ishga tushishi mumkin (yuqoridagi izoh).
jurnalPool.on('error', (err) =>
  alsKontekstidanTashqarida(() => log.error({ err }, 'Jurnal pool xatosi')),
);

interface QueryOptions {
  /**
   * Ushbu so'rov sekin so'rov ogohlantirishidan ozod.
   *
   * NEGA FAQAT SHU BAYROQ BILAN: `log.warn` chaqirilsa, `dbLogSink` uni
   * `app_log`ga yozadi — bu yozuv `jurnalPool` orqali ketadigan bitta
   * `INSERT` (`PgAppLogRepository.append`). Agar jurnalning o'z yozuvi
   * 500ms dan sekin ketsa va shu bayroq bo'lmasa, u o'zi haqida
   * ogohlantirish chiqarardi, ogohlantirish esa yana bitta `INSERT`
   * qo'shardi — halqa butunlay `jurnalPool`ning ICHIDA, uch ulanishli
   * kichik hovuzda aylanardi (10 ta ulanishli asosiy poolga emas).
   * Hovuz kichik bo'lgani uchun bu halqa oldingidan ham tezroq uni
   * to'ldirib qo'yishi mumkin. Bazadagi boshqa sekin so'rovlar
   * (`scope: 'db'`) dashboardda ko'rinishda davom etadi — operator
   * ularni bilishi kerak; ozod qilingan FAQAT jurnalning o'z yozuvi,
   * chunki aynan o'sha halqaga kiradi.
   */
  skipSlowWarn?: boolean;
}

export async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  client: Sql = pool,
  options: QueryOptions = {},
): Promise<pg.QueryResult<R>> {
  const started = Date.now();
  try {
    return await client.query<R>(sql, params as never[]);
  } finally {
    const ms = Date.now() - started;
    if (ms > 500 && !options.skipSlowWarn) log.warn({ ms, sql: sql.slice(0, 120) }, 'Sekin so\'rov');
  }
}

/** Tranzaksiya — xatoda avtomatik ROLLBACK. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  // Ikkalasi ham yopiladi. `allSettled` — biri yiqilsa ikkinchisi
  // baribir yopilsin, aks holda jarayon tugashida ochiq ulanish qolardi.
  const hovuzlar = [
    { nomi: 'pool', va: pool },
    { nomi: 'jurnalPool', va: jurnalPool },
  ];
  const natijalar = await Promise.allSettled(hovuzlar.map((h) => h.va.end()));

  // Natijani qayta uloqtirmaymiz — to'xtash jarayoni baribir davom
  // etishi kerak — lekin jimgina yutib yubormaymiz ham: agar biror
  // hovuz yopilmasa (masalan, hali qaytarilmagan client bor), buni
  // operator bilishi shart, aks holda serverda ulanish ochiq qolgani
  // hech qayerda ko'rinmasdi.
  natijalar.forEach((natija, i) => {
    if (natija.status === 'rejected') {
      log.error({ err: natija.reason, pool: hovuzlar[i]!.nomi }, 'Pool yopilmadi');
    }
  });
}
