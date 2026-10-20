import { eslatmaKerakmi } from '@/domain/services/eslatma';

/** Qo'lda: npm run test:eslatma --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const T0 = new Date('2026-11-05T06:00:00Z'), H = (h: number) => new Date(T0.getTime() + h * 3600_000);
const B = { stage: 'qiziqdi' as const, remindedStages: [], lastOutboundAt: T0, lastInboundAt: null };
check('24 soat o\'tdi', eslatmaKerakmi(B, H(24), 24), true);
check('erta', eslatmaKerakmi(B, H(23), 24), false);
check('mijoz javob bergan', eslatmaKerakmi({ ...B, lastInboundAt: H(1) }, H(30), 24), false);
check('javob eski xabardan oldin', eslatmaKerakmi({ ...B, lastInboundAt: H(-1) }, H(30), 24), true);
check('shu bosqichda yozilgan', eslatmaKerakmi({ ...B, remindedStages: ['qiziqdi'] }, H(48), 24), false);
check('keyingi bosqichda yana bir marta', eslatmaKerakmi({ ...B, stage: 'karta_yuborildi', remindedStages: ['qiziqdi'] }, H(48), 24), true);
check('rad etilgandan keyin yo\'q', eslatmaKerakmi({ ...B, stage: 'karta_yuborildi', remindedStages: ['qiziqdi', 'karta_yuborildi'] }, H(48), 24), false);
check('suhbatda bosqichida yo\'q', eslatmaKerakmi({ ...B, stage: 'suhbatda' }, H(48), 24), false);
check('chiquvchi xabar yo\'q', eslatmaKerakmi({ ...B, lastOutboundAt: null }, H(48), 24), false);
check('soat sozlamasi 48', eslatmaKerakmi(B, H(30), 48), false);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
