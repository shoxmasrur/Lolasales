# LolaSales

Telegram orqali kurs sotuvchi AI agent va uni kuzatish uchun Telegram-messenjerga o'xshash
dashboard. Agent mijozlar bilan shaxsiy chatda muloqot qiladi, kursni tushuntiradi, to'lov
uchun karta yuboradi va chekni menejer tasdiqlashiga uzatadi.

- **Agent** — Claude Agent SDK.
- **Telegram** — MTProto (userbot): mijozga shaxsiy akkauntdan yoziladi.
- **Baza** — PostgreSQL (`lolasales`).
- **Struktura** — SOLID / qatlamli arxitektura (domain → application → infrastructure → presentation).

> Bu loyiha DebitorAgent02 (b563a61) dan ajratib olingan. README ning qolgan qismi
> keyingi vazifalarda LolaSales ga moslanadi.

---

## 1. Talablar

| Nima | Versiya | Izoh |
|------|---------|------|
| Node.js | 20.10+ (22 tavsiya) | `.nvmrc` da 22 ko'rsatilgan |
| PostgreSQL | 14+ | `pgcrypto` kengaytmasi avtomatik yoqiladi |
| Telegram `api_id` / `api_hash` | — | [my.telegram.org](https://my.telegram.org) → **API development tools** |
| Anthropic API kaliti | — | [console.anthropic.com](https://console.anthropic.com) |

```bash
nvm use          # Node 22
```

## 2. O'rnatish

```bash
npm install
```

```bash
cp .env.example .env
```

`.env` da to'ldirilishi shart bo'lganlar:

```
DATABASE_URL=postgres://user@localhost:5432/debitor_agent02
JWT_SECRET=<uzun tasodifiy satr>
ENCRYPTION_KEY=<uzun tasodifiy satr — Telegram sessiyasi shu bilan shifrlanadi>
ADMIN_EMAIL=admin@xonsaroy.uz
ADMIN_PASSWORD=<kuchli parol>
TELEGRAM_API_ID=<my.telegram.org dan>
TELEGRAM_API_HASH=<my.telegram.org dan>
ANTHROPIC_API_KEY=<sk-ant-api… bilan boshlansa>
CLAUDE_CODE_OAUTH_TOKEN=<sk-ant-oat… bilan boshlansa>
```

> **Claude kaliti ikki xil bo'ladi va ular boshqa-boshqa o'zgaruvchiga yoziladi:**
> `sk-ant-api…` — API kalit → `ANTHROPIC_API_KEY`;
> `sk-ant-oat…` — Claude Code obuna tokeni (`claude setup-token`) → `CLAUDE_CODE_OAUTH_TOKEN`.
> `AGENT_AUTH_MODE=auto` bo'lganda tizim turini prefiksidan o'zi aniqlaydi, shuning uchun
> tokenni noto'g'ri o'zgaruvchiga yozib qo'ysangiz ham ishlaydi.

> ⚠️ `ENCRYPTION_KEY` ni keyinchalik o'zgartirsangiz, saqlangan Telegram sessiyalari
> o'qilmay qoladi va akkauntlarga qaytadan kirish kerak bo'ladi.

Bazani yaratish va admin foydalanuvchini qo'shish:

```bash
createdb debitor_agent02 && npm run seed
```

## 3. Ishga tushirish

```bash
npm run dev
```

- API: `http://localhost:4200`
- Dashboard: `http://localhost:5174`

Alohida ishga tushirish: `npm run dev:server` / `npm run dev:web`.

Produksiya uchun: `npm run build` → `npm start --workspace=server`.

---

## 4. Birinchi ishga tushirish tartibi

**1-qadam. Debitor faylini yuklash** — `Import` → *Debitor eksporti*.

Kutilayotgan ustunlar (rus tilida, eksportdagidek): `ID`, `СТАТУС`, `№ договора`, `Объект`,
`Клиент`, `Категория`, `Стоимость`, `1-взнос`, `След. оплата`, `День оплаты`, `Дни просрочки`,
`Долг (Общ)`, `Дата договора:`, `Месяцы:`, `Всего осталось:` va h.k.

Muhim tafsilotlar:
- Sarlavha qatori avtomatik topiladi (birinchi qatorda yig'indi bo'lsa ham).
- `Долг (Общ)` manfiy keladi — moduli olinadi (`-1 000 000` → **1 000 000 so'm kechikkan to'lov**).
- `Дни просрочки` ham manfiy — `-25` → **25 kun kechikish**.
- **Mijoz bilan gaplashishda `Долг (мес.)` ishlatiladi** — ya'ni oyma-oy to'lovlar
  bo'yicha kechikish. `Долг (Общ)` da boshlang'ich to'lovdagi kechikish (`Долг 1 взнос`) ham
  bor va u suhbat mavzusi emas. Ikkalasi ham saqlanadi va dashboardda ko'rinadi,
  lekin agentga faqat oyma-oy kechikish uzatiladi.
- Eksportdagi `ID` — *shartnoma satrining* id'si, mijozniki emas. Shuning uchun mijozlar
  **ism bo'yicha** guruhlanadi: bitta mijozda bir nechta shartnoma bo'lishi mumkin.
- Fayl qayta yuklansa, shartnomalar `№ договора` bo'yicha **yangilanadi**, dublikat yaratilmaydi.

**2-qadam. Telefon raqamlarini yuklash** — `Import` → *Telefon raqamlari*.

Debitor eksportida telefon ustuni bo'lmasa, raqamlarni alohida fayldan yuklaysiz.
Fayl mijozga `№ договора` → `ID` → ism tartibida bog'lanadi. Bitta katakda bir nechta
raqam bo'lsa (`901234567 / 935556677`) ikkalasi ham saqlanadi. Barcha raqamlar E.164
formatiga keltiriladi (`+998901234567`).

**Telefon raqamisiz Telegramdan mijozni topib bo'lmaydi.**

**3-qadam. Telegram akkauntni ulash** — `Telegram` → *Akkaunt qo'shish* → *Kod yuborish*.

Telegram ilovangizga kod keladi, uni dashboardga kiritasiz. Ikki bosqichli parol yoqilgan
bo'lsa, keyingi qadamda parol so'raladi. Sessiya bazada **shifrlangan** holda saqlanadi va
API orqali hech qachon qaytarilmaydi.

**4-qadam. Kampaniya yaratish** — `Kampaniyalar` → filtrni sozlab *Qamrovni ko'rish* →
*Yaratish va ishga tushirish*.

**5-qadam. Kuzatish** — `Suhbatlar` sahifasi. Telegram messenjeridek: chapda suhbatlar,
o'rtada yozishma, o'ngda mijozning to'lov kartasi. Istalgan paytda qo'lda yozishingiz,
shu suhbatda agentni o'chirishingiz yoki qoralamani tasdiqlashingiz mumkin.

---

## 4.1. Shartnomalar bazasi bilan integratsiya

Excel eksporti mijozlar ro'yxatini yaratadi, lekin **raqamlar
`app-api.xonsaroy.uz` dan olinadi** — kechikkan to'lov, to'lov grafigi,
bankdan kelgan real to'lovlar va telefon raqamlari.

Sabab oddiy: fayl yuklangan kundan keyingi to'lovlar eksportda ko'rinmaydi, va
kecha to'lagan mijozga "to'lovingiz kechikkan" deb yozish — tizimning eng
qimmat xatosi.

**Sozlash** — `.env` da:

```
CONTRACTS_API_URL=https://app-api.xonsaroy.uz
CONTRACTS_API_CLIENT_ID=…
CONTRACTS_API_CLIENT_SECRET=…
CONTRACTS_API_USERNAME=…
CONTRACTS_API_PASSWORD=…
```

`CONTRACTS_SYNC_ENABLED=false` bo'lsa integratsiya butunlay o'chadi va tizim
avvalgidek faqat Excel bilan ishlaydi.

**Qachon yangilanadi:**

| Qachon | Nima |
|---|---|
| Har kuni 03:00 (`CONTRACTS_SYNC_HOUR`) | Hamma shartnoma. ~1700 ta ≈ 15 daqiqa |
| Mijozga birinchi xabardan oldin | O'sha mijozning shartnomalari (~330 ms) |

Yozishdan oldingi tekshiruvda kechikkan to'lov nolga tushgan bo'lsa, **xabar
yuborilmaydi**. Shartnomalar bazasi javob bermasa va mavjud ma'lumot 24 soatdan
(`CONTRACTS_STALE_HOURS`) eski bo'lsa — o'sha mijoz keyingi navbatga
qoldiriladi. Shubha bo'lganda yozmaslik afzal.

**Telefon raqamlari** API'dan mijozga **qo'shiladi**, Excel'dagi eski raqam
o'chirilmaydi. Yangi raqam paydo bo'lganda mijozning Telegram qidiruvi qayta
yoqiladi — ko'p hollarda aynan yangi raqamda Telegram topiladi.

**Qo'lda ishga tushirish:**

```bash
npm run sync-contracts --workspace=server
```

Bitta shartnomani bazaga tegmasdan ko'rish:

```bash
npm run probe-contract --workspace=server -- 5582MSO25F3
```

> ⚠️ **Kechikkan to'lov o'zimizda hisoblanadi.** API'ning `total_debt` maydoni —
> shartnoma bo'yicha **umumiy qoldiq**, kechikkan summa emas. Real shartnomada
> farq o'nlab baravar bo'lishi mumkin (684 mln va 17 mln). Hisob
> `server/src/domain/services/contractDebt.ts` da, testlari
> `npm run test:contract-debt --workspace=server`.

**Dashboardda ko'rinishi:**

- `Mijozlar` → mijozni tanlang → **To'lov grafigi**: qaysi oy to'langan, qaysi biri
  kechikkan, kelib tushgan to'lovlar ro'yxati. Jimlikda faqat kechikkanlar va
  keyingi uchtasi ko'rsatiladi, qolgani tugma bilan ochiladi. **"Hozir yangilash"**
  shu shartnomani darhol qayta so'raydi (`contracts.sync` ruxsati).
- `Sozlamalar` → **Shartnomalar bazasi**: oxirgi to'liq yangilash qachon bo'lgani,
  nechta shartnoma yangilangani va topilmaganlar ro'yxati. Topilmagan shartnoma
  odatda Excel'dagi noto'g'ri raqamni bildiradi — ro'yxatdan ko'rib faylni
  tuzatasiz.

Yangi ruxsat **`contracts.sync`** — jimlikda Administrator va Operatorda bor,
Kuzatuvchida yo'q.

> **Atama:** tizimda va mijoz bilan muloqotda **"qarz" so'zi ishlatilmaydi** —
> "to'lov", "kechikkan to'lov". Xonsaroy mijozlarga qarz bermagan, bo'lib-bo'lib
> to'lash shartnomasi tuzilgan. Kod ichidagi nomlar (`debt_total`, `debtMonthly`)
> o'zgarmaydi — ular mijozga ko'rinmaydi. Qo'riqlovchi test:
> `npm run test:lugat --workspace=server`.

---

## 4.2. Tushum hisoboti

`Hisobot` sahifasi (`reports.view` ruxsati) bitta savolga javob beradi:
**biz gaplashgan mijozlardan qancha to'lov tushdi.**

O'lchov qoidasi sodda: mijozga birinchi chiquvchi xabar yuborilgan vaqtdan
**keyin** kelgan har qanday to'lov hisobga olinadi. Anchor sifatida
suhbat yaratilgan vaqt emas, aynan **xabar yuborilgan** vaqt olinadi —
suhbat qatori xabar ketishidan oldin yaratiladi va Telegram qidiruvi
muvaffaqiyatsiz tugasa, xabar umuman ketmagan bo'lishi mumkin.

Bu qoida raqamni "yopishqoq" qiladi — mart oyida gaplashilgan mijoz
avgustda to'lasa ham kiradi — shuning uchun yonida to'lov xabardan
**necha kunda** kelgani ham ko'rsatiladi (0–7 / 8–30 / 31+).

Yonma-yon **gaplashilmagan** mijozlar guruhi turadi: kechikkan to'lovi bor,
lekin ularga hech qachon yozilmagan. Ikki guruhning to'lash ulushi farqi —
tizimning foydasi haqidagi yagona halol ko'rsatkich.

> ⚠️ **Bu sababni isbotlamaydi.** Guruhlar teng emas: biz odatda eng katta
> kechikishi bor mijozlardan boshlaymiz, Telegramda topilgan mijoz boshqa
> xulq-atvorga ega bo'lishi mumkin, va bir vaqtda boshqa kanallar ham
> ishlaydi. Raqam "biz undirdik" emas, "biz gaplashganlardan tushdi" degani.

Bahsli (`is_problematic`) to'lovlar hisoblanmaydi.

Terminaldan:

```bash
npm run check-report --workspace=server -- 2026-01-01 2026-12-31
```

---

## 5. Ban riskini kamaytiruvchi qatlamlar

Telegram notanish odamlarga ko'p yozilganda akkauntni cheklaydi (`PEER_FLOOD`) yoki
bloklaydi. Tizimda 5 qatlam himoya bor:

1. **Global to'xtatish** (`Sozlamalar` → *Yuborish*) — bir tugma bilan hamma narsa to'xtaydi.
2. **Ish vaqti oynasi** — sukut bo'yicha 09:00–19:00, dushanba–shanba (Asia/Tashkent).
3. **Kunlik limit** — har bir akkaunt uchun alohida (sukut bo'yicha 30 ta yangi kontakt).
4. **Tasodifiy pauza** — xabarlar orasida 60–180 sekund.
5. **Avtomatik pauza** — `PEER_FLOOD` yoki blokirovka kelsa kampaniya darhol to'xtaydi,
   `FLOOD_WAIT` kelsa Telegram so'ragan vaqt kutiladi.

Bundan tashqari: bir mijozning raqami bir marta qidiriladi (natija keshlanadi) —
ortiqcha `importContacts` chaqiruvlari akkauntni spam filtriga yaqinlashtiradi.

**Tavsiya:** 1700+ debitor uchun bitta akkaunt yetarli emas. Kuniga 30 ta bo'lsa,
to'liq qamrov ~57 kun oladi. Tezlashtirish uchun bir nechta akkaunt qo'shing.

### Kunlik chegaralar — har akkaunt uchun alohida

Ikkita mustaqil chegara bor va ikkalasi ham Telegram sahifasidagi akkaunt
kartasidan sozlanadi:

- **Kunlik limit** (standart 30) — kuniga nechta YANGI suhbat boshlanadi.
  Mavjud suhbatdagi javoblar bu chegaraga kirmaydi: mijoz yozsa yoki
  suhbat allaqachon boshlangan bo'lsa, agent kvotadan qat'i nazar javob
  beradi.
- **Kunlik qidiruv** (standart 50) — kuniga nechta telefon raqami
  Telegramdan qidiriladi (`contacts.importContacts`). Qidiruv spam filtri
  uchun xabar yuborishdan kam bo'lmagan signal, shuning uchun alohida
  sanaladi.

Operator chatdan qo'lda yozgan birinchi xabar (shu jumladan birinchi
fayl/rasm) ham kunlik hisobga tushadi — lekin u to'silmaydi: operator
ongli qaror qabul qilyapti.

Sozlamalar sahifasidagi "Kampaniya uchun kunlik standart" — boshqa narsa:
u faqat yangi kampaniya yaratilganda ishlatiladi.

### Bir nechta akkaunt va mijozni biriktirish

**Bitta mijoz — bitta akkaunt, suhbat oxirigacha.** Mijoz uchun yozishma bitta odam
bilan ketayotgandek ko'rinishi kerak; akkaunt almashsa, u boshqa raqamdan xabar
kelganini ko'radi va ishonch yo'qoladi.

- Import tugagach mijozlar akkauntlar bo'yicha **avtomatik teng taqsimlanadi**.
- `Telegram` sahifasining tepasida taqsimot va biriktirilmaganlar soni ko'rinadi,
  qo'lda *Taqsimlash* tugmasi ham bor.
- Biriktirilgan akkaunt band bo'lsa (limit to'lgan, flood-wait, spam) — tizim
  **boshqa akkauntga o'tmaydi**, o'sha mijoz keyingi navbatga qoldiriladi.
- Akkaunt butunlay bloklansa: *Mijozlarni qayta taqsimlash* tugmasi ularni
  boshqa akkauntlarga o'tkazadi (bu ongli qaror — mijoz yangi raqamdan va yangi
  ism bilan xabar oladi).
- **Suhbat boshlashda akkaunt tanlanadi.** Mijozlar sahifasida checkbox
  bilan belgilab *Suhbat boshlash* bosilganda, oynada qaysi Telegram
  akkauntlaridan yozilishi tanlanadi — bir yoki bir nechta. Belgilangan
  mijozlar tanlanganlar orasida teng taqsimlanadi va oynada har akkauntga
  nechta mijoz tushishi darhol ko'rinadi.
- **Yozishmasi boshlangan mijozning akkaunti o'zgarmaydi.** Mijozga
  allaqachon xabar ketgan bo'lsa, u eski akkauntda qoladi — raqam ham,
  agent ismi ham o'rtada almashmaydi.
- Kunlik limitga sig'maganlar biriktiriladi, lekin xabar keyingi ishga
  tushirishda ketadi — o'sha akkauntdan.

### Har akkauntga o'z operator ismi

Mijoz ko'radigan ism har bir Telegram akkauntiga alohida biriktiriladi:
Telegram sahifasi → akkaunt kartasi → **Agent ismi**. Shunda har raqam
mijoz uchun alohida operator bo'lib ko'rinadi (Shoxsanam, Go'zal).

Maydon bo'sh qolsa Sozlamalardagi **Agent ismi — standart** ishlatiladi.

Qoidalar va misollarda ism `{ism}` ko'rinishida yoziladi — u prompt
yig'ilayotganda o'sha suhbat akkauntining ismiga almashadi.

### @SpamBot orqali avtomatik tekshiruv

Har 6 soatda har bir ulangan akkaunt `@SpamBot` ga `/start` yuborib, holatini
so'raydi. Natija `Telegram` sahifasida belgi bilan ko'rinadi:

| Holat | Ma'nosi |
|-------|---------|
| `toza` | Cheklov yo'q |
| `CHEKLANGAN` | Spam filtriga tushgan — bu akkauntdan **yangi mijozlarga yozilmaydi** |
| `BLOKLANGAN` | Akkaunt bloklangan |
| `tekshirib bo'lmadi` | Bot aniq javob bermadi — yuborish to'xtamaydi |

Bot javobi ikki-uch xabarda keladi va ularning bittasi ("Unfortunately, some phone
numbers may trigger…") sog'lom akkauntga ham yoziladi. Shuning uchun barcha
xabarlar birlashtirilib tahlil qilinadi va faqat **aniq hukm iboralari** hisobga
olinadi — aks holda sog'lom akkaunt xato "cheklangan" deb belgilanib, butun
yuborish to'xtab qolardi.

Tahlil mantig'ini sinash: `npm run test:spam-parser --workspace=server`

---

## 6. Agent nima qiladi va nima qilmaydi

**Qiladi:**
- Mijozning **oyma-oy to'lovdagi kechikishi** (`Долг (мес.)`), kechikish kuni va
  shartnoma raqami bilan murojaat qiladi. Umumiy kechikkan to'lov agentga umuman ko'rsatilmaydi,
  shuning uchun uni tasodifan aytib yuborishi ham mumkin emas.
- Oyma-oy kechikishi **nol** bo'lsa suhbat boshlanmaydi (kampaniyada ham nishonga
  olinmaydi) — aytadigan gapi yo'q.
- Noaniq javobni ("harakat qilyapmiz", "nasib bo'lsa") qabul qilmaydi — aniq sana va
  summa so'raydi, ikkita aniq variant taklif qiladi.
- Kelishuvga erishilsa, va'dani (summa + sana + mijozning aynan qaysi gapi) bazaga yozadi.
- Kelishilgan **kunning ertalabida** bitta yumshoq eslatma yuboradi ("bugun kelishuvimiz
  kuni edi"). Bu bosim emas — mijoz hali kechikmagan. Sozlamalardan o'chirsa bo'ladi.
- To'lov kelib tushsa rahmat aytadi. To'lovni **aniqlash** sutka bo'yi ishlaydi (to'lagan
  mijoz eslatmalar ro'yxatiga tushmasligi kerak), lekin **xabar** faqat ish vaqtida ketadi:
  ish vaqti boshlanishidan `Sozlamalar → "Pul tushdi" xabari shu vaqtgacha` (standart 18:00)
  gacha va belgilangan hafta kunlarida. Tunda kelgan to'lov uchun rahmat ertalab yuboriladi.
- Va'da muddati o'tsa, uni `buzilgan` deb belgilaydi va keyingi suhbatda bosim asosi
  sifatida ishlatadi.
- Kechikish kuniga qarab ohangni o'zgartiradi: Soft (0–60 kun) → Hard (60–180) → Legal (180+).

**Qilmaydi (kodda qat'iy taqiqlangan):**
- Shartnomada yo'q raqam, muddat yoki foizni aytmaydi.
- To'lovni tasdiqlamaydi va qabul qilmaydi.
- Yangi shartnoma sharti, chegirma yoki muddat uzaytirish taklif qilmaydi.
- Jarima haqida gapirmaydi — shartnomada jarima **yo'q** (3.7 va 4.4-bandlar).
- Shaxsiy tahdid, haqorat, qarindoshlarga murojaat — taqiqlangan.
- Bank rekvizitlari yoki to'lov havolasini yozmaydi.

Quyidagi holatlarda agent to'xtaydi va operatorni chaqiradi (`Inson kerak` belgisi):
mijoz advokat/sud haqida gapirdi; to'lovni allaqachon qilganini da'vo qildi;
shartnomada yo'q savol berdi; haqorat qildi; og'ir shaxsiy holat aytdi.

### Qoidalar va xotira — `Agent` sahifasi

Agentning barcha qoidalari **bazada** saqlanadi va dashboarddan tahrirlanadi.
O'zgarish ~10 soniyada kuchga kiradi, server qayta ishga tushirilmaydi.

**Qoidalar** — 10 ta bo'lim, 60 ta standart qoida:
uslub · o'zini takrorlamaslik · qachon "yetarli" · kelishuvdan keyin ·
shartnoma faktlari · taktikalar · mijoz tiplari · media · taqiqlar · misollar.

Har bir qoidani yoqish/o'chirish, tahrirlash yoki o'chirish mumkin; bo'limni
*Standartga qaytarish* tugmasi kodda yozilgan boshlang'ich holatga tiklaydi.
*Prompt ko'rinishi* bo'limida agentga aynan nima ketayotgani ko'rinadi.

> ⚠️ `Tasdiqlangan shartnoma shartlari` bo'limiga yangi fakt qo'shishdan oldin
> uni shartnoma matni bilan tekshiring — agent bu raqamlarni mijozga aytadi.

**O'rgangan saboqlar** — agent har suhbatdan umumiy xulosa chiqarishi mumkin
(masalan yangi e'tiroz turi va unga ishlagan javob). Saboq **avtomatik
ishlatilmaydi**: u "tasdiq kutmoqda" holatida turadi, siz tasdiqlaganingizdan
keyingina promptga qo'shiladi. Bir xil saboq qayta uchrasa hisoblagichi oshadi.

**Mijoz bo'yicha xotira** — mijoz kartasida (`Mijozlar` → mijozni tanlang).
Agent mijoz tipini (tez qaror / o'ylaydigan / narxga sezgir / shubhali),
qisqa xulosani va qaysi yondashuv ishlaganini yozib boradi. Bu ma'lumot
keyingi suhbatlarda promptga qo'shiladi — ya'ni agent mijozni "eslaydi".
Qo'lda ham tahrirlash mumkin.

Standart qoidalarning kodli manbai:
`server/src/infrastructure/ai/prompt/knowledgeBase.ts`

---

## 7. Loyiha strukturasi

```
server/src/
├── domain/                  # Sof biznes qoidalar — hech qanday I/O yo'q
│   ├── entities/            # Client, Contract, Conversation, Message, ...
│   ├── policies/            # EscalationPolicy (Soft/Hard/Legal), SendWindowPolicy
│   ├── repositories/        # Portlar (interfeyslar)
│   └── services/            # ITelegramGateway, IAgentEngine, IDebtorFileParser
├── application/             # Ssenariylar — portlarga tayanadi, implementatsiyani bilmaydi
│   ├── services/            # MessageDispatcher, AgentRunner, OutreachScheduler, ...
│   └── usecases/            # ImportDebtorFile, StartConversation, HandleIncomingMessage, ...
├── infrastructure/          # Konkret implementatsiyalar
│   ├── db/repositories/     # Pg*Repository
│   ├── telegram/            # MtprotoTelegramGateway (teleproto)
│   ├── ai/                  # ClaudeAgentEngine + prompt
│   ├── import/              # XlsxDebtorParser
│   └── support/             # Clock, hasher, JWT, event bus
├── presentation/            # HTTP (Express 5) va WebSocket (socket.io)
└── composition/container.ts # Yagona joy: interfeys → implementatsiya
```

**Implementatsiyani almashtirish uchun faqat `container.ts` o'zgaradi.** Masalan
`MtprotoTelegramGateway` o'rniga test uchun soxta gateway qo'yish — bir qator.

```
web/src/
├── lib/       # api, socket, format, types
├── store/     # auth (zustand)
├── components/
└── pages/     # Dashboard, Chat, Clients, Campaigns, Import, Telegram, Settings
```

---

## 8. Rasm, ovoz va fayllar

**Mijozdan kelganda:**

| Tur | Nima bo'ladi |
|-----|--------------|
| Ovozli xabar | Yuklanadi → [Aisha STT](https://aisha.group) orqali matnga o'giriladi → agent oddiy matn kabi javob beradi |
| Rasm | Saqlanadi va **operatorga chiqadi** — ko'pincha to'lov cheki bo'ladi |
| Hujjat / video | Xuddi shunday: saqlanadi va operator ko'rigiga yuboriladi |
| Rasm + izoh | Izoh matni ham agentga uzatiladi |

Agent chekni **o'zi tasdiqlamaydi** — "buxgalteriya tekshirib, tasdiqlab beradi" deydi
(pul masalasida avtomatik tasdiq berish taqiqlangan).

STT ishlamasa (kalit yo'q, timeout, xato) suhbat to'xtamaydi — xabar saqlanadi va
operatorga "o'zingiz eshiting" deb chiqadi.

**Operator yuborishi:** chat oynasidagi 📎 tugmasi, faylni chatga tashlash (drag-drop)
yoki skrinshotni ⌘V bilan qo'yish. Matn yozilsa — u faylning izohi bo'ladi.

**Xavfsizlik:** fayllar statik papkadan berilmaydi. Har bir so'rov JWT bilan tekshiriladi
(`GET /api/media/:messageId`), chunki bu mijozning shaxsiy hujjati.

Sozlamalar `.env` da: `AISHA_API_KEY`, `STT_LANGUAGE`, `STT_MAX_MB`, `MEDIA_DIR`, `MEDIA_MAX_MB`.

## 9. Agentni sinab ko'rish (mijozlarsiz)

Personani, ohangni va taktikani real mijozlarga tegmasdan sozlash uchun:

```bash
npm run try-agent --workspace=server
```

Argumentlar — mijozning navbatdagi javoblari:

```bash
npm run try-agent --workspace=server -- "harakat qilyapmiz" "bekor qilsangiz ham mayli" "payshanba 5 mln"
```

Bazaga hech narsa yozilmaydi. Har bir javob uchun matn, suhbat holati, ilingan va'da,
eskalatsiya sababi va token narxi ko'rsatiladi.

## 10. Terminaldan import

Dashboardsiz, katta fayllar uchun:

```bash
npm run import --workspace=server -- debtors "/path/to/eksport.xlsx"
```

```bash
npm run import --workspace=server -- phones "/path/to/telefonlar.xlsx"
```

---

## 11. Foydalanuvchilar, rollar va ruxsatlar

`Foydalanuvchilar` sahifasi (`users.view` ruxsati bilan) ikki bo'limdan iborat.

**Foydalanuvchilar** — qo'shish, rolini almashtirish, faolsizlantirish, parol tiklash, o'chirish.

**Rollar** — ixtiyoriy rol yaratasiz (masalan "Undiruvchi", "Buxgalter") va unga
qaysi bo'lim hamda qaysi amal ruxsat etilishini belgilaysiz. Ruxsatlar guruhlar
bo'yicha chiziladi, guruhni bir bosishda to'liq yoqish mumkin.

Tayyor uch rol (o'chirilmaydi, lekin nusxa olib o'zgartirsa bo'ladi):

| Rol | Nima qila oladi |
|-----|-----------------|
| Administrator | Hammasi (30 ruxsat) |
| Operator | Mijozlar, suhbatlar, kampaniyalar, import (18 ruxsat) |
| Kuzatuvchi | Faqat o'qish (8 ruxsat) |

Ruxsatlar ro'yxati `server/src/infrastructure/../domain/entities/Permission.ts` da.
Yangi ruxsat qo'shilsa, u avtomatik rol tahrirlash oynasida paydo bo'ladi.

**Muhim:** ruxsat tokenga yozilmaydi — har bir so'rovda bazadan o'qiladi
(15 soniyalik kesh bilan). Shuning uchun rolni o'zgartirsangiz, foydalanuvchi
qayta kirishi shart emas, o'zgarish deyarli darhol kuchga kiradi.

**O'zini qulflab qo'yishdan himoya** — tizim quyidagilarga yo'l qo'ymaydi:
- Administrator rolining ruxsatlarini kamaytirish
- O'zini o'chirish yoki faolsizlantirish
- O'z rolini o'zgartirish (boshqa admin qilishi kerak)
- Foydalanuvchilarni boshqara oladigan yagona faol hisobni yo'qotish
- Foydalanuvchisi bor rolni yoki tizim rolini o'chirish

Har bir muhim amal (`audit_log`) yoziladi: kim, qachon, nima qildi.
Foydalanuvchi o'z parolini `POST /api/auth/change-password` orqali almashtiradi.

### O'chirish — hech narsa bazadan yo'qolmaydi

Tizimda **qattiq o'chirish yo'q**. Mijoz, suhbat, xodim, rol, agent qoidasi
yoki saboq o'chirilganda yozuvga faqat `deleted_at` qo'yiladi: u ro'yxatlardan,
statistikadan va agentning ko'z o'ngidan yo'qoladi, lekin bazada turadi.

Sabab oddiy: to'lov undirish yozishmasi — hujjat. "Mijozni o'chirdik" degani
"u bilan ishlamaymiz" degani, "u bilan nima gaplashganimiz yo'qoldi" degani emas.

- **Mijozni o'chirish** — `clients.delete` ruxsati (jimlikda faqat administratorda).
  Mijoz kartasining pastidagi tugma; sabab yozish ixtiyoriy va jurnalga tushadi.
  Mijoz bilan birga shartnomalari, suhbatlari, xabarlari, to'lov va'dalari va
  kampaniya nishonlari ham belgilanadi.
- **Qaytarish** — mijozlar sahifasidagi **"O'chirilgan"** tabi (shu ruxsat bilan
  ko'rinadi). Qaytarilganda o'sha partiya to'liq tiklanadi.
- **Yozishmalarni tozalash** (`conversations.reset`) va `npm run clear-clients`
  ham endi yumshoq ishlaydi — tarix joyida qoladi.

Ikkalasi ham `audit_log` ga yoziladi (`client.deleted`, `client.restored`) —
kim, qachon, nima uchun va nechta qatorga tegilgani ko'rinib turadi.

### Importni qaytarish

Noto'g'ri fayl yuklab yuborish — oddiy hodisa, va u bir zarbada minglab mijoz
yaratishi mumkin. Shuning uchun har bir import o'zi yaratgan qatorlarni
belgilab boradi (`created_import_batch_id`), va **Import** sahifasidagi
tarixda har bir yozuv yonida **"qaytarish"** turadi (`import.undo` ruxsati).

- Tugmani bosganda avval nechta mijoz va shartnoma ro'yxatdan chiqishi
  ko'rsatiladi, keyin tasdiq so'raladi.
- Qaytarish faqat SHU import **yaratgan** qatorlarga tegadi. Ilgari mavjud
  bo'lgan mijoz joyida qoladi.
- Import mavjud shartnomani **yangilagan** bo'lsa, o'sha o'zgarish qaytmaydi —
  eski qiymatlar hech qayerda saqlanmagan. Tasdiq oynasi buni ochiq aytadi.
- O'chirish yumshoq, shuning uchun qaytarishning o'zi ham qaytariladi:
  qatorda "tiklash" tugmasi paydo bo'ladi.

Jurnalga `import.undone` va `import.undo_reverted` yoziladi.

---

## 12. MCP — boshqa agentlar uchun

Boshqa AI agentlaringiz (Usmon_ai, Bozorvoy, Finansist…) Debitor tizimini MCP
orqali o'qishi va xavfsiz amallarni bajarishi mumkin: 13 ta o'qish, 5 ta yozish asbobi.

**Mijozga xabar yuborish, kampaniya ishga tushirish va kill switch MCP orqali
mumkin emas** — bu amallar faqat dashboard orqali, odam nazorati bilan.

Sozlash: `Foydalanuvchilar` → agent uchun hisob yarating (rol: **MCP agent**) →
`API kalitlar` → kalit yarating → agentga ulang.

```bash
claude mcp add debitor --env DEBITOR_API_KEY=dbt_… -- node ./mcp/dist/index.js
```

Batafsil: [mcp/README.md](mcp/README.md)

## 13. Baza zaxirasi

Ikki qatlam:

| Qachon | Nima | Qayerda | Nechta saqlanadi |
|---|---|---|---|
| Har deployda | `db-*.sql.gz` | `/var/backups/debitor` | 10 |
| Har soatda | `hourly-*.sql.gz` | `/var/backups/debitor` + Telegram guruhi | 48 (≈2 kun) |

Nomlari ataylab har xil: `deploy.sh` faqat `db-*` ni, timer faqat
`hourly-*` ni sanaydi va tozalaydi. Bir xil bo'lganda ular bir-birining
fayllarini o'chirib yuborardi.

Zaxira ilovadan mustaqil — `debitor` xizmati yiqilgan paytda ham olinadi.
Skript: [scripts/backup.sh](scripts/backup.sh).

### O'rnatish (serverda, bir marta)

1. BotFather'da bot oching, yopiq guruh yarating va botni guruhga qo'shing
   (admin qilish shart emas).
2. Guruh `chat_id` sini oling — avval guruhga bir xabar yozing, so'ng:

   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | grep -o '"chat":{"id":[-0-9]*'
   ```

   Manfiy son chiqadi, masalan `-1001234567890`.

3. `/opt/debitor-agent/.env` ga yozing:

   ```
   BACKUP_BOT_TOKEN=…
   BACKUP_CHAT_ID=-1001234567890
   BACKUP_DIR=/var/backups/debitor
   BACKUP_KEEP=48
   ```

4. Papka `debitor` foydalanuvchisiga tegishli bo'lsin:

   ```bash
   sudo mkdir -p /var/backups/debitor && sudo chown debitor:debitor /var/backups/debitor
   ```

5. Unit fayllarni ulang va yoqing:

   ```bash
   sudo cp /opt/debitor-agent/scripts/systemd/debitor-backup.* /etc/systemd/system/
   sudo systemd-analyze verify /etc/systemd/system/debitor-backup.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now debitor-backup.timer
   ```

6. Darhol bir marta sinab ko'ring — guruhga fayl kelishi kerak:

   ```bash
   sudo systemctl start debitor-backup.service && journalctl -u debitor-backup -n 20 --no-pager
   ```

Keyingi ishga tushish vaqti: `systemctl list-timers debitor-backup.timer`

### Tiklash

```bash
sudo systemctl stop debitor
gunzip -c /var/backups/debitor/hourly-20260807-1400.sql.gz | psql "$DATABASE_URL"
sudo systemctl start debitor
```

Telegramdan yuklab olingan faylni ham shu buyruq tiklaydi.

## 14. Ma'lum cheklovlar

- **Telefon raqamsiz mijoz** — Telegramdan topilmaydi. Eksportda telefon ustuni yo'q,
  shuning uchun 2-qadam (telefon fayli) majburiy.
- **Maxfiylik sozlamasi** — mijoz "kim mening raqamimni ko'ra oladi" ni yopgan bo'lsa,
  uni topib bo'lmaydi (`privacy_restricted` deb belgilanadi).
- **Bir xil ismli mijozlar** — eksportda mijoz id'si bo'lmagani uchun ism bo'yicha
  birlashtiriladi. Import natijasida bu haqda ogohlantirish chiqadi; kerak bo'lsa
  dashboardda qo'lda ajrating.
- **Bitta server nusxasi** — hodisa shinasi (`InMemoryEventBus`) jarayon ichida ishlaydi.
  Bir nechta nusxa kerak bo'lsa, uni Redis pub/sub bilan almashtiring (interfeys o'zgarmaydi).
