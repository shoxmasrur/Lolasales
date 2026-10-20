import { uslubVersiyasi, STYLE_VERSIONS } from '@/domain/entities/UslubVersiyasi';

/** Qo'lda ishga tushiriladi: npm run test:uslub-versiyasi */
const CASES: Array<{ kirish: unknown; kutilgan: string }> = [
  { kirish: 'v1', kutilgan: 'v1' },
  { kirish: 'v2', kutilgan: 'v2' },
  // Noma'lum qiymatda tizim HOZIRGI holatida qolishi kerak — v2 ga
  // tasodifan o'tib ketish mijozga ko'rinadigan o'zgarish demak.
  { kirish: 'v3', kutilgan: 'v1' },
  { kirish: '', kutilgan: 'v1' },
  { kirish: null, kutilgan: 'v1' },
  { kirish: undefined, kutilgan: 'v1' },
  { kirish: 2, kutilgan: 'v1' },
];

let failed = 0;
for (const c of CASES) {
  const got = uslubVersiyasi(c.kirish);
  if (got !== c.kutilgan) {
    console.error(`✗ ${JSON.stringify(c.kirish)} → ${got}, kutilgan ${c.kutilgan}`);
    failed += 1;
  }
}
if (STYLE_VERSIONS.length !== 2) {
  console.error(`✗ STYLE_VERSIONS uzunligi ${STYLE_VERSIONS.length}, kutilgan 2`);
  failed += 1;
}
console.log(failed ? `${failed} ta xato` : `${CASES.length} ta holat o'tdi`);
process.exit(failed ? 1 : 0);
