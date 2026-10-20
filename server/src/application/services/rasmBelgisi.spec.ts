import { rasmBelgisi, stikerBelgisi } from '@/application/services/IncomingMediaProcessor';

/**
 * Qo'lda ishga tushiriladi: npm run test:rasm-belgisi --workspace=server
 *
 * NIMA QO'RIQLANADI: vision qaytargan tavsif (`image_note`) agentga
 * ketadigan matnga HECH QACHON qo'shilmasligi kerak. Agentda
 * "tasdiqlanmagan raqamni aytma" degan qat'iy taqiq bor; tavsifdagi
 * summa promptga tushsa, model uni mijozga takrorlab yuborardi, va
 * vision raqamni noto'g'ri o'qigan bo'lsa biz tasdiqlanmagan summani
 * aytgan bo'lardik.
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

check('tolov belgisi', rasmBelgisi('tolov') === '[mijoz to\'lov cheki yubordi]', rasmBelgisi('tolov'));
check('hujjat belgisi', rasmBelgisi('hujjat') === '[mijoz hujjat rasmini yubordi]', rasmBelgisi('hujjat'));
check('boshqa belgisi', rasmBelgisi('boshqa') === '[mijoz rasm yubordi]', rasmBelgisi('boshqa'));
check(
  'noaniq belgisi',
  rasmBelgisi('noaniq') === '[mijoz rasm yubordi — nimaligi aniqlanmadi]',
  rasmBelgisi('noaniq'),
);
check('tasnif yo\'q — eski belgi', rasmBelgisi(null) === '[mijoz rasm yubordi]', rasmBelgisi(null));

// Belgilarning HECH BIRIDA raqam yoki tavsif bo'lmasligi kerak.
for (const kind of ['tolov', 'hujjat', 'boshqa', 'noaniq'] as const) {
  const b = rasmBelgisi(kind);
  check(`${kind}: belgida raqam yo'q`, !/\d/.test(b), b);
}
check('stiker belgisida faqat emoji', /^\[stiker(: .+)?\]$/.test(stikerBelgisi('👋')), stikerBelgisi('👋'));

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
