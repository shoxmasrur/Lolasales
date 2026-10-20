import type { AgentDebtContext, AgentTurnInput } from '@/domain/services/IAgentEngine';
import { buildContextBlock } from '@/infrastructure/ai/prompt/systemPrompt';
import {
  oxirgiChiquvchiVaqti,
  salomlashuvQoidasi,
  yangiKunmi,
} from '@/infrastructure/ai/prompt/salomlashuv';
import { config } from '@/shared/config';
import { formatSom } from '@/shared/money';
import { formatUzDate, zonedParts } from '@/shared/datetime';

/**
 * Navbatning foydalanuvchi qismi — kontekst, tarix va vazifa matni.
 *
 * NEGA ALOHIDA MODUL: bu matn engine ichida (`ClaudeAgentEngine`) turardi.
 * Endi ikkita engine bor — ishlab turgani va solishtiruv stendidagisi.
 * Ikkalasi ham AYNAN shu matnni yuborishi shart: prompt bir belgiga
 * farq qilsa, "qaysi model yaxshiroq yozadi" degan savolga olingan
 * javob modelning emas, promptning farqini ko'rsatardi.
 */

/** Agentning bir navbati qanday sababdan kelib chiqqani. */
export type TurnMode =
  | 'first' | 'reply' | 'reminder' | 'thanks' | 'nudge' | 'operator' | 'receipt_confirmed' | 'oylik_eslatma';

/**
 * Mijoz kvitansiya yubordi, biz tekshirayapmiz — natija hali yo'q.
 *
 * Ikki xato bir xil qimmat: "to'lovingiz tushdi" deb erta aytish (keyin
 * tushmasa ishonch yo'qoladi) va hech narsa bo'lmagandek yana pul talab
 * qilish (mijoz chekni ko'rsatgan, bu uning jahlini chiqaradi).
 */
export const RECEIPT_PENDING_RULE =
  '- MIJOZ TO\'LAGANINI AYTDI (chek yoki xabar). CRM\'ni kuzatyapmiz, natija hali yo\'q.\n' +
  '  • Chek yuborgan bo\'lsa rahmat ayt; yubormagan bo\'lsa chek SO\'RAMA. Tekshirayotganingni bildir.\n' +
  '  • Xonsaroy Pay orqali to\'langan bo\'lsa darhol, bank orqali bo\'lsa bir kun ' +
  'ichida ko\'rinishini tushuntir — mijoz kutishga tayyor bo\'lsin.\n' +
  '  • "To\'lovingiz tushdi", "tasdiqlandi" DEMA — buni hali bilmaymiz.\n' +
  '  • Qayta to\'lov TALAB QILMA, yangi sana ham so\'rama: mijoz allaqachon ' +
  'to\'laganini ko\'rsatdi.\n' +
  '  • Chekni "soxta" deb ayblama va shubha bildirma.';

/**
 * Mijoz to'lov cheki yubordi — uni HAMKASB tekshiradi (2026-09-17).
 *
 * Javob bitta va qisqa. Muddat va'da qilinmaydi: tekshiruv qachon
 * tugashini operator biladi, agent emas — "bir kun ichida" deb yozilsa va
 * kechiksa, mijoz ikkinchi marta aldangandek bo'ladi.
 */
export const RECEIPT_REVIEW_RULE =
  '- MIJOZ TO\'LOV CHEKI YUBORDI. Chekni hamkasbing tekshiradi, natija hali yo\'q.\n' +
  '  • Faqat shu mazmunda 1-2 jumla yoz: "Chekni oldim, rahmat. Hamkasbim tekshirib chiqadi, ' +
  'tasdiqlanishi bilan yozaman."\n' +
  '  • To\'lov ham, yangi sana ham SO\'RAMA.\n' +
  '  • "To\'lovingiz tushdi", "tasdiqlandi" DEMA — hamkasbing hali tekshirmagan.\n' +
  '  • Vaqt VA\'DA QILMA: "bir kun ichida", "tez orada", "bugun" kabi muddat aytma.\n' +
  '  • Chekka shubha bildirma va uni "soxta" deb ayblama.\n' +
  '  • "Oxirgi kelib tushgan to\'lovlar (CRM)" ro\'yxatidagi summalarni AYTMA.\n' +
  '  • `paymentClaim` = false va `escalate` = null — tizim chekni hamkasbingga o\'zi beradi.';

/** Chek allaqachon qabul qilingan, tekshiruv hali ochiq — takrorlanmaydi. */
export const RECEIPT_REVIEW_ACK_RULE =
  '- MIJOZNING TO\'LOV CHEKI HAMKASBINGDA TEKSHIRUVDA. Chekni olganingni allaqachon aytgansan.\n' +
  '  • Chek qabul qilinganini TAKRORLAMA — mijozning yangi xabariga javob ber.\n' +
  '  • To\'lov ham, yangi sana ham SO\'RAMA. "Tushdi", "tasdiqlandi" DEMA.\n' +
  '  • Vaqt VA\'DA QILMA ("bir kun ichida" ham). Chekka shubha bildirma, CRM ro\'yxatidagi summalarni aytma.\n' +
  '  • Mijoz natijani so\'rasa: hamkasbing tekshiryapti, tasdiqlanishi bilan yozasan.\n' +
  '  • `paymentClaim` = false.';

/**
 * Operator topshirig'i: chek kelgan, lekin agent unga hali javob BERMAGAN.
 *
 * Bunday holat bo'ladi: chek kill switch yoqiq paytda, suhbat allaqachon
 * operatorda turganda yoki agent yiqilganda keldi. `RECEIPT_REVIEW_ACK_RULE`
 * bu yerda yolg'on bo'lardi — agent chekni olganini hali aytmagan.
 */
export const RECEIPT_REVIEW_OPERATOR_RULE =
  '- MIJOZ TO\'LOV CHEKI YUBORGAN. Chekni hamkasbing tekshiryapti, natija hali yo\'q.\n' +
  '  • Suhbat tarixida chek haqida hali aytmagan bo\'lsang — topshiriq mavzusidan oldin qisqa ' +
  '"Chekni oldim, rahmat" mazmunida ayt. Aytgan bo\'lsang — takrorlama.\n' +
  '  • "To\'lovingiz tushdi", "tasdiqlandi" DEMA — hamkasbing hali tekshirmagan.\n' +
  '  • Vaqt VA\'DA QILMA: "bir kun ichida", "tez orada", "bugun" kabi muddat aytma.\n' +
  '  • To\'lov ham, yangi sana ham SO\'RAMA.\n' +
  '  • Chekka shubha bildirma, CRM ro\'yxatidagi summalarni aytma.\n' +
  '  • `paymentClaim` = false.';

/** Javob rejimidagi chek/da'vo qoidasi — bir vaqtda bittasi. */
function tolovTekshiruviQoidasi(input: AgentTurnInput): string {
  if (input.receiptReview === 'new') return `\n${RECEIPT_REVIEW_RULE}`;
  if (input.receiptReview === 'acknowledged') return `\n${RECEIPT_REVIEW_ACK_RULE}`;
  return input.receiptPending ? `\n${RECEIPT_PENDING_RULE}` : '';
}

/**
 * Tarixning bitta qatori — agent ko'radigan ko'rinishda.
 *
 * O'CHIRILGAN XABARNING MATNI ATAYLAB CHIQMAYDI. Mijozda undan hech
 * narsa qolmagan; matnni ko'rsatsak, agent mijoz ko'rmagan gapga
 * tayanib javob yozardi va suhbat ikkiga bo'linib ketardi.
 */
export function tarixQatori(entry: AgentTurnInput['history'][number]): string {
  // Topshiriq tahrirlanmaydi va Telegramdan o'chirilmaydi — `holat` unga
  // tegishli emas. "Mijoz ko'rmaydi" ATAYLAB yoziladi: aks holda agent
  // keyingi javobda topshiriqqa mijoz bilan kelishilgan gap deb tayanardi.
  if (entry.role === 'operator') return `OPERATOR KO'RSATMASI (mijoz ko'rmaydi): ${entry.text}`;
  const kim = entry.role === 'client' ? 'MIJOZ' : 'SEN';
  if (entry.holat === 'ochirilgan') return `${kim}: [bu xabar o'chirildi]`;
  if (entry.holat === 'tuzatilgan') {
    return `${kim} (TUZATILGAN — mijozda hozir shu matn turibdi): ${entry.text}`;
  }
  return `${kim}: ${entry.text}`;
}

export function buildUserPrompt(input: AgentTurnInput, mode: TurnMode, now: Date): string {
  const parts: string[] = [buildContextBlock(input.context, now, config.TIMEZONE)];
  // "Bugun mijozga birinchi marta yozyapmizmi?" — salom shunga bog'liq.
  // To'rtala rejimda ham bir xil hisoblanadi, aks holda bir kunda ikki xil
  // qaror chiqib, mijoz ikki marta salom olishi mumkin edi.
  const yangiKun = yangiKunmi(oxirgiChiquvchiVaqti(input.history), now, config.TIMEZONE);

  if (input.brokenPromise) {
    parts.push(
      `## BUZILGAN VA'DA\nMijoz ${formatUzDate(input.brokenPromise.date)} sanasida ` +
        `${formatSom(input.brokenPromise.amount)} to'lashga va'da bergan edi, lekin to'lamadi. ` +
        'Buni suhbatda aniq eslat — bu eng kuchli bosim asosi.',
    );
  }

  // Ochiq kelishuv FAQAT javob rejimida alohida bo'lim bo'lib chiqadi:
  // eslatma va rahmat vazifalari uni o'z matnida allaqachon aytadi va
  // ikki marta yozilsa raqamlar takrorlanib, xabar rasmiy hisobotga
  // o'xshab qolardi.
  if (mode === 'reply' && input.openPromise) {
    parts.push(ochiqKelishuvBloki(input.openPromise, input.context, now));
  }

  // Bayram bloki buzilgan va'dadan KEYIN turadi: ikkalasi bir vaqtda
  // bo'lsa, agent avval bosim asosini, keyin bugungi cheklovni o'qiydi
  // — teskarisi bo'lsa cheklov bosim ostida ko'zdan qochardi.
  const bayram = bayramBloki(input.bayram);
  if (bayram) parts.push(bayram);

  if (input.history.length) {
    const transcript = input.history.map(tarixQatori).join('\n');
    parts.push(`## SUHBAT TARIXI\n${transcript}`);
  }

  if (mode === 'first') {
    parts.push(
      '## VAZIFA\nBu mijoz bilan BIRINCHI aloqa. O\'zingni tanishtir, qaysi shartnoma ' +
        '(bir nechta bo\'lsa — qaysi shartnomalar) ' +
        'bo\'yicha yozayotganingni ayt, kechikkan to\'lov summasini ko\'rsat, so\'ng qachon ' +
        'to\'lay olishini so\'ra. Necha KUN kechikkanini AYTMA ("29 kun kechikib ketibdi" ' +
        'kabi jumla birinchi xabarda kerak emas) — kechikish ssenariysi bandida kun soni ' +
        'bo\'lsa ham. Kechikishning ikkala qismi ham ' +
        'berilgan bo\'lsa — boshlang\'ich to\'lov va oylik to\'lovlar — ikkalasini ' +
        'alohida ayt va jamini ko\'rsat. Jonli, odam yozgandek yoz — ' +
        'rasmiy idora tilida emas. Birinchi xabarda hali bekor qilish haqida gapirma — ' +
        'avval javobini kut.\n' +
        // Bu yerda tarix bo'sh, ya'ni qoida doim "yangi kun" tarmog'iga tushadi —
        // shunda ham umumiy funksiya ishlatiladi: salom matni bitta joyda tursin.
        salomlashuvQoidasi(yangiKun, 'tanishtiruv'),
    );
  } else if (mode === 'reminder') {
    parts.push(reminderTask(input, yangiKun));
  } else if (mode === 'thanks') {
    parts.push(thanksTask(input, yangiKun, now));
  } else if (mode === 'nudge') {
    parts.push(nudgeTask(input, yangiKun));
  } else if (mode === 'operator') {
    parts.push(operatorTask(input, yangiKun));
  } else if (mode === 'receipt_confirmed') {
    parts.push(receiptConfirmedTask(input, yangiKun));
  } else if (mode === 'oylik_eslatma') {
    parts.push(oylikEslatmaTask(input, yangiKun));
  } else {
    parts.push(
      `## MIJOZNING YANGI XABARI\n${input.incoming ?? '(bo\'sh xabar)'}\n\n` +
        '## VAZIFA\nShu xabarga javob yoz. Avval mijozning holatini aniqla (asabiy, ' +
        'charchagan, uyalgan, qo\'rqqan, befarq, xotirjam) va ohangni shunga moslashtir. ' +
        'Javob noaniq bo\'lsa — muzokara zinapoyasidagi KEYINGI qadamni bajar, ' +
        'oldingi qadamni takrorlama.\n' +
        salomlashuvQoidasi(yangiKun, 'javob') +
        tolovTekshiruviQoidasi(input),
    );
  }

  return parts.join('\n\n');
}

/**
 * Bugun bayram bo'lsa — agentga beriladigan blok.
 *
 * NEGA BAHSLASHMASLIK ALOHIDA AYTILADI: mijoz "bugun bank ishlamaydi"
 * desa, bu haqiqat. Agent buni e'tiroz deb qabul qilib, "iltimos
 * bugun hal qiling" deb turib olsa — mijoz uchun bu agent voqelikni
 * bilmasligining isboti bo'ladi va butun suhbatga bo'lgan ishonch
 * so'nadi.
 */
export function bayramBloki(bayram: AgentTurnInput['bayram']): string {
  if (!bayram) return '';
  return (
    `## BUGUN BAYRAM\nBugun ${bayram.name} — bayram ${formatUzDate(bayram.endsOn)} kuni tugaydi, ` +
    `banklar shu kungacha (o'sha kun ham) ishlamaydi. To'lovni BUGUNGA so'rama. ` +
    `Keyingi ish kuni: ${formatUzDate(bayram.keyingiIshKuni)}. ` +
    `Mijoz "hozir to'lay olmayman" desa — bu HAQIQAT, bahslashma; ` +
    `kelishuvni keyingi ish kuniga qo'y.\n`
  );
}

/**
 * Suhbatda HALI KUCHDAGI kelishuv bor — javob yozishdan oldin ko'riladi.
 *
 * NEGA KERAK: bu maydon ilgari javob rejimida bo'sh qolardi va model
 * kelishuvni faqat suhbat tarixidan bilardi. Tarix cheklangan, ya'ni
 * uzun suhbatda kelishuv undan chiqib ketardi va agent mijoz allaqachon
 * javob bergan savolni — "qachon to'laysiz?" — qaytadan berardi.
 *
 * Sana o'tgan-o'tmagani KODDA hal qilinadi, modelga taxmin qildirilmaydi:
 * bu yerga tushgan kelishuv buzilgan deb belgilanmagan, ya'ni sanasi
 * o'tgan bo'lsa mijoz uning bir qismini to'lagan bo'ladi.
 */
function ochiqKelishuvBloki(
  open: NonNullable<AgentTurnInput['openPromise']>,
  context: AgentDebtContext,
  now: Date,
): string {
  // Qoldiq VA'DADAN hisoblanmaydi (`crmKechikkanTolovi` ga qara). Aynan shu
  // blok mijozga javob yo'lida chiqadi — 2026-09-10 da Boyirov Boyxonga
  // xato raqam ham shu yo'ldan ketgan edi.
  const crm = crmKechikkanTolovi(context);
  const muddatIchida = zonedParts(now, config.TIMEZONE).isoDate <= open.date;

  const lines = [
    '## OCHIQ KELISHUV',
    `Mijoz ${formatUzDate(open.date)} sanasida ${formatSom(open.amount)} to'lashga rozi bo'lgan.`,
  ];

  if (open.paid > 0) {
    lines.push(
      `Shundan ${formatSom(open.paid)} allaqachon kelib tushgan va unga rahmat aytilgan. ` +
        'Kelgan qismni TAN OL, aks holda mijoz to\'lagan pulini ko\'rmaganimiz bo\'lib chiqadi.',
    );
  }

  lines.push(crmQoldiqKorsatmasi(crm));

  lines.push(
    muddatIchida
      ? 'Kelishilgan sana HALI O\'TMAGAN. "Qachon to\'laysiz?" deb QAYTA SO\'RAMA va ' +
          'yangi sana taklif qilma — mijoz javobini allaqachon bergan. Yangi sana faqat ' +
          'MIJOZNING O\'ZI eskisini o\'zgartirsa yoziladi. Kerak bo\'lsa kelishuvni ' +
          'shunchaki tasdiqlab qo\'y.'
      : 'Kelishilgan sana o\'tgan, lekin mijoz bir qismini to\'lagan — uni ' +
          '"va\'dasini buzdi" deb AYBLAMA. To\'lagan qismini tan olib, qolgani uchun ' +
          'yangi sana so\'ra.',
  );

  return lines.join(' ');
}

/**
 * Mijozga aytiladigan KECHIKKAN TO'LOV QOLDIG'I — yagona manbai CRM.
 *
 * NEGA VA'DADAN EMAS: va'da yozuvidagi "qancha keldi" oynasi bitta
 * to'lovni ikki marta sanab qo'yishi mumkin — `vadaTolovi.ts` dagi sana
 * oynasi har yangi va'da yozilganda qaytadan ochiladi. 2026-09-10 da
 * mijozga 4 311 000 so'm deyilgan, CRM'da esa 4 811 000 turgan edi;
 * farq aynan ikki marta sanalgan 500 000 lik to'lov. Shundan keyin
 * qoldiq FAQAT CRM raqamlaridan olinadi, va'da yozuvi esa sana va mijoz
 * aytgan kelishuv summasi uchun qoladi.
 *
 * BIR NECHTA SHARTNOMADA RAQAM BERILMAYDI: har bir shartnomaning
 * kechikkan to'lovi kontekst blokida o'z bo'limida turibdi. Bu yerda
 * yangi jami raqam chiqarish o'sha blokdagi "summalarni qo'shib bitta
 * raqam qilib aytma" qoidasini buzardi.
 */
type CrmQoldigi =
  | { turi: 'yagona'; summa: number }
  | { turi: 'koplab' }
  | { turi: 'yopilgan' };

function crmKechikkanTolovi(context: AgentDebtContext): CrmQoldigi {
  if (context.contracts.length > 1) return { turi: 'koplab' };

  // Bitta shartnomada raqam AYNAN kontekst blokidagi qatorlardan yig'iladi
  // (`debtFirst + debtMonthly`) — mijoz bitta xabarda ikki xil raqam
  // ko'rmasligi kerak. Shartnomasi umuman qolmagan mijozda (hammasi bekor
  // qilingan) mijoz darajasidagi yig'indiga tushamiz.
  const yagona = context.contracts[0] ?? null;
  const summa = yagona ? yagona.debtFirst + yagona.debtMonthly : context.debtSum;
  return summa > 0 ? { turi: 'yagona', summa } : { turi: 'yopilgan' };
}

/** Qoldiq raqamini qayerdan olish kerakligi — vazifa matniga qo'yiladigan jumla. */
function crmQoldiqKorsatmasi(crm: CrmQoldigi): string {
  if (crm.turi === 'koplab') {
    return 'Mijozda bir nechta shartnoma bor — summalarni qo\'shib JAMI raqam AYTMA. ' +
      'Har bir shartnomaning kechikkan to\'lovi "MIJOZ MA\'LUMOTI" blokida o\'z bo\'limida ' +
      'turibdi: qoldiqni o\'sha yerdan, shartnoma raqami bilan birga ayt.';
  }
  if (crm.turi === 'yopilgan') {
    return 'Tizimda bu mijozning kechikkan to\'lovi QOLMAGAN — qoldiq raqamini umuman aytma.';
  }
  return `Mijozga aytiladigan qoldiq — ${formatSom(crm.summa)}: tizimdagi bugungi holat. ` +
    'Kelishuv summasidan to\'langanini ayirib O\'ZING hisoblama.';
}

/**
 * Kelishilgan kunning ertalabidagi eslatma.
 *
 * Bu yerdagi asosiy xavf — agentning odatiy undirish rejimiga tushib
 * qolishi: kechikkan to'lovni qayta sanab berish, kechikish kunini eslatish, "aks
 * holda…" qo'shish. Mijoz hali HECH NARSANI buzmagan, shuning uchun
 * ohang eslatma bo'lishi kerak, talab emas.
 */
function reminderTask(input: AgentTurnInput, yangiKun: boolean): string {
  const due = input.openPromise;
  // Kelishuvning bir qismi allaqachon kelgan bo'lishi mumkin — o'shanda
  // eslatma QOLDIQ haqida bo'ladi. Butun summani qayta aytish mijozning
  // to'lagan pulini ko'rmaganimiz bo'lib chiqardi.
  //
  // QOLDIQ VA'DADAN HISOBLANMAYDI (`crmKechikkanTolovi` ga qara): raqam
  // CRM'dan keladi, va'da yozuvidan esa faqat sana va mijoz aytgan
  // kelishuv summasi olinadi.
  const crm = crmKechikkanTolovi(input.context);
  const amount = crm.turi === 'yagona' ? formatSom(crm.summa) : '';
  const qismanTolangan = Boolean(due && due.paid > 0);

  return (
    '## VAZIFA — VA\'DA KUNIDAGI ESLATMA\n' +
    'BUGUN — mijozning o\'zi aytgan to\'lov kuni' +
    `${amount ? `; tizimdagi bugungi kechikkan to'lov — ${amount}` : ''}. ` +
    'Mijoz yangi xabar yozmadi; bu eslatmani sen boshlayapsan.\n\n' +
    'QOIDALAR:\n' +
    `${salomlashuvQoidasi(yangiKun, 'eslatma')}\n` +
    (qismanTolangan
      ? '- Mijoz kelishuvning bir qismini ALLAQACHON to\'lagan va unga rahmat ' +
        'aytilgan. Buni tan olib boshla, keyin qolgani haqida eslat. ' +
        'Kelishuvning to\'liq summasini QAYTA aytma.\n' +
        `- ${crmQoldiqKorsatmasi(crm)}\n`
      : '') +
    '- Mijoz hali HECH NARSANI buzmagan — ayblovchi yoki talabchi ohang BO\'LMASIN.\n' +
    '- Ma\'no: "bugun kelishuvimiz kuni edi, eslatib qo\'yay". Do\'stona va qisqa.\n' +
    '- Kechikkan to\'lov summasini, kechikish kunini, shartnoma bandlarini QAYTA SANAB BERMA — ' +
    'bu haqda allaqachon gaplashgansan, mijoz biladi.\n' +
    '- Bosim vositalari, ogohlantirish, "aks holda…" — ISHLATILMAYDI.\n' +
    `- BITTA xabar, ${yangiKun ? '2-3' : '1-2'} qator. \`replySecond\` null bo'lsin.\n` +
    '- Bitta yumshoq savol bilan tugat ("bugun ulgurasizmi?" kabi). ' +
    'Javobni majburlama.\n' +
    '- `state` ni "promised" holicha qoldir — kelishuv hali kuchda.\n' +
    '- `promise` ni null qoldir: yangi va\'da olinmadi, eskisi o\'zgarmadi.\n' +
    '- Suhbat tarixiga qara: bugun allaqachon shu haqda yozilgan bo\'lsa, ' +
    '`reply` ni null qoldir.'
  );
}

/**
 * Kelib tushgan to'lov uchun rahmat.
 *
 * Asosiy xavf — agentning undirish rejimida qolib ketishi: rahmat
 * aytib, darhol "qolganini qachon to'laysiz?" deb bosim boshlashi.
 * Mijoz aynan hozir kelishuvini bajardi; birinchi navbatda buni
 * e'tirof etish kerak.
 *
 * Ikkinchi xavf — "kechikkan to'lovingiz yo'q" deb noto'g'ri aytish.
 * Shuning uchun bu jumla FAQAT `debtCleared` bo'lganda promptga
 * qo'shiladi; qaror kodda qabul qilingan.
 *
 * Uchinchi xavf — CRM'dan ajralib ketgan qoldiq. Mijozga aytiladigan
 * qoldiq `crmKechikkanTolovi` dan olinadi; `paymentReceived` dagi
 * `totalPaid` va `remaining` mijozga CHIQMAYDI — ular va'da arifmetikasi
 * bo'lib, bitta to'lovni ikki marta sanab qo'yishi mumkin.
 */
function thanksTask(input: AgentTurnInput, yangiKun: boolean, now: Date): string {
  const p = input.paymentReceived;
  if (!p) return '## VAZIFA\nTo\'lov ma\'lumoti yo\'q — `reply` ni null qoldir.';

  // `full` alohida maydon sifatida uzatilmaydi: qoldiq nol bo'lishi
  // aynan "to'liq to'landi" degani, ikkita maydon esa bir-biriga zid
  // qiymat olib kelishi mumkin edi.
  const full = p.remaining === 0;
  // Va'da yo'q — mijoz kvitansiya yuborgan va to'lovi tasdiqlangan.
  // Solishtiradigan kelishuv bo'lmagani uchun "qancha qoldi" degan gap
  // ham yo'q: bor-yo'g'i kelgan pul uchun rahmat aytiladi.
  const promisesiz = p.promisedAmount === null;
  // Mijozga ketadigan qoldiqning YAGONA manbai. Va'dadan faqat kelishuv
  // summasi (mijozning o'z so'zi) va sanasi ishlatiladi.
  const crm = crmKechikkanTolovi(input.context);

  const lines = [
    '## VAZIFA — TO\'LOV UCHUN RAHMAT',
    `Mijozdan ${formatSom(p.newMoney)} to'lov kelib tushdi va tizimda ko'rindi.`,
    'Mijoz yangi xabar yozmadi; bu xabarni sen boshlayapsan.',
  ];

  if (promisesiz) {
    lines.push(
      'Mijoz to\'lov chekini yuborgan edi va biz uni TEKSHIRIB TASDIQLADIK —',
      'pul haqiqatan kelib tushdi. Buni ayt: mijoz javob kutib turibdi.',
      `Qisqa, iliq xabar — ${yangiKun ? '2-3' : '1-2'} jumla.`,
      p.debtCleared
        ? 'Bugungi kunda uning kechikkan to\'lovi YO\'Q — buni ham ayt.'
        : 'DIQQAT: kechikkan to\'lov hali butunlay yopilmagan, shuning uchun ' +
            '"hammasi yopildi" DEMA. Yangi sana ham SO\'RAMA — mijoz hozirgina ' +
            'to\'ladi, darhol talab qilish minnatdorchilikni yo\'qqa chiqaradi.',
    );
  } else if (full) {
    lines.push(
      `Kelishuv ${formatSom(p.promisedAmount ?? 0)} edi va u TO'LIQ bajarildi.`,
      `Samimiy rahmat ayt. Qisqa, iliq xabar — ${yangiKun ? '2-3' : '1-2'} jumla.`,
    );
    lines.push(
      p.debtCleared
        ? 'Bugungi kunda uning kechikkan to\'lovi YO\'Q — buni ham ayt.'
        : 'DIQQAT: shartnoma bo\'yicha kechikkan to\'lov hali butunlay yopilmagan, ' +
            'shuning uchun "hammasi yopildi" yoki "kechikishingiz yo\'q" DEMA. ' +
            'Faqat shu to\'lov uchun rahmat ayt.',
    );
  } else {
    // Kelishilgan sana HALI KELMAGAN bo'lsa yangi sana so'rash mantiqsiz:
    // mijoz bu savolga allaqachon javob bergan. Produksiyada shunday
    // chiqdi — 5-sentabrga 5 000 000 so'm va'da qilgan mijoz 678 000 so'm
    // avans tashladi va agent unga "4 322 000 so'm qoldi, shu qismni
    // QACHON yopasiz?" deb yozdi. Mijoz nazarida bu sana o'zi aytgan
    // kelishuvni eshitmaganday tuyuladi.
    //
    // `evaluatePromise` yangi pulni sanadan QAT'I NAZAR "rahmat" deb
    // baholaydi (erta to'laganga ham rahmat aytilishi kerak), shuning
    // uchun sanani aynan shu yerda tekshiramiz.
    const kelishilganSana = input.openPromise?.date || null;
    const bugun = zonedParts(now, config.TIMEZONE).isoDate;
    const muddatIchida = kelishilganSana !== null && bugun <= kelishilganSana;

    // Kelishuv summasi — mijozning O'Z so'zi, shuning uchun aytiladi.
    // Qoldiq esa undan ayirib chiqarilmaydi: u CRM'dan keladi.
    lines.push(
      `Kelishuv ${formatSom(p.promisedAmount ?? 0)} edi va hali to'liq yopilmadi.`,
      crmQoldiqKorsatmasi(crm),
    );

    if (crm.turi === 'yopilgan') {
      // Tizimda kechikish qolmagan: qoldiq ham, yangi sana ham so'ralmaydi —
      // pulini endigina tashlagan mijozdan mavjud bo'lmagan to'lovni
      // so'rash eng qo'pol xato bo'lardi.
      lines.push('Faqat kelgan to\'lov uchun rahmat ayt; yangi sana SO\'RAMA.');
    } else {
      lines.push(
        'Avval kelgan to\'lov uchun rahmat ayt, keyin qolgan summani ANIQ ko\'rsat. ' +
          'Ohang minnatdor bo\'lsin, ayblovchi emas — mijoz kelishuvning bir qismini bajardi.',
        muddatIchida
          ? `Kelishilgan ${formatUzDate(kelishilganSana)} sanasi hali o'tmagan. ` +
              'YANGI SANA SO\'RAMA va "qachon to\'laysiz?" deb SO\'RAMA — sanani mijoz ' +
              'o\'zi aytgan, muddati hali yetmagan, qayta so\'rash uni eshitmaganday ' +
              'ko\'rinadi. Buning o\'rniga o\'sha kelishilgan sanani eslat va qolgan ' +
              'qism ham o\'shanda yopilishini TASDIQLASHINI so\'ra.'
          : 'Qolgani uchun sana so\'ra.',
      );
    }
  }

  lines.push(
    // Bir nechta shartnomada qoldiq vazifa matnida emas, kontekst blokida
    // turadi — qoida o'sha yerga yo'naltiradi, aks holda "shu yerda
    // berilgani" degan gap raqamsiz qolardi.
    crm.turi === 'koplab'
      ? 'Summalarni AYNAN berilgandek ayt — vazifa matnidan va "MIJOZ MA\'LUMOTI" ' +
        'blokidagi shartnoma bo\'limlaridan. O\'zing hisoblab raqam chiqarma va ' +
        'shartnoma narxini tilga olma.'
      : 'Summalarni AYNAN shu yerda berilgandek ayt. Bu yerda berilmagan raqamni ' +
        'qo\'shma, qoldiqni o\'zing hisoblama, shartnoma narxini tilga olma.',
    '`promise` ni null qoldir — yangi kelishuv olinmadi.',
  );

  // Salomlashuv qoidasi alohida qatorda: yuqoridagilar oqar matn, bu esa
  // bajarilishi shart bo'lgan bitta aniq talab.
  return `${lines.join(' ')}\n${salomlashuvQoidasi(yangiKun, 'rahmat')}`;
}

/**
 * Mijoz javob bermay qo'ygan — qayta murojaat.
 *
 * Ikki holat butunlay boshqa: va'da bergan mijozga "xabarimni
 * ko'rdingizmi?" deb yozish uning so'zini ko'rmaganimizni bildiradi,
 * va'da bermaganning yuziga esa mavjud bo'lmagan va'da solinadi.
 * Shuning uchun vazifa matni bandni O'ZI tanlaydi, modelga
 * "mos kelganini ol" deb qoldirilmaydi.
 */
function nudgeTask(input: AgentTurnInput, yangiKun: boolean): string {
  const urinish = input.nudgeAttempt ?? 1;
  const band = input.brokenPromise
    ? '"VA\'DA BERIB TO\'LAMADI" bandi'
    : '"XABARNI O\'QIB JAVOB BERMADI" bandi';

  const lines = [
    '## VAZIFA — SUKUTDAN KEYIN QAYTA MUROJAAT',
    'Mijoz oxirgi xabarimizga javob bermadi. Yangi xabar kelmagan; bu murojaatni sen boshlayapsan.',
    `Bu ${urinish}-urinish.`,
  ];

  // Chegara SOZLAMADAN keladi (`silenceNudgeMax`, 1 dan 3 gacha), shuning
  // uchun "oxirgisimi" degan qarorni kuzatuvchi hisoblab beradi.
  // Qotirilgan `urinish >= 2` chegara 3 bo'lganda agentga "bundan keyin
  // yozmayman" dedirtirib, keyin yana yozdirardi — mijoz uchun bu bo'sh
  // po'pisa; chegara 1 bo'lganda esa yopuvchi jumla umuman chiqmasdi.
  if (input.nudgeLast) {
    lines.push(
      'Bu OXIRGI qayta murojaat — bundan keyin bu suhbatda o\'zing yozmaysan. '
        + 'Shuning uchun bosimni oshirma: eshikni ochiq qoldirib yakunla.',
    );
  }

  lines.push(
    '',
    'QOIDALAR:',
    salomlashuvQoidasi(yangiKun, 'eslatma'),
    `- "Kechikish kuniga qarab ssenariylar" bo'limidagi ${band} bo'yicha yoz.`,
    '- Oldingi xabaringni QAYTA YOZMA. Suhbat tarixiga qara: allaqachon aytilgan '
      + 'summa, shartnoma raqami va kechikish kuni takrorlanmaydi.',
    '- Javob bermagani uchun AYBLAMA ("javob bermadingiz", "e\'tiborsiz qoldirdingiz"). '
      + 'Mijoz band bo\'lgan bo\'lishi mumkin.',
    '- Bitta savol ber va to\'xta. Ikki savol — bosim, mijoz umuman javob bermay qo\'yadi.',
    // 2026-09-16: xulosada "chek yubormagan" qolib ketgan, orada ikki marta
    // to'lov tushgan — agent baribir ikki marta chek so'radi.
    '- Suhbat tarixida mijoz "to\'ladim" degan yoki sen chek so\'ragan bo\'lsang — CHEK SO\'RAMA. '
      + 'CRM ro\'yxatida "(SUHBAT BOSHLANGANDAN KEYIN)" to\'lov bo\'lsa, rahmat ayt va faqat qolgan '
      + 'to\'lovni ayt; qolgan to\'lov yo\'q bo\'lsa `reply` ni null qoldir.',
  );

  return lines.join('\n');
}

/**
 * Yangi oylik to'lov sanasi keldi — eslatma (2026-09-22).
 *
 * Ikki guruh butunlay boshqa ohangda: B (faqat shu oy qolgan) o'z vaqtida
 * to'lab keladigan mijoz — unga "kechikdingiz" deyish bo'sh ayblov. C da
 * esa oldingi oylar ham ochiq — jami summasiz xabar to'liq rasm bermaydi.
 * Bandni kod tanlaydi, raqamlarni ham kod beradi.
 */
function oylikEslatmaTask(input: AgentTurnInput, yangiKun: boolean): string {
  const m = input.oylikEslatma;
  if (!m || !m.tolovlar.length) {
    return '## VAZIFA — OYLIK TO\'LOV ESLATMASI\nEslatma ma\'lumoti yo\'q — `reply` ni null qoldir.';
  }

  const qator = (t: { contractNo: string; datePayment: string; qoldiq: number }): string =>
    `- ${m.bittaShartnoma || !t.contractNo ? '' : `${t.contractNo} shartnoma, `}` +
    `${formatUzDate(t.datePayment)}: ${formatSom(t.qoldiq)}`;

  const lines = [
    '## VAZIFA — OYLIK TO\'LOV ESLATMASI',
    'Mijoz yangi xabar yozmadi; bu eslatmani sen boshlayapsan. Sabab — yangi oylik to\'lov sanasi.',
  ];

  if (m.guruh === 'B') {
    lines.push(
      m.sanaOtgan
        ? 'Mijozning oldingi to\'lovlari yopilgan. Quyidagi oylik to\'lov sanasi yaqinda O\'TDI va hali to\'lanmagan:'
        : 'Mijozning oldingi to\'lovlari yopilgan. Quyidagi oylik to\'lov sanasi YAQINLASHYAPTI:',
      ...m.tolovlar.map(qator),
      m.sanaOtgan
        ? 'Ohang yumshoq: sana o\'tganini xotirjam eslat va qachon to\'lashini so\'ra. Ayblama.'
        : 'Ohang yumshoq, do\'stona eslatma: sana va summani ayt. Muddat hali kelmagan — kechikish haqida GAPIRMA, bosim qilma.',
    );
  } else {
    lines.push(
      'Mijozda oldingi oylardan to\'lanmagan to\'lov bor, ustiga yangi oy to\'lovi qo\'shildi.',
      'Yangi oy to\'lovi:',
      ...m.tolovlar.map(qator),
      'Oldingi to\'lovlardan qolgan:',
      ...m.kechikkanlar.map(qator),
      `JAMI: ${formatSom(m.jami)}.`,
      'Yangi oy qo\'shilib jami to\'lov oshganini aniq ayt va qachon to\'lashini so\'ra.',
    );
  }

  lines.push(
    '',
    'QOIDALAR:',
    salomlashuvQoidasi(yangiKun, 'eslatma'),
    '- Summa va sanalarni AYNAN shu yerda berilgandek ayt. O\'zing qo\'shib-ayirib yangi raqam chiqarma.',
    '- "qarz" so\'zini ISHLATMA — faqat "to\'lov".', // lugat-ruxsat: taqiqni nomlash uchun so'zning o'zi kerak
    m.bittaShartnoma
      ? '- Mijozda bitta shartnoma — shartnoma raqamini AYTMA.'
      : '- Bir nechta shartnoma — har summani qaysi shartnomaga tegishli ekanini ayt.',
    '- Bu yangi oy haqidagi alohida eslatma: suhbat tarixidagi eski gaplarni qayta yozma.',
    '- Bitta savol ber va to\'xta.',
  );

  return lines.join('\n');
}

/**
 * Operator topshirig'i bo'yicha xabar (2026-09-15).
 *
 * Operator NIMA haqida gaplashishni yozadi, xabarni agent tuzadi. Real
 * holat: va'da buzilgan, mijoz jim — operator salomni qo'lda yozdi, agent
 * esa davom ettira olmadi.
 *
 * Asosiy xavf — topshiriqni buyruq deb, qoidalardan ustun qo'yish:
 * operator shoshilib yozgan jumla ("bugunoq to'lasin") mijozga so'zma-so'z
 * ketmasligi kerak. Shuning uchun topshiriq — MAVZU, qoidalar — uslub va
 * chegara.
 */
function operatorTask(input: AgentTurnInput, yangiKun: boolean): string {
  const topshiriq = input.operatorInstruction?.trim() || '(topshiriq bo\'sh)';

  return [
    '## VAZIFA — OPERATOR TOPSHIRIG\'I',
    'Mijoz yangi xabar yozmadi; bu xabarni sen boshlayapsan. Hamkasbing (operator) nima haqida gaplashishni yozdi:',
    `"${topshiriq}"`,
    '',
    'QOIDALAR:',
    salomlashuvQoidasi(yangiKun, 'topshiriq mavzusi'),
    '- Topshiriq NIMA haqida yozishni aytadi. QANDAY yozish — sening qoidalaringdan: taqiqlar, '
      + 'uslub va shartnoma faktlari topshiriqdan USTUN. Topshiriqda taqiqlangan so\'z yoki '
      + 'vakolatingda bo\'lmagan va\'da bo\'lsa — qoidaga amal qil.',
    '- Topshiriq matnini mijozga so\'zma-so\'z ko\'chirma. "operator aytdi", "rahbariyat topshirdi" '
      + 'DEMA — o\'z nomingdan, tabiiy yoz.',
    '- Suhbat tarixiga qara: allaqachon aytilgan summa, shartnoma raqami va kechikish kuni takrorlanmaydi.',
    '- Bitta savol ber va to\'xta.',
    '- Topshiriq tushunarsiz yoki qoidalar bilan bajarib bo\'lmaydigan bo\'lsa — `reply` ni null '
      + 'qoldir va `escalate` ga sababini yoz.',
    // Operator chek ochiq paytda yozdirsa ham agent chekni o'zi
    // tasdiqlamaydi va muddat va'da qilmaydi. Chekka hali javob berilmagan
    // bo'lsa (`'new'`) boshqa qoida: "allaqachon aytgansan" yolg'on bo'lardi.
    ...(input.receiptReview === 'acknowledged' ? [RECEIPT_REVIEW_ACK_RULE] : []),
    ...(input.receiptReview === 'new' ? [RECEIPT_REVIEW_OPERATOR_RULE] : []),
  ].join('\n');
}

/**
 * Operator "To'lov qabul qilindi" tugmasini bosdi — rahmat.
 *
 * SUMMA AYTILMAYDI: operator pul kelganini tasdiqladi, summani emas.
 * Qoldiq faqat kod ruxsat bersa aytiladi (`mentionRemaining`): bank
 * to'lovi CRM'ga hali tushmagan bo'lsa, tizimdagi qoldiq eski va uni
 * aytish endigina to'lagan mijozni ayblash bo'lardi.
 */
function receiptConfirmedTask(input: AgentTurnInput, yangiKun: boolean): string {
  const r = input.receiptConfirmed;
  if (!r) return '## VAZIFA\nChek tasdig\'i ma\'lumoti yo\'q — `reply` ni null qoldir.';

  const crm = crmKechikkanTolovi(input.context);
  const lines = [
    '## VAZIFA — CHEK TASDIQLANDI',
    'Mijoz to\'lov chekini yuborgan edi. Hamkasbing uni tekshirdi va to\'lov QABUL QILINGANINI tasdiqladi.',
    'Mijoz yangi xabar yozmadi; bu xabarni sen boshlayapsan.',
    '',
    'QOIDALAR:',
    salomlashuvQoidasi(yangiKun, 'rahmat'),
    '- Birinchi jumla shu mazmunda: "To\'lovingiz qabul qilindi, rahmat!"',
    '- To\'lov SUMMASINI AYTMA — hamkasbing pul kelganini tasdiqladi, summani emas.',
  ];

  if (r.debtCleared) {
    lines.push('- Bugungi kunda mijozning kechikkan to\'lovi YO\'Q — buni ham ayt.');
  } else if (r.mentionRemaining && crm.turi !== 'yopilgan') {
    lines.push(
      '- Keyin qolgan kechikkan to\'lovni YUMSHOQ eslat, talab ohangisiz. ' + crmQoldiqKorsatmasi(crm),
      '- Yangi sana SO\'RAMA va "qachon to\'laysiz?" DEMA — mijoz hozirgina to\'ladi.',
    );
  } else {
    lines.push(
      '- Qolgan kechikkan to\'lov haqida HECH NARSA DEMA: to\'lov tizimga hali tushmagan bo\'lishi ' +
        'mumkin va raqam eskirgan.',
    );
  }

  lines.push(
    `- BITTA xabar, ${yangiKun ? '2-3' : '1-2'} jumla. \`replySecond\` null bo'lsin.`,
    '- `promise` ni null qoldir, `paymentClaim` = false, `escalate` = null.',
  );
  return lines.join('\n');
}
