# CRM integratsiyasi (Xonsaroy shartnomalar bazasi)

Holat: 2026-10-13. Manba — koddagi amaldagi xatti-harakat (`server/src/infrastructure/contracts/`, `ContractSyncService`, `shartnomaHolati.ts`).

## Qisqacha

Debitor Agent mijozga aytiladigan har bir raqamni (kechikkan to'lov, oylik to'lov, to'lov sanasi) Xonsaroyning o'z shartnomalar tizimidan — CRM'dan oladi. Integratsiya **faqat o'qiydi**: CRM'ga hech narsa yozilmaydi.

CRM'dan olinadigan narsalar:

- shartnoma va xonadon ma'lumoti;
- to'lov grafigi (qaysi sanada qancha to'lanishi kerak va qanchasi to'langan);
- bankdan kelgan real to'lovlar tarixi;
- shartnomaning holati (Сотилди, Проц. отказ va h.k.);
- mijozning ismi va telefon raqamlari.

Kechikkan to'lov CRM'dan tayyor holda **olinmaydi** — u to'lov grafigidan hisoblanadi (sababi pastda).

## API

| | |
|---|---|
| Asosiy manzil | `https://app-api.xonsaroy.uz` |
| Zaxira manzil | `https://crm-api.xonapps.uz` (o'sha API, o'sha login) |
| Avtorizatsiya | OAuth `password` grant, token 30 kun yashaydi |
| Kutish chegarasi | 15 soniya (sozlanadi) |

Ishlatiladigan uchta so'rov:

| So'rov | Nima uchun |
|---|---|
| `POST /api/v2/oauth/login` | Token olish. `grant_type=password`, `client_id`, `client_secret`, `username`, `password`. |
| `POST /api/v4/order/index` | Shartnomani raqami bo'yicha qidirish. Tana: `{page, limit, search}`. |
| `POST /api/v4/order/show` | Bitta shartnomaning to'liq ma'lumoti. Tana: `{id}` — CRM'ning `order.id` si. Taxminan 330 ms, 29 KB. |

**Token** faqat xotirada saqlanadi, diskka yozilmaydi. Muddati tugashidan bir kun oldin yangilanadi; `401` kelsa darhol qayta olinadi.

**Zaxira manzilga o'tish** avtomatik: manzil tarmoq darajasida yiqilsa (DNS, ulanish, timeout, `502`–`504`), keyingisi sinaladi va ishlagani eslab qolinadi. `400`/`401`/`404` manzilni almashtirmaydi — bu "server ishlayapti, so'rov noto'g'ri" degani. Har manzilga ikki marta qayta uriniladi.

**Qidiruv aniqligi.** `order/index` o'xshash raqamlarni ham qaytaradi, shuning uchun faqat shartnoma raqami **aynan** mos kelgan natija olinadi. Aks holda boshqa mijozning ma'lumoti bizning shartnomaga yozilib qolardi.

## Sozlamalar (`.env`)

Qiymatlar serverdagi `.env` da; bu yerda faqat nomlari.

| O'zgaruvchi | Ma'nosi | Standart |
|---|---|---|
| `CONTRACTS_API_URL` | Asosiy manzil | `https://app-api.xonsaroy.uz` |
| `CONTRACTS_API_FALLBACK_URLS` | Zaxira manzillar, vergul bilan | — |
| `CONTRACTS_API_CLIENT_ID`, `CONTRACTS_API_CLIENT_SECRET` | OAuth mijozi | — |
| `CONTRACTS_API_USERNAME`, `CONTRACTS_API_PASSWORD` | CRM foydalanuvchisi | — |
| `CONTRACTS_API_TIMEOUT_MS` | Bitta so'rovni kutish | 15000 |
| `CONTRACTS_SYNC_ENABLED` | Sinxronlashni yoqish/o'chirish | `true` |
| `CONTRACTS_SYNC_HOUR` | Kechasigi to'liq sinxronlash soati | 3 |
| `CONTRACTS_SYNC_DELAY_MS` | To'liq sinxronlashda so'rovlar orasidagi pauza | 200 |
| `CONTRACTS_FRESH_MINUTES` | Shundan yangi ma'lumot qayta so'ralmaydi | 30 |
| `CONTRACTS_STALE_HOURS` | CRM javob bermasa, shundan eski ma'lumot bilan yozilmaydi | 24 |

To'rtta kirish ma'lumotidan biri bo'sh bo'lsa, integratsiya "sozlanmagan" hisoblanadi va so'rov yuborilmaydi.

## CRM javobidan nima olinadi

`order/show` javobidagi maydonlar va ularning bizdagi ma'nosi:

| CRM maydoni | Bizda | Izoh |
|---|---|---|
| `id` | `external_order_id` | Keyingi so'rovlar shu id bilan ketadi |
| `contract` | shartnoma raqami | Kalit; mos kelmasa javob rad etiladi |
| `client.attributes.{last,first,middle}_name.lotin` | mijozning to'liq ismi va alohida ismi | Operator tahrirlagan to'liq ism ustidan yozilmaydi |
| `client.phones[]` | mijoz telefonlari | E.164 ga keltiriladi; qoidalari pastda |
| `virtual_status.key` | shartnoma holati | `status.type` **ishlatilmaydi** (pastga qarang) |
| `contract_date`, `months_count` | shartnoma sanasi, muddat | |
| `transaction_price`, `initial_payment` | umumiy narx, boshlang'ich to'lov | |
| `total_debt` | umumiy qoldiq | **Ichki** — mijozga aytilmaydi |
| `order_apartments[0]` | xonadon: raqam, qavat, xonalar, kirish, blok, maydon | |
| `…apartment.block.building.object.name` | obyekt (majmua) nomi | `order/show` da yuqori darajali `object` yo'q |
| `completion_date` (xonadon → blok → bino → obyekt `build_date`) | bitish muddati | Birinchi to'ldirilgan pog'ona olinadi |
| `payments[]` | to'lov grafigi | Pastga qarang |
| `payment_histories[]` | bankdan kelgan to'lovlar | Pastga qarang |

Javob kutilgan shaklda bo'lmasa (id yoki shartnoma raqami yo'q), butun javob rad etiladi va shartnomaga xato yoziladi — yarim to'ldirilgan ma'lumot bazaga tushmaydi.

### To'lov grafigi (`payments[]`)

Har qator: `id`, `type`, `amount`, `amount_paid`, `date_payment`, `date_paid`, `status`.

| CRM `type` | Bizda | Qanday hisoblanadi |
|---|---|---|
| `initial_payment` | boshlang'ich to'lov | kechikkan boshlang'ich to'lovga |
| `monthly` | oylik to'lov | kechikkan oylik to'lovga, "necha oy qoldirilgan" hisobiga |
| `for_electrocity` | hisoblagichlar uchun to'lov | **alohida**; oylikka va jamiga qo'shilmaydi (2026-10-09 dan) |
| boshqa har qanday | "boshqa" | oylik qatoridek hisoblanadi |

`status`: `paid`, `partially`, `waiting`. Notanish holat `waiting` deb olinadi — to'langan deb hisoblab kechikishni yashirgandan ko'ra ortiqcha ko'rsatish xavfsizroq.

### Bankdan kelgan to'lovlar (`payment_histories[]`)

Har yozuv: `uuid`, `external_id`, `amount`, `date_paid`, `payment_type`, `purpose`, `is_problematic`.

- Yozuvlar **`uuid`** bo'yicha farqlanadi. `external_id` kalit emas — bank ko'chirmasi kelganda u almashadi.
- Bu yozuvlar bizda o'chirilmaydi: mijozning "to'ladim" degan gapini tekshirish, va'da kuzatuvi va tushum hisoboti shularga tayanadi.
- `is_problematic` to'lovlar agentga "keldi" deb ko'rsatilmaydi.

## Hisob-kitob

### Kechikkan to'lov

Mijozga aytiladigan summa — **muddati o'tgan va to'lanmagan** grafik qatorlarining yig'indisi:

- qator kechikkan, agar `date_payment` bugundan oldin, holati `paid` emas va `amount > amount_paid`;
- kechikkan qismi — `amount − amount_paid`;
- boshlang'ich va oylik qismlar alohida saqlanadi, jami — ikkalasining yig'indisi;
- kechikish kunlari — eng eski to'lanmagan qatordan bugungacha;
- "bugun" — Toshkent vaqti bo'yicha.

**Nega CRM'ning `total_debt` i ishlatilmaydi.** U `transaction_price − total_paid`, ya'ni shartnoma bo'yicha umumiy qoldiq. Bitta real shartnomada u 684 mln, haqiqiy kechikkan to'lov esa 17 mln bo'lgan. Ikkalasini adashtirish mijozga bir necha o'n baravar katta raqam aytilishiga olib kelardi.

**Nega `payments[].is_expired` ishlatilmaydi.** U ishonchsiz: muddati o'tgan va to'lanmagan qatorlarda ham `false` turadi. Kechikish sanani solishtirib aniqlanadi.

### Oylik to'lov summasi

CRM'da ishonchli alohida maydon yo'q. Shuning uchun grafikdagi `monthly` qatorlarning **eng ko'p uchraydigan** summasi olinadi (oxirgi oy odatda yaxlitlanmagan qoldiq, ba'zan bitta katta to'lov ham uchraydi).

### To'langan jami

`order/show` da `total_paid` yo'q (u faqat `order/index` da), shuning uchun grafikdagi `amount_paid` lar yig'indisidan hisoblanadi.

## Shartnoma holati

Holat `virtual_status.key` dan olinadi. `status.type` juda qo'pol: bekor qilinayotgan shartnomada ham `sold` bo'lib qolaveradi.

| Kalit | Nomi | Agent yozadimi |
|---|---|---|
| `sold` | Сотилди | ha |
| `for_payment` | К оплате | ha (2026-10-13 dan) |
| `cancellation_process` | Проц. отказ | ha (2026-10-13 dan) |
| `for_return` | К возврату | yo'q |
| `waiting` | В ожидании | yo'q |
| noma'lum yoki bo'sh | — | yo'q |

Сотилди bo'lmagan, lekin yoziladigan shartnomada agent holatni ichki ma'lumot sifatida ko'radi: mijoz bekor qilish yoki pul qaytarish haqida gapirsa, to'lov talab qilishda davom etmay menejerga uzatadi.

Bazada bitta holat ikki xil yozilgan bo'lishi mumkin: CRM sinxronlashi kalitni (`sold`), eski Excel importi esa nomni ("Сотилди") yozgan. Ikkalasi ham qabul qilinadi.

## Qachon sinxronlanadi

| Qachon | Nima |
|---|---|
| Har kecha (standart 03:00, `CONTRACTS_SYNC_HOUR`) | Hamma shartnoma ketma-ket yangilanadi (so'rovlar orasida 200 ms) |
| Mijozga birinchi xabar yozishdan oldin | Mijozning har shartnomasi jonli yangilanadi |
| Agent har javob berishidan oldin | Shartnomalar har doim yangilanadi |
| Oylik eslatmadan oldin | Har doim yangilanadi |
| Va'da kuzatuvida | Ma'lumot 30 daqiqadan eski bo'lsa |
| Operator panelda bosganda | Bitta mijoz, belgilangan mijozlar yoki hammasi |

### CRM javob bermasa

Asosiy qoida: **shubha bo'lganda yozilmaydi.**

- **Birinchi xabar:** mavjud ma'lumot 24 soatdan eski bo'lsa, mijoz o'tkazib yuboriladi ("ma'lumotni yangilab bo'lmadi va mavjudi eskirgan").
- **Agent javobi:** yoziladigan shartnoma yangilanmasa, agent summani aytmaydi. Yozilmaydigan holatdagi shartnomaning xatosi javobni to'xtatmaydi.
- Xato shartnomaning o'ziga yoziladi va «Sozlamalar»dagi sinxronlash bo'limida ro'yxat bo'lib ko'rinadi.

## Telefon raqamlari

- CRM'dagi raqamlar mijozga **qo'shiladi**; eski raqam o'chirilmaydi.
- Mijozda asosiy raqam bo'lmasa, CRM'dagi birinchisi asosiy bo'ladi.
- Yangi raqam qo'shilsa, mijozning Telegram holati "tekshirilmagan"ga qaytadi va u navbatdagi Telegram qidiruviga tushadi.
- Operator "bu raqam mijozniki emas" deb uzgan raqam CRM'dan qayta qo'shilmaydi. CRM'da u eski egasiga bog'langan holicha turadi; uni tuzatish uchun panelda "CRM uchun: noto'g'ri raqamlar" eksporti bor.

## Bazadagi jadvallar

| Jadval | Nima saqlaydi |
|---|---|
| `contracts` | Shartnoma: CRM id'si, holati, narxlar, kechikkan summalar (`debt_first`, `debt_monthly`, `debt_total`, `debt_meter`), kechikish kunlari, navbatdagi to'lov sanasi, xonadon, oxirgi sinxronlash vaqti va xatosi |
| `contract_payments` | To'lov grafigi. Har sinxronlashda CRM bilan tenglashtiriladi; CRM'da qolmagan qator o'chiriladi |
| `contract_payment_events` | Bankdan kelgan to'lovlar. Faqat qo'shiladi, o'chirilmaydi |

## Paneldagi amallar

| Amal | Qayerda | Ruxsat |
|---|---|---|
| Shartnoma raqami bo'yicha mijoz qo'shish | Mijozlar → "+ Mijoz qo'shish" | `clients.create` |
| Bitta mijozni yangilash | Mijoz kartasi | `contracts.sync` |
| Belgilangan mijozlarni yangilash | Mijozlar ro'yxati | `contracts.sync` |
| To'liq sinxronlashni qo'lda boshlash, oxirgi natija va xatolar | Sozlamalar | `contracts.sync`, `settings.view` |

Belgilanganlarni yangilash kechasigi to'liq sinxronlash ketayotganda boshlanmaydi — CRM serveriga ikki tomondan yuk tushmasligi uchun.

## Qo'lda tekshirish

Bitta shartnomani CRM'dan o'qib, hisoblangan raqamlarni ko'rsatadi; bazaga hech narsa yozmaydi:

```bash
npm run probe-contract --workspace=server -- 5582MSO25F3
```

## Ma'lum cheklovlar

- **Hisoblagich to'lovi jamiga kirmaydi.** Faqat hisoblagich to'lovi kechikkan mijozga tizim o'zi yozmaydi.
- **Hisoblagich uchun bank tushumi CRM'da `monthly` turida keladi**; faqat `purpose` matnidan ("hisoblagichlar uchun") ajratsa bo'ladi. Rahmat xabari va tushum eksportiga ta'siri tekshirilmagan.
- **Bitish muddatining blok darajasi** hozirgi CRM javobida yo'q; kod uni tekshiradi va CRM maydonni qo'shsa o'zi ishlab ketadi.
- **Bir shartnomada bir nechta xonadon** bo'lsa, faqat birinchisi olinadi.
- **CRM'ga yozish yo'q:** noto'g'ri raqam, o'zgargan ism kabi tuzatishlar CRM'da qo'lda qilinadi.

## Kod xaritasi

| Fayl | Vazifasi |
|---|---|
| `server/src/infrastructure/contracts/XonsaroyContractGateway.ts` | HTTP: login, token, qayta urinish, zaxira manzil |
| `server/src/infrastructure/contracts/contractMapper.ts` | CRM javobini bizning turga o'girish |
| `server/src/domain/services/contractDebt.ts` | Kechikkan to'lovni grafikdan hisoblash |
| `server/src/domain/entities/shartnomaHolati.ts` | Holatlar va "yoziladimi" qoidasi |
| `server/src/application/services/ContractSyncService.ts` | Bitta/hamma shartnomani sinxronlash, telefon va ismni birlashtirish |
| `server/src/application/services/ContractSyncScheduler.ts` | Kechasigi to'liq sinxronlash |
| `server/src/application/services/BulkContractSync.ts` | Belgilangan mijozlarni yangilash |
| `server/src/infrastructure/contracts/__fixtures__/orderShow.json` | Real javob namunasi (shaxsiy ma'lumot almashtirilgan) |

Testlar: `test:contract-mapper`, `test:contract-debt`, `test:contract-sync`, `test:contract-fallback`, `test:shartnoma-holati`, `test:tolov-kaliti`.
