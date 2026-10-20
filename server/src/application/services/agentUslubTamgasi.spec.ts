import { uslubTamgasi } from '@/application/services/uslubTamgasi';

/** Qo'lda ishga tushiriladi: npm run test:uslub-tamgasi */
let failed = 0;
const eq = (nom: string, got: unknown, kut: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(kut)) {
    console.error(`✗ ${nom}: ${JSON.stringify(got)} ≠ ${JSON.stringify(kut)}`);
    failed += 1;
  }
};

eq('mavjud meta saqlanadi', uslubTamgasi({ model: true }, 'v2'), { model: true, styleVersion: 'v2' });
eq('bo\'sh meta', uslubTamgasi(undefined, 'v1'), { styleVersion: 'v1' });
// Tamg'a yozilgandan keyin o'zgarmaydi: akkaunt uslubi almashsa ham
// eski xabar o'z versiyasida qolishi kerak.
eq('mavjud tamg\'a ustidan yozilmaydi', uslubTamgasi({ styleVersion: 'v1' }, 'v2'), { styleVersion: 'v1' });

console.log(failed ? `${failed} ta xato` : 'Hammasi o\'tdi');
process.exit(failed ? 1 : 0);
