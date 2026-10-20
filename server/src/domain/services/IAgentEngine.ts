import type { Interlocutor } from '@/domain/entities/AgentMemory';
import type { ConversationState, EscalationStage } from '@/domain/entities/Conversation';
import type { OylikEslatmaMalumoti } from '@/domain/services/oylikEslatma';

/**
 * BITTA shartnoma bo'yicha barcha faktlar.
 *
 * NEGA HAMMASI SHU YERDA: mijoz to'lovni shartnomasi bo'yicha biladi —
 * o'z uyi, o'z oylik to'lovi, o'z grafigi bilan. "Mijoz bo'yicha jami"
 * degan tushuncha unda yo'q. Ilgari bu faktlar kontekstning yuqori
 * qavatida, faqat BIRINCHI shartnomadan olingan holda turardi: ikki
 * shartnomali mijoz ikkinchisi haqida so'rasa, agent birinchisining
 * uyini va grafigini aytib yuborardi.
 */
export interface AgentContractFacts {
  readonly contractNo: string;
  readonly objectName: string | null;
  /** Uy — mijoz shartnomasini aynan shu bilan taniydi. */
  readonly apartment: {
    readonly number: string | null;
    readonly floor: number | null;
    readonly rooms: number | null;
    readonly entrance: string | null;
    readonly block: string | null;
    readonly area: number | null;
  } | null;
  /**
   * Shartnoma summasi (`transaction_price`) ATAYLAB berilmaydi.
   *
   * Agent ko'rgan har bir raqamni mijozga aytib yuborishi mumkin, bu
   * raqam esa suhbat mavzusiga aloqasiz: gap KECHIKKAN to'lov haqida.
   * "Shartnomangiz 833 mln" degan jumla mijozni qo'rqitadi va uni
   * asosiy savoldan chalg'itadi.
   */
  readonly monthlyPayment: number | null;
  /**
   * BOSHLANG'ICH TO'LOVDAGI KECHIKISH — eksportdagi `Долг (1 взнос)`.
   *
   * Mijoz shartnoma tuzganda kelishilgan boshlang'ich summani to'liq
   * to'lamagan bo'lsa shu yerda qoladi. Nol bo'lsa suhbatda umuman
   * tilga olinmaydi.
   */
  readonly debtFirst: number;
  /** OYMA-OY TO'LOVLARDAGI KECHIKISH — eksportdagi `Долг (мес.)`. */
  readonly debtMonthly: number;
  /**
   * HISOBLAGICHLAR UCHUN TO'LOVDAGI KECHIKISH. Oylik to'lovdan alohida
   * aytiladi va jamiga qo'shilmaydi. Nol bo'lsa tilga olinmaydi.
   */
  readonly debtMeter: number;
  /**
   * CRM'dagi shartnoma holati — FAQAT odatdagidan ("Сотилди") farq qilsa:
   * "Проц. отказ" yoki "К оплате". `null` — odatdagi holat, qator chiqmaydi.
   * Ichki ma'lumot: agent nomini mijozga aytmaydi (qoida "SHARTNOMA HOLATI").
   */
  readonly statusLabel: string | null;
  readonly daysOverdue: number;
  /** To'lanmagan oylik to'lovlar soni — grafikdan sanalgan, aniq. */
  readonly missedMonths: number;
  /**
   * Qaysi oylar to'lanmagan — eng eskisi birinchi.
   * Mijoz "qaysi oy uchun?" deb so'raganda agent aniq javob beradi.
   */
  readonly unpaidMonths: ReadonlyArray<{ dateIso: string; amount: number; paid: number }>;
  /**
   * Oxirgi kelib tushgan to'lovlar — eng yangisi birinchi.
   * Mijoz "men to'ladim-ku" desa, agent tekshirib javob beradi.
   */
  readonly recentPayments: ReadonlyArray<{ dateIso: string; amount: number }>;
  readonly nextPaymentDate: string | null;
  readonly contractDate: string | null;
  /**
   * Xonadonni bitish muddati, `YYYY-MM-DD`. Promptga XOM HOLDA TUSHMAYDI:
   * `shartnomaFaktlari` uni chorakka o'giradi, o'tgan sanani esa umuman
   * chizmaydi.
   */
  readonly completionDate: string | null;
  readonly paidTotal: number | null;
  readonly warningCount: number;
}

/** Agentga beriladigan to'liq kontekst — u hech qanday raqamni o'zi o'ylab topmaydi. */
export interface AgentDebtContext {
  readonly clientName: string;
  /**
   * CRM bergan aniq ism — murojaat shakli ("Aziz aka") shundan tuziladi.
   * NULL bo'lsa ism to'liq ism-sharifdan taxmin qilinadi.
   */
  readonly clientFirstName: string | null;
  /**
   * Telegramda shartnoma egasining o'rniga yozayotgan odam (o'g'li va h.k.).
   * Berilgan bo'lsa murojaat shakli SHU odam bo'yicha tuziladi.
   */
  readonly interlocutor?: Interlocutor | null;
  /**
   * Shu suhbat boshlangan payt — birinchi xabarimiz. Undan keyin tushgan
   * to'lov promptda belgilanadi: mijoz "to'ladim" desa aynan shu to'lovni
   * nazarda tutadi. Ilgari belgisiz ro'yxatda agent 14-avgustdagi
   * xabarimizdan keyin 17-avgustda tushgan 6 000 000 so'mni "eski" deb
   * o'yladi va to'lagan mijozdan uch marta chek so'radi.
   */
  readonly contactStartedAt?: Date | null;
  /**
   * Mijozning BARCHA shartnomalari, birinchisi asosiy.
   *
   * Bo'sh bo'lishi mumkin: hamma shartnomasi bekor qilingan mijoz bilan
   * ham suhbat ochiq qolishi mumkin.
   */
  readonly contracts: ReadonlyArray<AgentContractFacts>;
  /**
   * BARCHA shartnoma bo'yicha boshlang'ich to'lovdagi kechikish yig'indisi.
   *
   * Bir nechta shartnomali mijozga bu raqam AYTILMAYDI — u faqat jamini
   * ko'rsatish uchun. Mijozga aytiladigan raqamlar `contracts` da.
   */
  readonly debtFirst: number;
  /** BARCHA shartnoma bo'yicha oyma-oy to'lovlardagi kechikish yig'indisi. */
  readonly debtMonthly: number;
  /**
   * JAMI kechikkan to'lov — `debtFirst + debtMonthly`.
   *
   * Eksportdagi `Долг (Общ)` (`debt_total`) ATAYLAB ishlatilmaydi: agent
   * ikkita tashkil etuvchini alohida aytadi va jami o'shalarning yig'indisi
   * bo'lishi SHART. Aks holda mijoz qo'shib ko'rib, raqamlar to'g'ri
   * kelmasligini ko'radi va butun hisob-kitobga ishonchi qolmaydi.
   */
  readonly debtSum: number;
  /** Eng ko'p kechikkan shartnomaning kechikish kuni — eskalatsiya bosqichi shunga qarab. */
  readonly daysOverdue: number;
  /**
   * Ovozli agentning oxirgi qo'ng'iroqlari (3 ta, 30 kun ichida), eng yangisi
   * birinchi. Ixtiyoriy: berilmasa yoki bo'sh bo'lsa blok chizilmaydi.
   */
  readonly phoneCalls?: ReadonlyArray<AgentPhoneCall>;
  /**
   * Mijozga YUBORILGAN elektron talabnomalar. Mijoz "bu qanaqa xat?" yoki
   * "qachongacha to'lashim kerak?" desa agent sanalarni shundan oladi —
   * ish kunini o'zi sanamaydi (bayramlarni bilmaydi). Ixtiyoriy: bo'sh
   * bo'lsa qator chizilmaydi.
   */
  readonly talabnomalar?: ReadonlyArray<AgentTalabnoma>;
}

/** Agent kontekstidagi talabnoma fakti. Sanalar YYYY-MM-DD. */
export interface AgentTalabnoma {
  /** `ET-01` */
  readonly raqam: string;
  readonly yuborilganIso: string;
  /** Talabnomadagi summa — agent o'zi qayta hisoblamaydi. */
  readonly summa: number;
  readonly kuchgaKirishIso: string;
  readonly muddatIso: string;
  readonly contractNo: string;
}

export interface AgentPhoneCall {
  readonly startedAt: Date;
  readonly agentName: string;
  readonly outcome: string;
  readonly summary: string | null;
  /** YYYY-MM-DD */
  readonly promiseDate: string | null;
  readonly promiseAmount: number | null;
}

/**
 * Agentning "miyasi" — bazadan yig'ilgan holda uzatiladi.
 * Engine bazani bilmaydi, faqat tayyor matnni oladi.
 */
export interface AgentKnowledgeBlocks {
  /** Qoidalar bo'limlari (uslub, taqiqlar, faktlar, misollar). */
  readonly rules: string;
  /** Tasdiqlangan saboqlar. */
  readonly lessons: string;
  /** Shu mijoz haqida eslab qolinganlar. */
  readonly clientMemory: string;
  readonly personaName: string;
}

export interface AgentTurnInput {
  readonly conversationId: string;
  readonly clientId: string;
  readonly contractId: string | null;
  readonly stage: EscalationStage;
  /** Suhbatning hozirgi holati — agent ohangini shunga qarab tanlaydi. */
  readonly conversationState: ConversationState;
  readonly knowledge: AgentKnowledgeBlocks;
  readonly context: AgentDebtContext;
  /**
   * Suhbat tarixi (eskidan yangiga).
   *
   * `holat` — operator xabarga tekkanini bildiradi. Bu ICHKI qayd:
   * mijoz uni ko'rmaydi va agent bu haqda mijozga yozmasligi kerak
   * (`prohibitions` bo'limidagi qoida shuni aytadi).
   */
  readonly history: Array<{
    /** `operator` — operatorning agentga topshirig'i. Mijoz uni ko'rmagan. */
    role: 'client' | 'agent' | 'operator';
    text: string;
    at: Date;
    holat?: 'tuzatilgan' | 'ochirilgan';
  }>;
  /** Yangi kiruvchi xabar. Birinchi murojaatda null. */
  readonly incoming: string | null;
  /** Oldingi Claude sessiyasini davom ettirish uchun. */
  readonly sessionId: string | null;
  /**
   * Model chaqiruvini yarim yo'lda uzish uchun.
   *
   * NEGA KERAK: javob yozilishi soniyalar oladi va shu payt operator
   * "To'xtatish"ni bosishi mumkin. Signalsiz chaqiruv oxirigacha borardi
   * va tayyor xabar baribir mijozga ketardi — ya'ni to'xtatish bir mijozga
   * kechikardi. Signal kelganda engine `AbortedError` tashlaydi va hech
   * qanday matn qaytmaydi: yarim yozilgan javob HECH QACHON yuborilmaydi.
   */
  readonly signal?: AbortSignal;
  /** Oldin berilgan va bajarilmagan va'da (bo'lsa). */
  readonly brokenPromise: { amount: number; date: string } | null;
  /**
   * Bugun bayram bo'lsa — uning ma'lumoti. Agent "bugun to'lang"
   * demasligi uchun kerak: bank yopiq va mijoz bajara olmaydi.
   */
  readonly bayram: { name: string; endsOn: string; keyingiIshKuni: string } | null;
  /**
   * Sukutdan keyingi qayta murojaatning nechanchisi (1 dan 3 gacha).
   * Boshqa rejimlarda `null` — bu maydon faqat `'nudge'` da ma'noli.
   */
  readonly nudgeAttempt: number | null;
  /**
   * Shu urinish OXIRGISIMI.
   *
   * ALOHIDA MAYDON, chunki chegara SOZLAMADAN keladi (`silenceNudgeMax`,
   * 1 dan 3 gacha) va promptda uni hisoblab bo'lmaydi: `nudgeAttempt`
   * bilan solishtiradigan raqam u yerda yo'q. Qotirilgan "2-urinish
   * oxirgisi" qoidasi chegara 3 bo'lganda agentga "bundan keyin
   * yozmayman" dedirtirib, keyin yana yozdirardi; chegara 1 bo'lganda
   * esa yopuvchi jumla umuman chiqmasdi.
   */
  readonly nudgeLast: boolean | null;
  /**
   * Operator yozgan topshiriq — faqat `'operator'` rejimida to'ldiriladi.
   *
   * Ixtiyoriy: qolgan rejimlarda ma'nosi yo'q, solishtiruv stendi esa
   * bu rejimni umuman chaqirmaydi. Keyingi javoblarda topshiriq shu
   * maydondan emas, tarixdagi `operator` qatoridan ko'rinadi.
   */
  readonly operatorInstruction?: string | null;
  /**
   * Oylik to'lov eslatmasining tayyor faktlari — faqat `'oylik_eslatma'`
   * rejimida. Guruh, summa va sanalar KODDA hisoblangan (`oylikEslatma.ts`).
   */
  readonly oylikEslatma?: OylikEslatmaMalumoti | null;
  /**
   * Suhbatning HALI KUCHDAGI kelishuvi — buzilgani `brokenPromise` da.
   * Ikkalasi bir vaqtda to'lmaydi (`vadaKorinishi`).
   *
   * Uchala vazifada ham to'ldiriladi va har biri boshqacha o'qiydi:
   * eslatma — "bugun o'sha kun", rahmat — "solishtiradigan kelishuv",
   * javob — "mijoz sanani ALLAQACHON aytgan, qayta so'ralmaydi".
   * Oxirgisi eng muhimi: ilgari bu maydon javob vazifasida bo'sh
   * qolardi va model kelishuvni faqat suhbat tarixidan bilardi. Tarix
   * esa cheklangan — uzun suhbatda kelishuv undan chiqib ketardi va
   * agent mijoz javob bergan savolni qaytadan berardi.
   *
   * `amount` — kelishuvning TO'LIQ summasi, `paid` — shu va'da hisobiga
   * allaqachon kelgan qism. Mijozga aytiladigan raqam ikkalasining
   * FARQI: qisman to'laganga butun summani aytish uning to'lagan pulini
   * ko'rmaganimiz bo'lib chiqadi.
   */
  readonly openPromise: { amount: number; date: string; paid: number } | null;
  /**
   * Kelib tushgan to'lov — faqat RAHMAT vazifasida to'ldiriladi.
   *
   * `debtCleared` KOD tomonidan hisoblanadi (shartnomaning kechikkan
   * qismi nolga tushdimi). Agentga bu qaror qoldirilmaydi: "kechikkan
   * to'lovingiz yo'q" deb noto'g'ri aytish eng yomon xato bo'lardi.
   */
  /**
   * Mijoz "to'ladim" dedi va CRM kuzatuvi (`crm_watch`) ochiq — natija
   * hali yo'q. Chek tekshiruvi bu maydonga TUSHMAYDI (`receiptReview`).
   *
   * Agent bu holatda "to'lovingiz tushdi" deb ayta olmaydi va qayta pul
   * ham talab qila olmaydi — ikkalasi ham mijozni jahli chiqaradi.
   */
  readonly receiptPending: boolean;
  /**
   * Ochiq `tolov` chek tekshiruvi (operator tasdig'ini kutyapti).
   *
   * `'new'` — agent hali javob bermagan: bir marta "Chekni oldim…".
   * `'acknowledged'` — javob berilgan: takrorlanmaydi. Ixtiyoriy — faqat
   * javob va operator topshirig'i rejimlarida to'ldiriladi.
   */
  readonly receiptReview?: 'new' | 'acknowledged' | null;
  /**
   * Operator "To'lov qabul qilindi" tugmasini bosdi — faqat
   * `'receipt_confirmed'` rejimida. Ikkala qaror ham KODDA qabul qilinadi.
   */
  readonly receiptConfirmed?: {
    /** Kechikkan to'lov butunlay yopildimi (CRM, `kechikishYopildi`). */
    readonly debtCleared: boolean;
    /**
     * CRM qoldig'ini aytish mumkinmi: chek oynasida kamida bitta to'lov
     * CRM'da ko'rindi. Aks holda bank to'lovi hali tushmagan va qoldiq eski.
     */
    readonly mentionRemaining: boolean;
  } | null;
  readonly paymentReceived: {
    /** Shu safar kelgan yangi pul — rahmat aynan shu summa uchun. */
    readonly newMoney: number;
    /** Va'dadan keyin kelgan jami. */
    readonly totalPaid: number;
    /**
     * Va'da qilingan summa. NULL — mijoz va'da bermasdan to'lagan
     * (kvitansiya yuborib, to'lovi tasdiqlangan): solishtiradigan
     * kelishuv yo'q, shuning uchun rahmat ham boshqacha yoziladi.
     */
    readonly promisedAmount: number | null;
    /** Kelishuvdan qancha qolgani. 0 — to'liq to'langan, NULL — va'da yo'q. */
    readonly remaining: number | null;
    /** Shartnoma bo'yicha kechikkan to'lov butunlay yopildimi. */
    readonly debtCleared: boolean;
  } | null;
}

export interface AgentPromiseCapture {
  readonly amount: number;
  readonly promisedDate: string; // YYYY-MM-DD
  readonly quote: string | null;
}

/** Agent shu suhbatdan olgan umumiy xulosa (bo'lsa). */
export interface AgentLessonCapture {
  readonly lesson: string;
  readonly evidence: string | null;
}

/** Agent shu mijoz haqida eslab qolmoqchi bo'lgan narsa. */
export interface AgentClientMemoryCapture {
  readonly clientType: string | null;
  readonly summary: string | null;
  readonly whatWorks: string | null;
}

export interface AgentTurnOutput {
  /** Mijozga yuboriladigan matn. Bo'sh bo'lsa — yuborishga hojat yo'q. */
  readonly reply: string | null;
  /**
   * Ikkinchi xabar. Bitta uzun xabar o'rniga ikkiga bo'lish talab qilinadi
   * (xabar 2-3 qatordan oshmasligi kerak).
   */
  readonly replySecond: string | null;
  readonly sessionId: string | null;
  readonly promise: AgentPromiseCapture | null;
  readonly nextState: string | null;
  readonly escalate: { reason: string } | null;
  readonly internalNote: string | null;
  readonly lesson: AgentLessonCapture | null;
  readonly clientMemory: AgentClientMemoryCapture | null;
  /**
   * Suhbatdosh o'zini shartnoma egasidan BOSHQA odam deb tanishtirgan bo'lsa.
   * Ixtiyoriy — sinov dublyorlari uni ko'rsatmasa ham bo'ladi.
   */
  readonly interlocutor?: Interlocutor | null;
  /**
   * Mijoz to'laganini aytdi, lekin to'lov CRM'da hali ko'rinmadi — tizim
   * CRM'ni kuzatishni ochadi (`PaymentCheckService`). Chek so'ralmaydi.
   */
  readonly paymentClaim?: boolean;
  /**
   * Shu chaqiruvning hisobi — narx kuzatuvi uchun.
   *
   * Ixtiyoriy: model natijani bersa ham, hisob xabari kelmasligi mumkin.
   * Kesh tokenlari alohida yuriladi — ular oddiy kiruvchi tokendan
   * boshqacha narxlanadi va provayderlarni solishtirishda ayni shu farq
   * hal qiluvchi bo'ladi.
   */
  readonly usage?: {
    readonly model: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheWriteTokens: number;
    readonly costUsd: number;
    readonly durationMs: number;
  };
}

export interface IAgentEngine {
  /** Birinchi murojaat matnini tayyorlaydi. */
  composeFirstContact(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  /** Mijozning javobiga reaksiya. */
  respond(input: AgentTurnInput): Promise<AgentTurnOutput>;
  /**
   * Kelishilgan kunning ertalabidagi yumshoq eslatma.
   * Mijozdan yangi xabar kelmaydi — bu tizim tashabbusi bilan yoziladi.
   */
  composePromiseReminder(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  /**
   * Kelib tushgan to'lov uchun rahmat. Mijozdan yangi xabar kelmaydi —
   * bu tizim tashabbusi bilan yoziladi.
   */
  composePaymentThanks(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  /**
   * Mijoz javob bermay qo'yganda tizim tashabbusi bilan yoziladigan
   * qayta murojaat. Mijozdan yangi xabar kelmaydi.
   */
  composeSilenceNudge(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  /**
   * Operator topshirig'i bo'yicha xabar. Mijozdan yangi xabar kelmaydi —
   * operator mavzuni yozgan, suhbatni agent o'zi boshlaydi.
   */
  composeOperatorTurn(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  /**
   * Operator mijozning chekini tasdiqladi — rahmat xabari. Mijozdan yangi
   * xabar kelmaydi.
   */
  composeReceiptConfirmed(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  /**
   * Yangi oylik to'lov sanasi kelganda eslatma. Mijozdan yangi xabar
   * kelmaydi — tizim tashabbusi.
   */
  composeMonthlyReminder(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
}
