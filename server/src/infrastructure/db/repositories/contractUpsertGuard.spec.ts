import assert from 'node:assert/strict';
import { CONTRACT_UPSERT_SQL } from '@/infrastructure/db/repositories/contractUpsertSql';

/**
 * Qo'lda ishga tushiriladi: npm run test:contract-upsert-guard
 *
 * REAL XATONI QO'RIQLAYDI (2026-08-21): ertalabki debitorlar importi
 * kechikish ustunlarini fayldagi eski raqamlar bilan qayta yozardi va
 * operator "CRM'dan yangilash" bosgandan keyin ham eski summani ko'rardi.
 * O'sha kuni CRM'dan sinxronlangan 816 shartnomaning 159 tasida saqlangan
 * kechikish grafikka mos emas edi — hammasida `updated_at > synced_at`,
 * ya'ni sinxronizatsiyadan keyin import tegib ketgan.
 *
 * Testda SQL matni tekshiriladi: bazasiz ishlaydigan yagona daraja shu, va
 * u aynan qaytib kelishi mumkin bo'lgan xatoni ushlaydi —
 * `debt_total = EXCLUDED.debt_total` ni birov qaytarib qo'ysa test yiqiladi.
 */

/** CRM sinxronizatsiyasi hisoblab yozadigan ustunlar — import tegmaydi. */
const CRM_NIKI = [
  'paid_total',
  'remaining_total',
  'next_payment_date',
  'days_overdue',
  'debt_first',
  'debt_monthly',
  'debt_total',
];

/** Fayldan keladi va har importda yangilanishi KERAK. */
const FAYLNIKI = [
  'client_id',
  'object_name',
  'status',
  'virtual_status',
  'total_price',
  'monthly_payment',
  'warning_count',
  'last_warning_at',
  'raw',
  'import_batch_id',
];

let xato = 0;
const tekshir = (nom: string, shart: () => void): void => {
  try {
    shart();
    console.log(`  ok — ${nom}`);
  } catch (err) {
    xato += 1;
    console.error(`  YIQILDI — ${nom}\n    ${(err as Error).message}`);
  }
};

console.log('Shartnoma upsert: import CRM raqamlarini bosmaydi');

for (const ustun of CRM_NIKI) {
  tekshir(`${ustun} — sinxronlangan bo'lsa bazadagi qiymat qoladi`, () => {
    assert.ok(
      CONTRACT_UPSERT_SQL.includes(
        `CASE WHEN contracts.synced_at IS NULL THEN EXCLUDED.${ustun}`,
      ),
      `${ustun} uchun synced_at qo'riqchisi yo'q`,
    );
    assert.ok(
      CONTRACT_UPSERT_SQL.includes(`ELSE contracts.${ustun}`),
      `${ustun} sinxronlangan qatorda saqlanmaydi`,
    );
  });

  tekshir(`${ustun} — qo'riqchisiz to'g'ridan-to'g'ri yozilmaydi`, () => {
    // Aynan qaytib kelishi mumkin bo'lgan satr: `debt_total = EXCLUDED.debt_total`.
    assert.ok(
      !new RegExp(`\\n\\s*${ustun}\\s*=\\s*EXCLUDED\\.${ustun}`).test(CONTRACT_UPSERT_SQL),
      `${ustun} hamon to'g'ridan-to'g'ri EXCLUDED dan olinyapti`,
    );
  });
}

for (const ustun of FAYLNIKI) {
  tekshir(`${ustun} — fayldan yangilanadi`, () => {
    assert.ok(
      new RegExp(`\\n\\s*${ustun}\\s*=\\s*EXCLUDED\\.${ustun}`).test(CONTRACT_UPSERT_SQL),
      `${ustun} import qiymatini olmayapti`,
    );
  });
}

tekshir("yangi shartnomada fayl qiymatlari yoziladi (synced_at NULL)", () => {
  // Yangi qatorda `synced_at` NULL — CASE fayl qiymatini tanlaydi.
  assert.ok(CONTRACT_UPSERT_SQL.includes('INSERT INTO contracts'));
  assert.ok(CONTRACT_UPSERT_SQL.includes('ON CONFLICT (contract_no) WHERE deleted_at IS NULL'));
});

tekshir("created_import_batch_id ataylab yangilanmaydi", () => {
  assert.ok(!CONTRACT_UPSERT_SQL.includes('created_import_batch_id = EXCLUDED'));
});

/**
 * Faqat shartnomalar bazasidan sinxronizatsiya to'ldiradigan ustunlar —
 * `ContractUpsert` (`Contract.ts`) ularni `Omit` bilan ataylab chiqarib
 * tashlagan, chunki Excel eksportida bunday ustunlar YO'Q. Agar
 * `CONTRACT_UPSERT_SQL` ustun ro'yxatiga (INSERT yoki UPDATE tomonida)
 * ulardan birini qo'shib qo'ysa, u faylda yo'q bo'lgani uchun
 * `EXCLUDED.<ustun>` NULL bo'lib chiqadi va har importda jonli
 * qiymat (bitish muddati, uy ma'lumotlari, grafikdan sanalgan oy soni)
 * o'chib ketadi — xuddi 2026-08-21 dagi kechikish xatosi kabi, faqat
 * bu ustunlarda import hech qachon to'g'ri qiymat bermaydi.
 */
const SINXRONIZATSIYANIKI = [
  'completion_date',
  'apartment_number',
  'apartment_floor',
  'apartment_rooms',
  'apartment_entrance',
  'apartment_block',
  'apartment_area',
  'missed_months',
];

for (const ustun of SINXRONIZATSIYANIKI) {
  tekshir(`${ustun} — importda umuman yo'q`, () => {
    assert.ok(
      !CONTRACT_UPSERT_SQL.includes(ustun),
      `${ustun} CONTRACT_UPSERT_SQL ga qo'shib qo'yilgan — sinxronizatsiya qiymatini o'chirib yuboradi`,
    );
  });
}

if (xato) {
  console.error(`\n${xato} ta tekshiruv yiqildi`);
  process.exit(1);
}
console.log('\nHammasi o\'tdi');
