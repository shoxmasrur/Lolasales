import {
  bugungiKun,
  kunOraligi,
  kunSanasiXatosi,
} from '@/domain/services/kunChegarasi';

/** Qo'lda ishga tushiriladi: npm run test:kun-chegarasi --workspace=server */

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

// Toshkent 00:00 — UTC bo'yicha oldingi kunning 19:00 i.
check('oddiy kun', kunOraligi('2026-09-18'), {
  boshIso: '2026-09-17T19:00:00.000Z',
  oxirIso: '2026-09-18T19:00:00.000Z',
});
check('oy chegarasi', kunOraligi('2026-10-01'), {
  boshIso: '2026-09-30T19:00:00.000Z',
  oxirIso: '2026-10-01T19:00:00.000Z',
});
check('yil chegarasi', kunOraligi('2027-01-01'), {
  boshIso: '2026-12-31T19:00:00.000Z',
  oxirIso: '2027-01-01T19:00:00.000Z',
});
check('kabisa fevrali', kunOraligi('2028-02-29'), {
  boshIso: '2028-02-28T19:00:00.000Z',
  oxirIso: '2028-02-29T19:00:00.000Z',
});

// UTC bo'yicha hali kecha, Toshkentda esa allaqachon ertaga.
check('UTC 19:30 — Toshkentda ertangi kun', bugungiKun(new Date('2026-09-17T19:30:00Z')), '2026-09-18');
check('UTC 18:30 — hali o\'sha kun', bugungiKun(new Date('2026-09-17T18:30:00Z')), '2026-09-17');

check('bugun', kunSanasiXatosi('2026-09-18', '2026-09-18'), null);
check('kecha', kunSanasiXatosi('2026-09-17', '2026-09-18'), null);
check('30 kun oldin', kunSanasiXatosi('2026-08-19', '2026-09-18'), null);
check('31 kun oldin', kunSanasiXatosi('2026-08-18', '2026-09-18'), 'Faqat oxirgi 30 kunni ko\'rish mumkin');
check('ertaga', kunSanasiXatosi('2026-09-19', '2026-09-18'), 'Kelajakdagi kun tanlab bo\'lmaydi');
check('format', kunSanasiXatosi('18.09.2026', '2026-09-18'), 'Sana YYYY-MM-DD ko\'rinishida');
check('mavjud emas', kunSanasiXatosi('2026-02-31', '2026-09-18'), 'Sana noto\'g\'ri');

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
