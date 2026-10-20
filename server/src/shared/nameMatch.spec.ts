import { matchesClientName } from '@/shared/nameMatch';

/** Qo'lda ishga tushiriladi: npm run test:name-match */
const CASES: Array<{ client: string; telegram: string; expect: string }> = [
  // Real holat: raqam boshqa odamga o'tgan
  { client: 'Safarov Dilmurod Akbarjonovich', telegram: 'Ulugbek CTO', expect: 'mismatch' },
  { client: 'Djurayeva Aytulpa Muminovna', telegram: 'Sardor Aliyev', expect: 'mismatch' },

  // To'g'ri mos kelish
  { client: 'Djurayeva Aytulpa Muminovna', telegram: 'Aytulpa', expect: 'match' },
  { client: 'Djurayeva Aytulpa Muminovna', telegram: 'Aytulpa Djurayeva', expect: 'match' },
  { client: 'Safarov Dilmurod Akbarjonovich', telegram: 'Dilmurod', expect: 'match' },

  // Transliteratsiya farqlari — bir xil ism, boshqacha yozilgan
  { client: 'Djurayeva Aytulpa Muminovna', telegram: 'Jurayeva', expect: 'match' },
  { client: 'Xolmatov Sherzod', telegram: 'Sherzod Holmatov', expect: 'match' },
  { client: 'Qodirov Ulugbek', telegram: 'Kodirov', expect: 'match' },

  // Kirill yozuvi
  { client: 'Karimov Ulugbek', telegram: 'Улугбек', expect: 'match' },
  { client: 'Avezmuratova Gulnora Allayarovna', telegram: 'Гулнора', expect: 'match' },

  // Qo'shimcha bilan
  { client: 'Mamatqulov Aziz Ravshan ogli', telegram: 'Azizbek', expect: 'match' },
  { client: 'Alimova Aziza Alidjanovna', telegram: 'Alimova', expect: 'match' },

  // Taqqoslab bo'lmaydigan holatlar — ayblab bo'lmaydi
  { client: 'Safarov Dilmurod Akbarjonovich', telegram: '', expect: 'unknown' },
  { client: 'Safarov Dilmurod Akbarjonovich', telegram: '🔥🔥', expect: 'unknown' },
  { client: 'Safarov Dilmurod Akbarjonovich', telegram: '777', expect: 'unknown' },
  { client: 'Safarov Dilmurod Akbarjonovich', telegram: 'AZ', expect: 'unknown' },
  { client: '', telegram: 'Dilmurod', expect: 'unknown' },
];

let failed = 0;
for (const c of CASES) {
  const actual = matchesClientName(c.client, c.telegram);
  const ok = actual === c.expect;
  if (!ok) failed += 1;
  console.log(
    `${ok ? '✓' : '✗'} "${c.client}" ↔ "${c.telegram}" → ${actual}${ok ? '' : `  (kutilgan: ${c.expect})`}`,
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
