import {
  sanaQisqa,
  shartnomaSanasi,
  sonSozBilan,
  summaRaqamda,
  summaSozBilan,
  talabnomaRaqami,
} from '@/domain/services/talabnomaFormat';

/** Qo'lda: npm run test:talabnoma-format --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};
check('0', sonSozBilan(0), 'нол');
check('15', sonSozBilan(15), 'ўн беш');
check('100', sonSozBilan(100), 'бир юз');
check('2 024', sonSozBilan(2024), 'икки минг йигирма тўрт');
check('18 900 000', sonSozBilan(18_900_000), 'ўн саккиз миллион тўққиз юз минг');
check('67 424 000', sonSozBilan(67_424_000), 'олтмиш етти миллион тўрт юз йигирма тўрт минг');
check('1 000 000 000', sonSozBilan(1_000_000_000), 'бир миллиард');
check('so\'z bilan', summaSozBilan(18_900_000), '(ўн саккиз миллион тўққиз юз минг сўм 00 тийин)');
check('tiyin', summaSozBilan(1500.5), '(бир минг беш юз сўм 50 тийин)');
check('raqamda', summaRaqamda(18_900_000), '18 900 000,00');
check('raqamda kichik', summaRaqamda(950), '950,00');
check('ET-01', talabnomaRaqami(1), 'ET-01');
check('ET-10', talabnomaRaqami(10), 'ET-10');
check('ET-100', talabnomaRaqami(100), 'ET-100');
check('ET-__', talabnomaRaqami(null), 'ET-__');
check('sana', sanaQisqa('2026-10-16'), '16.10.2026 й');
check('shartnoma sanasi', shartnomaSanasi(new Date('2025-03-12T00:00:00Z')), '"12" март 2025 йил');
check('shartnoma sanasi null', shartnomaSanasi(null), '');
check('oylar', [1,2,3,4,5,6,7,8,9,10,11,12].map((m) => shartnomaSanasi(new Date(Date.UTC(2025, m - 1, 1)))).join('|'),
  '"01" январ 2025 йил|"01" феврал 2025 йил|"01" март 2025 йил|"01" апрел 2025 йил|"01" май 2025 йил|"01" июн 2025 йил|"01" июл 2025 йил|"01" август 2025 йил|"01" сентябр 2025 йил|"01" октябр 2025 йил|"01" ноябр 2025 йил|"01" декабр 2025 йил');
console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
