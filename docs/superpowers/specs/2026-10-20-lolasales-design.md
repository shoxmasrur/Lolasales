# LolaSales — kurs sotuvchi AI agent (dizayn)

Sana: 2026-10-20 · Asos: `/Users/ulugbektuxtayev/AI/DebitorAgent02`

## 1. Maqsad va sabab

Biz onlayn kurs sotamiz. Mijozlar uch yo'l bilan keladi va hozir ularning hammasi bilan qo'lda
gaplashiladi:

1. **Reklamadan** kelib, Telegramda o'zi yozadi.
2. **Telegram guruhda** "menga xabar bering" deb izoh qoldiradi. Biz unga shaxsiy xabarda yozib,
   kurs haqida ma'lumot beramiz.
3. **Telefon raqami** bor. Telegram orqali biz birinchi bo'lib yozamiz.

LolaSales — DebitorAgent02 ning sotuvga moslangan nusxasi. U Telegram shaxsiy akkauntlaridan
(MTProto userbot) mijozlar bilan sotuvchi sifatida gaplashadi va sotuvdagi kurs haqida
gapirib beradi. Savollarga javob beradi va e'tirozlar bilan ishlaydi. Mijoz rozi bo'lsa, karta
raqamini yuboradi va chekni menejerga tekshirtiradi. To'lov tasdiqlangach, yopiq guruh
havolasini beradi.

DebitorAgent02 da kerakli infratuzilma allaqachon bor. U pishgan va sinovdan o'tgan: Telegram
akkauntlarni ulash, proksilar, yuborish limitlari va spam himoyasi, suhbatlar oynasi, agent
prompti, qoidalar va saboqlar, chek tekshiruvi, loglar, foydalanuvchilar va sozlamalar. Uni
noldan yozish behuda. Qarzga oid qismini olib tashlab, o'rniga sotuv qismini yozamiz.

**Muvaffaqiyat:** sotuvchi ertalab dashboardni ochadi. Kechadan beri reklamadan yozganlarga
agent javob bergan, guruhdan olingan va raqam bo'yicha olingan mijozlarga birinchi xabar
ketgan. "Chek keldi" navbatida menejer tasdiqlashi kerak bo'lgan cheklar turibdi. Tasdiqlangan
mijozlar guruh havolasini olgan. Har bir mijoz qaysi bosqichda ekani bir qarashda ko'rinadi.

## 2. Maqsadlar

- Agent sotuvchi bo'lib gaplashadi: salomlashadi, ehtiyojni aniqlaydi va sotuvdagi kursni
  tanishtiradi. Narx, muddat va mavzu haqidagi savollarga kursning o'z ma'lumotlar bazasidan
  javob beradi, e'tirozlar bilan ishlaydi va sotuvni yopadi.
- Kurslar sotuv davriga bog'liq: masalan, 1–30 noyabr bir kurs, 1–31 dekabr boshqa kurs.
  Har bir kursning mavzulari, narxi, davomiyligi, ma'lumotlar bazasi va yopiq guruh havolasi
  alohida.
- Mijozning uchta manbai ishlaydi: reklamadan kelgan, kanal kommentidan olingan va raqam
  bo'yicha olingan.
- To'liq to'lash ham, kursda ruxsat berilgan bo'lsa bo'lib to'lash ham ishlaydi.
- To'lov: karta raqami Sozlamalardan olinadi. Chekni menejer tasdiqlaydi, keyin mijoz
  guruh havolasini oladi.
- Xarid bosqichlari (voronka): **Yangi → Suhbatda → Qiziqdi → Karta yuborildi → Chek keldi →
  (Qisman to'ladi →) To'ladi**, alohida bosqich sifatida **Rad etdi** (6.3-bo'lim).
- DebitorAgent02 dagi umumiy imkoniyatlar to'liq saqlanadi:
  - Agent: prompt, qoidalar va saboqlar.
  - Telegram akkauntlar: ulash (kod, 2FA, QR), har bir akkaunt uchun SOCKS5 proksi, kunlik
    yuborish va qidiruv limitlari, yuborish oynasi va tezligi, spam va FloodWait himoyasi.
  - Telegram qutisi.
  - Mijozlar, Suhbatlar, Loglar, Foydalanuvchilar va rollar, Sozlamalar.

## 3. Maqsad emas (hozircha qilinmaydi)

- **Chekni avtomatik tekshirish.** Hozircha uni menejer tasdiqlaydi, avtomatlashtirish keyin
  bo'ladi. Arxitektura bunga yo'l ochiq qoldiradi: chek oqimi `payment_checks` orqali o'tadi.
- **Yopiq guruhga qo'shilish so'rovini avtomatik qabul qilish.** Uni menejer Telegramda o'zi
  qabul qiladi.
- **Guruh izohlarini avtomatik kuzatish.** 1-bosqichda sotuvchi tugma bosib ko'rib chiqadi
  (6.4-bo'lim). Avtomatik kuzatuv keyin bo'ladi.
- Onlayn to'lov tizimlari (Payme, Click). Faqat kartaga o'tkazma.
- Chegirma va promo-narxlar.
- Bo'lib to'lashda keyingi qism vaqti kelganini avtomatik eslatish.
- Qarzga oid hamma narsa: shartnomalar, CRM sinxroni, va'dalar, talabnoma, oylik eslatma,
  rekvizitlar, obyekt cheklovi va hokazo (8-bo'lim).
- Telefon qo'ng'iroqlari agenti va MCP serverlari (`mcp/`, `qongiroqMcp`). Ular keyin kerak
  bo'lsa qo'shiladi.

## 4. Anti-maqsadlar (texnik jihatdan ishlasa ham muvaffaqiyatsizlik)

- Agent **narx, sana, karta raqami yoki havolani o'zidan to'qib chiqarsa**. Ular faqat
  bazadan olinadi. Karta raqami va guruh havolasini LLM yozmaydi: tizim ularni matnga o'zi
  qo'shadi (6.5-bo'lim).
- Agent menejer tasdiqlamasdan **"to'lovingiz qabul qilindi"** desa yoki havolani bersa.
- Agent **guruhda ochiq yozsa**. U faqat shaxsiy xabar yozadi.
- Akkaunt spamga tushib, bloklanib qolsa. Yuborish limitlari va pauzalar sotuv shoshilinchligi
  uchun yumshatilmaydi.
- Mijozga tirik odam emasligi sezilib qolsa. Agent DebitorAgent02 dagidek tirik menejer
  uslubida yozadi.
- Bir mijozga bir xil matnni qayta-qayta yuborsa, yoki javob bermagan mijozni bezovta
  qilaversa.

## 5. Cheklovlar va asosiy texnik qarorlar

- **Stack DebitorAgent02 niki bilan bir xil.**
  - Node 22, TypeScript monorepo (`server/`, `web/`), PostgreSQL, React + Vite + Tailwind.
  - Telegram uchun `teleproto` (GramJS).
  - Agent uchun Claude Agent SDK, akkaunt bo'yicha ixtiyoriy OpenAI.
  - Arxitektura qatlamli: domain → application → infrastructure → presentation.
  - Testlar `*.spec.ts` tsx skriptlari va `test:*` npm skriptlari ko'rinishida.
  - Migratsiyalar `server/migrations/*.sql`, bitta migrator.
- **Nusxa olish usuli (mening qarorim).**
  - DebitorAgent02 ning joriy kodi `LolaSales` papkasiga git tarixisiz ko'chiriladi va yangi
    git repo ochiladi.
  - Baza alohida (`lolasales`), `.env`, `ENCRYPTION_KEY` va Telegram akkauntlar ham alohida.
  - Ikki loyiha keyin mustaqil rivojlanadi. Ular o'rtasida sinxronizatsiya yo'q.
- **Migratsiyalar (mening qarorim).** Debitorning 134 ta migratsiyasi ichida qarz qoidalari
  ko'p. Shu sababli yangi loyihada ular **bitta toza `001_init.sql`** ga yig'iladi: unga
  faqat saqlanadigan jadvallar kiradi, qarz jadvallari va qarz qoidalari qatorlari kirmaydi.
  Sotuv qismi `002_*` dan boshlanadi.
- Yangi loyihada nomlash Debitordagidek: o'zbekcha va inglizcha aralash. Yangi kod atrofidagi
  kod uslubida yoziladi.
- Interfeys tili o'zbekcha.

## 6. Qanday ishlaydi (kelishilgan qismlar)

### 6.1. Kurslar (yangi bo'lim: "Kurslar")

`courses` jadvali:
- nomi, qisqa tavsifi;
- `sales_start` va `sales_end` (sotuv davri);
- narxi (so'm);
- davomiyligi (matn, masalan "4 hafta, haftasiga 3 dars");
- mavzulari (ro'yxat);
- boshlanish sanasi;
- yopiq guruh havolasi;
- faol yoki faol emasligi;
- **bo'lib to'lash** (foydalanuvchi aytgan: bo'lib to'lash bor):
  - ruxsat etilgan yoki yo'qligi;
  - nechta qismga bo'linishi;
  - birinchi qismning eng kam summasi;
  - havola qachon berilishi: `birinchi_qism` yoki `toliq`. Standart — `birinchi_qism`,
    bu mening qarorim. Har bir kurs uchun sozlanadi, shuning uchun qarorni keyin
    o'zgartirish oson.

Agent bo'lib to'lashni faqat kursda ruxsat etilgan bo'lsa va faqat yozilgan shartlar bilan
taklif qiladi. Narxni ham, shartlarni ham o'zidan o'ylab topmaydi. Chegirma yo'q.

`course_knowledge` jadvali — kursning ma'lumotlar bazasi. Har bir yozuvda `course_id`, turi
(`dastur` | `savol_javob` | `etiroz` | `boshqa`), sarlavha va matn bor. Sahifada kurs ochiladi
va uning bazasi yozuvlar sifatida tahrir qilinadi. Yozuvlar Agent sahifasidagi qoidalar kabi
qo'shiladi, tahrir qilinadi va o'chiriladi.

**Sotuvdagi kurs** — bugungi sana (Toshkent vaqti) uning `sales_start..sales_end` oralig'iga
tushadigan va faol kurs.
- Agentga faqat sotuvdagi kurs(lar) va ularning bazasi beriladi.
- Bir vaqtda ikki kurs sotuvda bo'lsa, agent ikkalasini taklif qiladi va mosini tanlashga
  yordam beradi.
- Sotuvda bitta ham kurs bo'lmasa, agent yangi sotuvga undamaydi. U keyingi kurs (eng yaqin
  `sales_start`) haqida aytib, mijozni "qiziqdi" holatida qoldiradi. Keyingi kurs ham bo'lmasa,
  "tez orada xabar beramiz" deydi. Bu mening qarorim.

Mijozning qaysi kursga qiziqqani uning **xaridida** saqlanadi (6.3-bo'lim).
- Mijoz noyabrda yozib, dekabrda qaytsa va uning kursi sotuvdan chiqqan bo'lsa, agent hozir
  sotuvdagi kursni taklif qiladi.
- Noyabr kursini sotib olgan mijozga dekabrda yangi kursni taklif qilish mumkin. Bunda yangi
  xarid ochiladi.

Bu ikkala holat ham mening qarorim.

Sotuvda kurs bo'lmagan paytda "Qiziqdi" bo'lib turgan mijozlarga yangi kurs ochilgani haqida
tizim o'zi yozmaydi. Buni sotuvchi qo'lda qiladi: Kampaniyalarda bosqich va kurs bo'yicha
filtrlab, xabar yuboradi. Bu mening qarorim.

### 6.2. Agent: prompt, qoidalar, saboqlar

- Saqlash va tahrirlash mexanizmi o'zgarmaydi:
  - jadvallar: `agent_rule_sections`, `agent_rules`, `agent_lessons`, `client_profiles`;
  - `PromptComposer` va `AgentPage`, prompt ko'rinishi ham shu yerda.
- `systemPrompt.ts` qayta yoziladi:
  - Shaxs: "{ism}, {kompaniya} sotuv menejeri; vazifa — sotuvdagi kursni sotish".
  - Debitordagi undirish zinapoyasi, eskalatsiya bosqichlari va bosim richaglari olib
    tashlanadi.
  - Ularning o'rniga sotuv bosqichlari keladi: tanishuv → ehtiyoj → taqdimot → e'tiroz →
    yopish → to'lov → chek.
- `knowledgeBase.ts` va `seedDefaultRules.ts` ning standart qoidalari sotuv uchun qaytadan
  yoziladi. Qarz qoidalari olinmaydi. Debitordagi uslub qoidalari olinadi (✗/✓ misollar
  formati, odamdek yozish, takrorlamaslik, emoji va lotin/kirill), lekin qarzga oid misollari
  sotuv misollariga almashtiriladi.
- `userPrompt.ts` ning kontekst bloki o'zgaradi:
  - sotuvdagi kurs(lar) va ularning bazasi;
  - mijozning manbai, bosqichi va qiziqqan kursi;
  - guruh izohidan olingan bo'lsa, izoh matni;
  - mijoz xotirasi;
  - suhbat tarixi.
- Persona ismi akkaunt bo'yicha olinadi (`telegram_accounts.persona_name`), Debitordagidek.
- **Agent javobining sxemasi** (`AGENT_OUTPUT_SCHEMA`):
  - qoladi: `reply`, `replySecond`, `escalate`, `note`, `lesson`, `clientMemory`;
  - olib tashlanadi: `promise` va `paymentClaim`;
  - qo'shiladi:
    - `stage` — agent taklif qilgan yangi bosqich;
    - `courseId` — qiziqqan kurs;
    - `sendCard: boolean` va `installment: boolean` — 6.5-bo'lim.
- `escalate` — agent javob bera olmaydigan holat (shikoyat, qaytarib berish talabi, bazada
  yo'q savol). Suhbat menejerga o'tadi va agent shu suhbatda to'xtaydi.

### 6.3. Mijozlar (leads)

`clients` jadvali qarz ustunlarisiz qoladi. Unga qo'shiladigan ustunlar:
- `source`: `reklama` | `guruh` | `raqam` | `qolda`;
- `source_group` va `source_comment`: kanal yoki guruh nomi va izoh matni.

Telegram identifikatsiyasi, akkauntga biriktirish, telefon bloklari va soft delete
Debitordagidek qoladi.

**Xaridlar (`purchases`) jadvali** (mening qarorim). Voronka bosqichi mijozga emas, xaridga
bog'lanadi: bitta mijoz bir nechta kursni sotib olishi mumkin. Har bir xaridda quyidagilar
bor:
- `client_id`, `course_id`;
- `stage`, `stage_changed_at`;
- `total_amount` (kurs narxi) va `paid_amount` (tasdiqlangan to'lovlar yig'indisi);
- `installment` (bo'lib to'layaptimi);
- `link_sent_at`;
- `reminder_sent_for_stage` (6.6-bo'lim).

Mijozning bitta **faol xaridi** bo'ladi: oxirgi, hali `To'ladi` yoki `Rad etdi` bo'lmagan
xarid. Agent konteksti va Suhbatlardagi mijoz kartasi shu xaridni ko'rsatadi. `payment_checks`
qatorlari xaridga bog'lanadi.

Bosqichlarga **Qisman to'ladi** qo'shiladi: bo'lib to'lashda birinchi qism tasdiqlangandan
keyin xarid shu bosqichda turadi. Bosqichlarning to'liq ketma-ketligi:

**Yangi → Suhbatda → Qiziqdi → Karta yuborildi → Chek keldi → (Qisman to'ladi →) To'ladi**,
alohida bosqich sifatida **Rad etdi**.

**Bosqich o'tishlari:**
- Agent `stage` ni faqat oldinga, `Yangi → Suhbatda → Qiziqdi` oralig'ida yoki `Rad etdi` ga
  o'zgartira oladi.
- `Karta yuborildi` bosqichini tizim karta yuborilganda qo'yadi.
- `Chek keldi` bosqichini tizim chek kelganda qo'yadi.
- Menejer chekni tasdiqlaganda tizim `Qisman to'ladi` yoki `To'ladi` ni qo'yadi:
  `paid_amount >= total_amount` bo'lsa `To'ladi`, aks holda `Qisman to'ladi`.
- Menejer bosqichni istalgan paytda qo'lda o'zgartira oladi.

Bo'lib to'layotgan mijoz keyingi qismni to'lab chek yuborsa, oqim takrorlanadi:
`Chek keldi`, keyin menejer tasdig'i. Keyingi qism vaqti kelganini eslatish 1-bosqichga
kirmaydi. Menejer "Qisman to'ladi" filtridan qarzdorlarni ko'radi. Bu mening qarorim.

Mijozlar sahifasida filtrlar bor: faol xaridning bosqichi, manba, kurs, akkaunt va qidiruv.
Ro'yxatni Excelga eksport qilish mumkin.

**Manbalar:**
- **Reklama (kiruvchi).** Ulanadigan akkauntlar faqat sotuv uchun ochilgan (foydalanuvchi
  aytgan). Shuning uchun akkauntga yozgan har bir notanish odam mijoz hisoblanadi:
  - mijoz avtomatik yaratiladi, `source=reklama`, `Yangi` bosqichli xarid ochiladi va agent
    darhol javob beradi;
  - Debitordagi `nomalum` bosqichi (maqsadni aniqlash, operatorga bog'latish) olib tashlanadi;
  - botlar, Telegram xizmat xabarlari (777000) va kanallardan kelgan xabarlarga javob
    berilmaydi.
- **Raqam (chiquvchi).** Import sahifasida soddalashtirilgan Excel/CSV yuklanadi: ism,
  telefon va ixtiyoriy kurs. Undan keyin Kampaniyalar ishlaydi: filtr bo'yicha tanlash →
  telefon orqali Telegramdan qidirish → birinchi xabar. Debitordagi `OutreachScheduler`
  saqlanadi, limit va pauzalar ham o'z joyida.
- **Guruh.** 6.4-bo'lim.

### 6.4. Guruh izohlaridan mijoz olish (yangi bo'lim: "Guruhlar")

Foydalanuvchi aytgan: izohlar **kanal postlari ostidagi kommentlarda** yoziladi. Telegramda
kanal kommentlari kanalga bog'langan **muhokama guruhida** saqlanadi. Shuning uchun:
- akkaunt kanalga obuna bo'lishi bilan kifoyalanmaydi, muhokama guruhiga ham a'zo bo'lishi
  kerak;
- sahifa akkaunt kanalga obuna bo'lsa-yu, muhokama guruhiga a'zo bo'lmasa, buni aniq
  ko'rsatadi.

1-bosqichda bu yarim qo'lda ishlaydi:

1. Sotuvchi akkauntni va shu akkaunt obuna bo'lgan **kanalni** tanlaydi. Ro'yxat
   `listDialogs` dan olinadi, faqat kommentlari yoqilgan kanallar ko'rsatiladi.
2. Kanalning oxirgi postlari ro'yxati chiqadi: sana, matn boshi va kommentlar soni. Sotuvchi
   bir yoki bir nechta postni tanlaydi. "Oxirgi N kundagi barcha postlar" tugmasi ham bor.
3. "Kommentlarni olish" bosiladi. Tizim tanlangan postlarning kommentlarini oladi
   (`messages.getReplies` yoki muhokama guruhi tarixi; qaysi biri — quruvchining qarori) va
   ularni kalit so'zlar bo'yicha filtrlaydi.
   - Kalit so'zlar Sozlamalarda ro'yxat sifatida turadi. Standart ro'yxat: "menga xabar
     bering", "menga yozing", "qiziqaman", "narxi", "+".
   - "Hammasini ko'rsatish" belgisi bilan filtrsiz ko'rish ham mumkin.
4. Natija jadvalda chiqadi: muallif (ism va username), komment matni, post va sana.
   - Bazada allaqachon bor odamlar belgilanadi.
   - Kanal yoki anonim admin nomidan yozilgan kommentlar "yozib bo'lmaydi" deb belgilanadi
     va ularni tanlab bo'lmaydi.
5. Sotuvchi kerakli qatorlarni belgilab "Mijoz qilish" ni bosadi.
   - Mijozlar `source=guruh` bilan yaratiladi. Komment matni va kanal nomi saqlanadi.
   - Telegram ID va `access_hash` komment ichidagi foydalanuvchi ma'lumotidan saqlanadi.
     `access_hash` akkauntga bog'liq, shuning uchun mijoz kommentni o'qigan akkauntga
     biriktiriladi.
6. Shu mijozlarga birinchi xabar odatdagi chiquvchi navbat orqali, limit va pauzalarga
   bo'ysungan holda ketadi. Birinchi xabar kommentga tayanadi, masalan: "Assalomu alaykum,
   kanalda kurs haqida yozgan ekansiz…".

Kanalda ham, muhokama guruhida ham hech narsa yozilmaydi.

**Majburiy tuzatish.** Debitordagi kiruvchi xabar ishlovchisi (`MtprotoTelegramGateway.ts`,
taxminan 1430-qator, `NewMessage({incoming:true})`) chat shaxsiy ekanini tekshirmaydi.
Guruhdagi xabar DM kabi ishlanib, notanish odamga javob ketishi mumkin. LolaSales da
kiruvchi oqimga **faqat shaxsiy chatlar** kiradi. Bu uchun alohida test yoziladi.

### 6.5. To'lov va chek

**Kartalar.** Sozlamalarda "To'lov kartalari" ro'yxati bo'ladi. Har bir kartada raqam, egasining
ismi, bank va faollik belgisi bor. Bir nechta faol karta bo'lsa, agent birinchi faol kartani
yuboradi. Bu mening qarorim; kartalarni navbatma-navbat yuborish keyin qo'shilishi mumkin.

**Karta yuborish.** Mijoz to'lashga rozi bo'lsa, agent `sendCard: true` qaytaradi va
`reply` da tabiiy matn yozadi, masalan "Mana karta raqami, to'lovdan keyin chekni shu yerga
yuboring". Karta ma'lumotini tizim alohida xabar qilib, Sozlamalardagi qiymatdan aniq
yuboradi: summa, karta raqami va egasining ismi. LLM raqamni hech qachon o'zi yozmaydi.
Shundan keyin bosqich `Karta yuborildi` bo'ladi.

Summa qanday aniqlanadi:
- to'liq to'lovda — kurs narxi;
- bo'lib to'lashda birinchi qism — kursdagi birinchi qismning eng kam summasi;
- keyingi qismlarda summa yozilmaydi. Agent mijozga qolgan summani aytadi:
  `total_amount - paid_amount`, bu qiymat kontekstdan olinadi.

Agent bo'lib to'lash tanlanganini `installment: true` bilan bildiradi.

**Chek.**
- Mijoz rasm yoki PDF yuborsa, Debitordagi vision tasnifi va `receipt_review` oqimi ishlaydi:
  `payment_checks` qatori ochiladi va bosqich `Chek keldi` bo'ladi.
- Agent "qabul qildim, tekshirib chiqamiz" deydi. To'lov qabul qilinganini aytmaydi.
- Chek dashboarddagi navbatga tushadi. Suhbatlar sahifasida "Chek keldi" filtri, mijoz
  kartasida chek rasmi va "Tasdiqlash" / "Rad etish" tugmalari bor.
- **Tasdiqlash.**
  - Menejer chekdagi summani kiritadi. Standart qiymat — kutilgan summa, menejer uni tahrirlay
    oladi.
  - `paid_amount` oshadi va bosqich `To'ladi` yoki `Qisman to'ladi` bo'ladi.
  - Agent `receipt_confirmed` navbatida rahmat aytadi. Bo'lib to'layotgan mijozga qolgan
    summani ham aytadi.
  - Kursning havola qoidasi bajarilgan bo'lsa (`birinchi_qism` yoki `toliq`) va havola hali
    yuborilmagan bo'lsa, tizim mijoz kursining yopiq guruh havolasini aniq qiymatdan yuboradi
    va "qo'shilish so'rovini yuboring, tez orada qabul qilamiz" deydi. Havola bir xaridga bir
    marta yuboriladi.
- **Rad etish:** menejer sababni yozadi. Agent shu sababga tayanib, mijozdan qayta chek
  so'raydi. Bosqich `Karta yuborildi` ga qaytadi.

Debitordagi `crm_watch` turi va CRM'dan to'lov qidirish olib tashlanadi.

### 6.6. Eslatma (follow-up)

Mening qarorim. Sotuvda bitta yumshoq eslatma kerak bo'ladi. Debitordagi sukut mexanizmi
(`SilenceWatcher`) soddalashtiriladi:

- `Qiziqdi` yoki `Karta yuborildi` bosqichidagi mijoz X soat javob bermasa (standart 24),
  agent bitta eslatma yozadi.
- Bir xaridning har bir bosqichi uchun eng ko'pi bilan bitta eslatma yoziladi. Hisob
  `purchases.reminder_sent_for_stage` da yuritiladi.
- Chek rad etilib, bosqich `Karta yuborildi` ga qaytsa, yangi eslatma yozilmaydi.
- Eslatma Sozlamalarda yoqiladi yoki o'chiriladi. Standart holati — yoqilgan, soat sozlanadi.
- Eslatma yuborish oynasiga va limitlarga bo'ysunadi.

### 6.7. Saqlanadigan umumiy qismlar (o'zgarishsiz yoki deyarli)

- **Telegram:** `MtprotoTelegramGateway` (shaxsiy chat tuzatishi bilan), ulash (kod, 2FA,
  QR), proksi va proksi testi, `AccountGate`, `PacingPolicy`, `SendWindowPolicy`, kunlik
  yuborish va qidiruv limitlari, FloodWait va PeerFlood, `SpamStatusWatcher`,
  `TelegramConnectionWatcher`, `MissedMessageSync`, Telegram qutisi sahifasi.
- **Suhbatlar sahifasi:** chapda suhbatlar, o'rtada yozishma, o'ngda mijoz kartasi. Mijoz
  kartasida qarz o'rniga bosqich, manba, kurs, izoh va chek ko'rinadi. Qo'lda yozish,
  tahrirlash va o'chirish, suhbatda agentni o'chirish, agentga ko'rsatma berish, qayta urinish
  va reset saqlanadi.
- **Media va ovoz:** `ReplyDebouncer`, media saqlash, ovozli xabar uchun STT.
- **Loglar:** `app_log`, `audit_log`, Loglar sahifasi va loglarni tozalovchi.
- **Foydalanuvchilar, rollar va ruxsatlar:** qarzga oid ruxsatlar olib tashlanadi, "kurslar",
  "guruhlar" va "chekni tasdiqlash" ruxsatlari qo'shiladi.
- **Sozlamalar:**
  - yuborish tezligi, oyna va hafta kunlari;
  - kill switch va agent avto-javobi;
  - persona ismi;
  - akkaunt navbati;
  - AI modellar va OpenAI kaliti;
  - sinov reseti;
  - **yangi:** to'lov kartalari, guruh kalit so'zlari va eslatma sozlamalari.
- `llm_models`, `AgentEngineFactory`, `agent_usage`.
- **Dashboard:** sotuv voronkasi (har bosqichda nechta mijoz), bugun kelgan mijozlar manbalar
  bo'yicha, bugun tasdiqlangan to'lovlar soni va summasi, navbatdagi cheklar.

## 7. Dashboard bo'limlari (yakuniy ro'yxat)

Dashboard · Suhbatlar · Mijozlar · Kurslar · Guruhlar · Kampaniyalar · Import · Agent
(prompt, qoidalar, saboqlar) · Telegram (akkauntlar, proksi, limitlar) · Telegram qutisi ·
Loglar · Foydalanuvchilar · Sozlamalar.

## 8. Olib tashlanadiganlar

- Shartnomalar va xonsaroy CRM integratsiyasi (`infrastructure/contracts`, ContractSync*,
  `contract_payments`).
- `debt_snapshots`.
- Qarz importi (`XlsxDebtorParser`).
- `payment_promises` va PromiseWatcher.
- OylikEslatma.
- Talabnoma: Chromium PDF va TalabnomalarPage.
- Rekvizitlar.
- PremiumEslatma.
- `crm_watch`.
- Bayramlar sahifasi.
- Kunlik (Daily) va qarz hisobotlari sahifalari. Ular Dashboard voronkasi bilan almashtiriladi.
- Qo'ng'iroqlar va telefon suhbatlari (`qongiroq*`, 125–127).
- `users.objects` (134).
- `mcp/` paketi.
- `nomalum` mijoz bosqichi (`NomalumMijozOchuvchi`, `NomalumMijozAgenti`, 130/131). Uning
  o'rniga to'g'ridan-to'g'ri mijoz yaratiladi (6.3-bo'lim).
- Eskalatsiya bosqichlari va bosim richaglari.
- `knowledgeBase.ts` dagi barcha qarz qoidalari.
- Shu qismlarning `*.spec.ts` testlari va `ci.yml` dagi yozuvlari.

## 9. Quruvchiga qoldirilganlar

- Bosqichlarni kod va bazada qanday ifodalash: enum, check constraint va hokazo.
- Sotuv uchun standart qoidalar va misollarning aniq matni. Ruhi: samimiy, qisqa, odamdek,
  bosim qilmaydigan sotuvchi; avval savol berib ehtiyojni aniqlaydi, keyin taklif qiladi.
  Foydalanuvchi ularni Agent sahifasida o'zi tahrirlaydi.
- Olib tashlash tartibi va qaysi fayllarni o'chirish yoki soddalashtirish.
- Kurslar va Guruhlar sahifalarining joylashuvi (mavjud sahifalar uslubida).
- Guruh izohlarini olishda paginatsiya, N chegarasi va FloodWait'ni qanday hisobga olish.
- Testlar: yangi mantiq uchun `*.spec.ts`. Kamida quyidagilar qamraladi: sotuvdagi kursni
  aniqlash (davr chegaralari, ikkita kurs, kurs yo'q), bosqich o'tish qoidalari, karta va
  havolani tizim qo'shishi, havola qoidasi (birinchi qism yoki to'liq to'lov), qisman
  to'lovda `paid_amount` hisobi, shaxsiy chat filtri, kalit so'z filtri, anonim komment
  filtri, eslatma chegarasi.
