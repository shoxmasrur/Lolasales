/**
 * Provayder (OpenAI) xato matnini operatorga ko'rsatishdan OLDIN tozalaydi.
 *
 * NEGA KERAK: OpenAI'ning xato matni odatda foydali (masalan model nomi
 * xato yoki limitga tegilgan bo'lsa, aynan shu matn sababni ko'rsatadi) —
 * shuning uchun uni umuman yashirib bo'lmaydi. LEKIN ayrim xatolar
 * (eng ko'p uchraydigani — «Incorrect API key provided: sk-abc...xyz»)
 * kiritilgan kalitning bir qismini o'z ichiga oladi. Bu ikkisini bir xil
 * ko'rib bo'lmaydi:
 *
 *   • Avtorizatsiya xatosi (401/403) — sabab HAR DOIM bitta: kalit
 *     yaroqsiz. Provayder matni bu holatda umuman ko'rsatilmaydi, chunki
 *     aynan shu holatda kalit bo'lagi eng ko'p chiqadi va matn operator
 *     uchun qo'shimcha ma'no bermaydi.
 *   • Boshqa xato (model topilmadi, 429 limit va h.k.) — matn foydali,
 *     shuning uchun qaytariladi, faqat `sk-...` ko'rinishidagi har qanday
 *     ketma-ketlik niqoblanadi (ehtiyot chorasi — bunday shakl boshqa
 *     sababdan ham matnda uchrashi mumkin).
 *
 * NEGA `shared/` DA: bu yerdan `OpenAiAgentEngine.run()` (infratuzilma
 * qatlami) MANBADA — `AppError` matnini qurishda — chaqiradi, `llmRoutes.ts`
 * (taqdimot qatlami) esa o'z xato matnlarini tozalashda ishlatadi. Funksiya
 * ilgari `presentation/http/routes/` da edi — infratuzilma undan chaqirsa
 * qatlam tartibi (yuqoridan pastga import) buzilardi, shuning uchun bu
 * yerga — ikkalasi ham erkin import qiladigan pastki qatlamga ko'chirildi.
 * MANBADA tozalash muhim: shundagina bu xato matnidan o'sadigan HAMMA yo'l
 * (jurnal — `AgentRunner.navbat()` dagi `log.warn`, `probe`, marshrutlar)
 * avtomatik qoplanadi — har birida alohida tozalashni eslab yurish shart
 * emas.
 */
const STATUS_NAQSHI = /\((\d{3})\)/;
const KALIT_NAQSHI = /sk-[A-Za-z0-9_-]{4,}/g;

export const KALIT_YAROQSIZ_XABARI =
  'Kalit yaroqsiz yoki muddati tugagan — Sozlamalar sahifasidan yangilang';

/**
 * `xabar` — tayyor xato matni (masalan `OpenAI javob bermadi (401): …`).
 * HTTP status matn ichidagi `(NNN)` shaklidan o'qiladi — `OpenAiAgentEngine`
 * va `/openai/available` ikkalasi ham shu formatda yozadi, alohida
 * parametr sifatida status berish ikki chaqiruv joyini murakkablashtirardi.
 */
export function providerXatosiniTozala(xabar: string): string {
  const mos = xabar.match(STATUS_NAQSHI);
  const status = mos ? Number(mos[1]) : undefined;
  if (status === 401 || status === 403) return KALIT_YAROQSIZ_XABARI;
  return xabar.replace(KALIT_NAQSHI, 'sk-***');
}
