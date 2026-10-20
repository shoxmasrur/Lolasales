import { bayramBloki } from '@/infrastructure/ai/prompt/userPrompt';

/**
 * Qo'lda ishga tushiriladi: npm run test:bayram-bloki --workspace=server
 *
 * NEGA BU TEST KERAK: agent mijoz bilan gaplashadi. Bayramda "bugun
 * to'lang" deyish — mijoz bajara olmaydigan talab, va u agentga bo'lgan
 * ishonchni yo'qotadi. Blok promptga tushmasa, xato faqat mijozning
 * noroziligida ko'rinadi.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const k = JSON.stringify(kutilgan);
  if (a === k) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${k})`);
  }
}

eq('bayram yo\'q — blok ham yo\'q', bayramBloki(null), '');

{
  const matn = bayramBloki({
    name: 'Mustaqillik bayrami',
    endsOn: '2026-09-02',
    keyingiIshKuni: '2026-09-03',
  });
  eq('nom bor', matn.includes('Mustaqillik bayrami'), true);
  eq('bugunga so\'ramaslik aytilgan', matn.includes('BUGUNGA'), true);
  eq('keyingi ish kuni bor', matn.includes('3-sentabr'), true);
  eq('bahslashmaslik aytilgan', matn.includes('bahslashma'), true);
  // `endsOn` — bayramning OXIRGI yopiq kuni. "gacha ishlamaydi" formulasi
  // buni "o'sha kun ochiq" deb o'qitib qo'yardi — matn "shu kungacha
  // (o'sha kun ham) ishlamaydi" deb aniq aytishi shart.
  eq(
    '"gacha ishlamaydi" emas, "shu kungacha (o\'sha kun ham)" aytilgan',
    matn.includes('shu kungacha (o\'sha kun ham) ishlamaydi'),
    true,
  );
  eq('eski noaniq ibora yo\'q', matn.includes('gacha ishlamaydi'), false);
}

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
