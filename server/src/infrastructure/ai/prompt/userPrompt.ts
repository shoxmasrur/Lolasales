import type { AgentTurnInput, HistoryItem, TurnMode } from '@/domain/services/IAgentEngine';
import { buildContextBlock, som } from '@/infrastructure/ai/prompt/systemPrompt';
import {
  oxirgiChiquvchiVaqti,
  salomlashuvQoidasi,
  yangiKunmi,
} from '@/infrastructure/ai/prompt/salomlashuv';
import { config } from '@/shared/config';

export type { TurnMode } from '@/domain/services/IAgentEngine';

/**
 * Navbatning foydalanuvchi qismi — kontekst, tarix va vazifa matni.
 *
 * NEGA ALOHIDA MODUL: ikkala engine (Claude va OpenAI) AYNAN shu matnni
 * yuborishi shart — aks holda solishtiruv modelning emas, promptning
 * farqini ko'rsatardi.
 */

/**
 * Mijoz to'lov cheki yubordi — uni MENEJER tekshiradi.
 *
 * Javob bitta va qisqa. Muddat va'da qilinmaydi: tekshiruv qachon
 * tugashini menejer biladi, agent emas.
 */
export const RECEIPT_REVIEW_RULE =
  '- MIJOZ TO\'LOV CHEKI YUBORDI. Chekni menejer tekshiradi, natija hali yo\'q.\n' +
  '  • Faqat shu mazmunda 1-2 jumla yozing: "Chekni oldim, rahmat. Tekshirib chiqamiz, ' +
  'tasdiqlanishi bilan yozaman."\n' +
  '  • "To\'lov qabul qilindi", "tasdiqlandi" DEMANG — chek hali tekshirilmagan.\n' +
  '  • Vaqt VA\'DA QILMANG: "bir kun ichida", "tez orada", "bugun" kabi muddat aytmang.\n' +
  '  • Chekka shubha bildirmang. Havola va guruh haqida hali gapirmang.\n' +
  '  • `sendCard` = false va `escalate` = null — tizim chekni menejerga o\'zi beradi.';

/** Chek allaqachon qabul qilingan, tekshiruv hali ochiq — takrorlanmaydi. */
export const RECEIPT_REVIEW_ACK_RULE =
  '- MIJOZNING TO\'LOV CHEKI MENEJER TEKSHIRUVIDA. Chekni olganingizni allaqachon aytgansiz.\n' +
  '  • Chek qabul qilinganini TAKRORLAMANG — mijozning yangi xabariga javob bering.\n' +
  '  • "To\'lov qabul qilindi", "tasdiqlandi" DEMANG.\n' +
  '  • Vaqt VA\'DA QILMANG ("bir kun ichida" ham). Chekka shubha bildirmang.\n' +
  '  • Mijoz natijani so\'rasa: tekshirilyapti, tasdiqlanishi bilan yozasiz.\n' +
  '  • `sendCard` = false.';

/**
 * Operator topshirig'i: chek kelgan, lekin agent unga hali javob BERMAGAN
 * (kill switch yoqiq yoki suhbat menejerda turganda kelgan).
 */
export const RECEIPT_REVIEW_OPERATOR_RULE =
  '- MIJOZ TO\'LOV CHEKI YUBORGAN. Chekni menejer tekshiryapti, natija hali yo\'q.\n' +
  '  • Suhbat tarixida chek haqida hali aytmagan bo\'lsangiz — topshiriq mavzusidan oldin qisqa ' +
  '"Chekni oldim, rahmat" mazmunida ayting. Aytgan bo\'lsangiz — takrorlamang.\n' +
  '  • "To\'lov qabul qilindi", "tasdiqlandi" DEMANG — chek hali tekshirilmagan.\n' +
  '  • Vaqt VA\'DA QILMANG: "bir kun ichida", "tez orada", "bugun" kabi muddat aytmang.\n' +
  '  • `sendCard` = false.';

/** Javob rejimidagi chek qoidasi — bir vaqtda bittasi. */
function chekQoidasi(input: AgentTurnInput): string {
  if (input.receiptReview === 'new') return `\n${RECEIPT_REVIEW_RULE}`;
  if (input.receiptReview === 'acknowledged' || input.receiptPending) return `\n${RECEIPT_REVIEW_ACK_RULE}`;
  return '';
}

/**
 * Tarixning bitta qatori — agent ko'radigan ko'rinishda.
 *
 * O'CHIRILGAN XABARNING MATNI ATAYLAB CHIQMAYDI: mijozda undan hech narsa
 * qolmagan, agent esa mijoz ko'rmagan gapga tayanib javob yozardi.
 */
export function tarixQatori(entry: HistoryItem): string {
  if (entry.role === 'operator') return `OPERATOR KO'RSATMASI (mijoz ko'rmaydi): ${entry.text}`;
  const kim = entry.role === 'client' ? 'MIJOZ' : 'SIZ';
  if (entry.holat === 'ochirilgan') return `${kim}: [bu xabar o'chirildi]`;
  if (entry.holat === 'tuzatilgan') {
    return `${kim} (TUZATILGAN — mijozda hozir shu matn turibdi): ${entry.text}`;
  }
  return `${kim}: ${entry.text}`;
}

export function buildUserPrompt(input: AgentTurnInput, mode: TurnMode, now: Date): string {
  const parts: string[] = [buildContextBlock(input.context, now, config.TIMEZONE)];
  // "Bugun mijozga birinchi marta yozyapmizmi?" — salom shunga bog'liq.
  const yangiKun = yangiKunmi(oxirgiChiquvchiVaqti(input.history), now, config.TIMEZONE);

  if (input.history.length) {
    parts.push(`## SUHBAT TARIXI\n${input.history.map(tarixQatori).join('\n')}`);
  }

  switch (mode) {
    case 'first':
      parts.push(firstTask(input, yangiKun));
      break;
    case 'nudge':
      parts.push(nudgeTask(input, yangiKun));
      break;
    case 'operator':
      parts.push(operatorTask(input, yangiKun));
      break;
    case 'receipt_confirmed':
      parts.push(receiptConfirmedTask(input, yangiKun));
      break;
    case 'receipt_rejected':
      parts.push(receiptRejectedTask(input, yangiKun));
      break;
    default:
      parts.push(
        `## MIJOZNING YANGI XABARI\n${input.incoming ?? '(bo\'sh xabar)'}\n\n` +
          '## VAZIFA\nShu xabarga javob yozing. Avval suhbat tarixiga qarab hozir sotuvning qaysi ' +
          'bosqichida ekaningizni aniqlang va faqat KEYINGI qadamni bajaring — oldingi savolni ' +
          'takrorlamang. Mijozning holatiga qarab ohangni moslang.\n' +
          salomlashuvQoidasi(yangiKun, 'javob') +
          chekQoidasi(input),
      );
  }

  return parts.join('\n\n');
}

/**
 * Birinchi murojaat — matn manbaga qarab farq qiladi.
 *
 * `reklama` manbasida bu rejim ishlatilmaydi: mijoz o'zi yozgan, ya'ni
 * suhbat `reply` dan boshlanadi. Shunga qaramay chaqirilsa (masalan
 * qayta urinishda), qo'lda qo'shilgan mijoz kabi yoziladi.
 */
function firstTask(input: AgentTurnInput, yangiKun: boolean): string {
  const ctx = input.context;
  const umumiy = [
    '- Jonli, odam yozgandek yozing — reklama matni emas. 2-3 qator, bitta savol.',
    '- Birinchi xabarda narx, karta va to\'lov haqida gapirmang.',
    '- `stage` = null, `sendCard` = false.',
    salomlashuvQoidasi(yangiKun, 'tanishtiruv'),
  ];

  if (ctx.source === 'guruh') {
    return [
      '## VAZIFA — BIRINCHI MUROJAAT (GURUH KOMMENTI)',
      `Mijoz "${ctx.sourceGroup ?? 'kanal'}" dagi postga komment yozgan: «${ctx.sourceComment ?? ''}».`,
      'Kommentga tayaning: o\'zingizni qisqa tanishtiring, uning kommentini eslatib, aynan shu '
        + 'bo\'yicha yozayotganingizni ayting va ehtiyojini bilish uchun bitta savol bering.',
      '- Kommentni so\'zma-so\'z takrorlamang — mazmuniga javob bering.',
      ...umumiy,
    ].join('\n');
  }

  return [
    '## VAZIFA — BIRINCHI MUROJAAT',
    'Mijoz bizga hali yozmagan. O\'zingizni va kompaniyani qisqa tanishtiring, sotuvdagi kurs '
      + 'haqida bir jumlada ayting va unga qiziqishini qisqa so\'rang. Sotuvda kurs bo\'lmasa — '
      + 'keyingi kurs haqida ayting.',
    '- Mijozni bezovta qilganingiz uchun uzr so\'rab, bosimsiz yozing.',
    ...umumiy,
  ].join('\n');
}

/**
 * Bir bosqichga bitta yumshoq eslatma. Mijoz jim — bu xabarni agent
 * boshlaydi. Kartani qayta yubormaydi: u chatda allaqachon turibdi.
 */
function nudgeTask(input: AgentTurnInput, yangiKun: boolean): string {
  const bosqich = input.nudgeStage ?? input.context.purchase?.stage ?? null;
  const mazmun =
    bosqich === 'karta_yuborildi'
      ? 'Mijozga karta yuborilgan, lekin chek kelmagan. To\'lov bo\'yicha savoli qolgan-qolmaganini '
        + 'yumshoq so\'rang va to\'lovdan keyin chekni shu yerga yuborishini eslating. Karta raqamini '
        + 'yozmang va `sendCard` = false.'
      : 'Mijoz kursga qiziqqan, lekin keyin javob bermadi. Kurs bo\'yicha savoli qolgan-qolmaganini '
        + 'yumshoq so\'rang; joylar yoki sotuv muddati haqida faqat kontekstda yozilgan faktni ayting.';

  return [
    '## VAZIFA — YUMSHOQ ESLATMA',
    'Mijoz oxirgi xabarimizga javob bermadi. Yangi xabar kelmagan; bu xabarni siz boshlayapsiz.',
    mazmun,
    '',
    'QOIDALAR:',
    salomlashuvQoidasi(yangiKun, 'eslatma'),
    '- Bu yagona eslatma: bosim qilmang, javob bermagani uchun AYBLAMANG.',
    '- Oldingi xabaringizni QAYTA YOZMANG. Bitta savol bering va to\'xtang.',
    '- BITTA xabar, 1-2 qator. `replySecond` = null, `stage` = null.',
  ].join('\n');
}

/**
 * Operator topshirig'i bo'yicha xabar. Topshiriq — MAVZU, qoidalar —
 * uslub va chegara: shoshilib yozilgan jumla mijozga so'zma-so'z ketmaydi.
 */
function operatorTask(input: AgentTurnInput, yangiKun: boolean): string {
  const topshiriq = input.operatorInstruction?.trim() || '(topshiriq bo\'sh)';

  return [
    '## VAZIFA — OPERATOR TOPSHIRIG\'I',
    'Mijoz yangi xabar yozmadi; bu xabarni siz boshlayapsiz. Hamkasbingiz (operator) nima haqida gaplashishni yozdi:',
    `"${topshiriq}"`,
    '',
    'QOIDALAR:',
    salomlashuvQoidasi(yangiKun, 'topshiriq mavzusi'),
    '- Topshiriq NIMA haqida yozishni aytadi. QANDAY yozish — qoidalaringizdan: taqiqlar, '
      + 'uslub va kurs faktlari topshiriqdan USTUN.',
    '- Topshiriq matnini mijozga so\'zma-so\'z ko\'chirmang. "operator aytdi" DEMANG — o\'z nomingizdan yozing.',
    '- Bitta savol bering va to\'xtang.',
    '- Topshiriq tushunarsiz yoki qoidalar bilan bajarib bo\'lmaydigan bo\'lsa — `reply` ni null '
      + 'qoldiring va `escalate` ga sababini yozing.',
    ...(input.receiptReview === 'acknowledged' ? [RECEIPT_REVIEW_ACK_RULE] : []),
    ...(input.receiptReview === 'new' ? [RECEIPT_REVIEW_OPERATOR_RULE] : []),
  ].join('\n');
}

/**
 * Menejer chekni tasdiqladi — rahmat. Raqamlar KODDA hisoblangan:
 * qolgan summa aynan shu yerda beriladi, agent o'zi hisoblamaydi.
 */
function receiptConfirmedTask(input: AgentTurnInput, yangiKun: boolean): string {
  const r = input.receiptConfirmed;
  if (!r) return '## VAZIFA\nChek tasdig\'i ma\'lumoti yo\'q — `reply` ni null qoldiring.';

  const lines = [
    '## VAZIFA — CHEK TASDIQLANDI',
    'Mijoz to\'lov chekini yuborgan edi. Menejer uni tekshirdi va to\'lovni QABUL QILDI.',
    'Mijoz yangi xabar yozmadi; bu xabarni siz boshlayapsiz.',
    '',
    'QOIDALAR:',
    salomlashuvQoidasi(yangiKun, 'rahmat'),
    '- Birinchi jumla shu mazmunda: "To\'lovingiz qabul qilindi, rahmat!"',
  ];

  if (r.remaining > 0) {
    lines.push(
      `- Bu bo'lib to'lash: hozircha ${som(r.paidAmount)} to'langan, qolgan summa — ${som(r.remaining)}. `
        + 'Qolgan summani AYNAN shu ko\'rinishda, yumshoq ohangda ayting. Yangi sana talab qilmang.',
    );
  } else {
    lines.push('- Kurs to\'liq to\'landi — buni ham ayting.');
  }

  lines.push(
    r.linkWillBeSent
      ? '- Yopiq guruh havolasini tizim ALOHIDA xabar qilib yuboradi — havolani o\'zingiz yozmang, '
        + 'faqat "guruh havolasini hozir yuboraman" mazmunida ayting.'
      : '- Guruh havolasi haqida gapirmang va havola yozmang.',
    '- BITTA xabar, 1-3 jumla. `replySecond` = null, `sendCard` = false, `stage` = null, `escalate` = null.',
  );
  return lines.join('\n');
}

/**
 * Menejer chekni rad etdi — sababga tayanib qayta chek so'raladi.
 * Ayblov yo'q: chek ko'pincha xato rasm yoki boshqa to'lov bo'ladi.
 */
function receiptRejectedTask(input: AgentTurnInput, yangiKun: boolean): string {
  const sabab = input.receiptRejected?.reason?.trim() || '(sabab ko\'rsatilmagan)';
  return [
    '## VAZIFA — CHEK QABUL QILINMADI',
    'Mijoz yuborgan chekni menejer tekshirdi va qabul qilmadi. Menejer yozgan sabab:',
    `"${sabab}"`,
    'Mijoz yangi xabar yozmadi; bu xabarni siz boshlayapsiz.',
    '',
    'QOIDALAR:',
    salomlashuvQoidasi(yangiKun, 'asosiy gap'),
    '- Sababni muloyim, o\'z so\'zlaringiz bilan tushuntiring va to\'g\'ri chekni shu yerga qayta yuborishini so\'rang.',
    '- AYBLAMANG va "soxta" demang. Menejer yozgan matnni so\'zma-so\'z ko\'chirmang.',
    '- Karta chatda allaqachon bor — `sendCard` = false, raqamni yozmang.',
    '- BITTA xabar, 1-3 jumla. `replySecond` = null, `stage` = null.',
  ].join('\n');
}
