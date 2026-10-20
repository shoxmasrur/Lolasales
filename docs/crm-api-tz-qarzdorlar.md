# Texnik topshiriq: kechikkan to'lovli shartnomalar ro'yxati uchun API

**Kimga:** Xonsaroy CRM (`app-api.xonsaroy.uz` / `crm-api.xonapps.uz`) dasturchilari
**Kimdan:** Debitor Agent jamoasi
**Sana:** 2026-10-14
**Holat:** taklif — muhokama uchun

---

## 1. Maqsad

Debitor Agent — kechikkan to'lovli mijozlarga Telegram va telefon orqali eslatma yuboradigan tizim. Hozir unga **qaysi shartnomalarda to'lov kechikkanini** bilish uchun CRM'dan Excel eksport qilinib, qo'lda yuklanadi.

Bizga Excel o'rniga **API** kerak: Debitor har kuni (va kun davomida) CRM'dan kechikkan to'lovli shartnomalar ro'yxatini o'zi olsin.

Natija:
- yangi qarzdorlar ro'yxatga qo'l mehnatisiz, o'sha kuni tushadi;
- to'lagan mijoz ro'yxatdan tez chiqadi va unga xabar ketmaydi;
- Excel yuklashdagi xatolar (eskirgan fayl, ustun nomlari o'zgarishi) yo'qoladi.

## 2. Hozirgi holat

Hozir CRM'dan uchta so'rov ishlatamiz (ular o'zgarishsiz qolishi kerak):

| So'rov | Ishlatilishi |
|---|---|
| `POST /api/v2/oauth/login` | Token olish (`grant_type=password`) |
| `POST /api/v4/order/index` | Shartnomani raqami bo'yicha qidirish (`search`) |
| `POST /api/v4/order/show` | Bitta shartnomaning to'liq ma'lumoti va to'lov grafigi |

Muammo: `order/show` faqat **bitta** shartnomani qaytaradi. Qaysi shartnomalarni so'rash kerakligini biz faqat Excel'dan bilamiz. Kechasi hamma shartnomani bittalab so'raymiz (~1700 ta, ~15 daqiqa) — bu sizning serveringizga ham ortiqcha yuk.

## 3. Talab: yangi so'rov

### 3.1. Manzil

```
POST /api/v4/order/debtors
Authorization: Bearer <token>
```

Avtorizatsiya — mavjud OAuth bilan, alohida login kerak emas. Imkon bo'lsa, faqat o'qish huquqi bo'lgan alohida foydalanuvchi bersangiz yaxshi.

### 3.2. So'rov parametrlari

| Parametr | Turi | Majburiy | Ma'nosi |
|---|---|---|---|
| `date` | `YYYY-MM-DD` | yo'q | Qaysi kunga hisoblash. Berilmasa — bugun (Toshkent vaqti) |
| `virtual_statuses` | massiv | yo'q | **Shartnoma holati bo'yicha filtr** — bir yoki bir nechta: `["sold","for_payment","cancellation_process"]`. Berilmasa — hammasi |
| `object_ids` | massiv | yo'q | **Obyekt bo'yicha filtr** — bir yoki bir nechta obyekt id'si, masalan `[4, 7]`. Berilmasa — hammasi |
| `min_overdue_amount` | son | yo'q | Kechikkan summasi shundan katta bo'lganlar. Standart `0` (ya'ni kechikishi borlarning hammasi) |
| `updated_since` | ISO 8601 vaqt | yo'q | Faqat shu vaqtdan keyin o'zgargan shartnomalar (3.5-bandga qarang) |
| `cursor` | satr | yo'q | Keyingi sahifa uchun (3.4-band) |
| `limit` | son | yo'q | Sahifadagi yozuvlar soni, standart 100, eng ko'pi 500 |

Filtrlar birga ishlaydi: bitta filtr ichidagi qiymatlar "yoki", filtrlar orasida "va". Masalan `virtual_statuses: ["sold","for_payment"]` va `object_ids: [4]` — 4-obyektdagi, holati Сотилди yoki К оплате bo'lgan shartnomalar.

### 3.2a. Filtr qiymatlari ro'yxati

Obyekt id'lari va holat kalitlarini qo'lda yozib qo'ymaslik uchun alohida so'rov:

```
POST /api/v4/order/debtors/filters
```

```json
{
  "objects": [
    { "id": 4, "name": "MUHABBAT SHAHRI", "debtors": 312 },
    { "id": 7, "name": "ORZULAR", "debtors": 145 }
  ],
  "virtual_statuses": [
    { "key": "sold", "name": "Сотилди", "debtors": 1104 },
    { "key": "for_payment", "name": "К оплате", "debtors": 38 },
    { "key": "cancellation_process", "name": "Проц. отказ", "debtors": 112 }
  ]
}
```

`debtors` — shu obyekt yoki holatda kechikkan to'lovli shartnomalar soni (`date` = bugun). Ro'yxatga hamma obyekt va holat kiradi, soni nol bo'lsa ham — yangi obyekt yoki CRM'ga qo'shilgan yangi holat biz tomonda darhol ko'rinsin.

### 3.3. Javob

Namuna (`date` = 2026-10-14; qiymatlar o'ylab topilgan, shaxsiy ma'lumot yo'q):

```json
{
  "data": [
    {
      "order_id": 37719,
      "contract": "5582MSO25F3",
      "contract_date": "2025-03-14",
      "virtual_status": "sold",
      "updated_at": "2026-10-14T05:12:44+05:00",

      "client": {
        "id": 10234,
        "last_name": "Testov",
        "first_name": "Testoy",
        "middle_name": "Test o'g'li",
        "phones": ["+998901112233", "+998934445566"]
      },

      "object": { "id": 4, "name": "MUHABBAT SHAHRI" },
      "apartment": { "number": "14Б-38", "block": "Блок 14", "floor": 6, "rooms": 2, "area": 54.9 },

      "transaction_price": 702080000,
      "initial_payment": 300000000,
      "monthly_payment": 8339000,
      "months_count": 48,
      "total_paid": 351245032,

      "overdue": {
        "initial": 0,
        "monthly": 17356000,
        "meter": 0,
        "total": 17356000,
        "days": 81,
        "months": 3,
        "earliest_unpaid_date": "2026-07-25"
      },

      "next_payment": { "date": "2026-10-25", "amount": 8339000 },

      "last_payment": { "date": "2026-07-20", "amount": 7661000 }
    }
  ],
  "next_cursor": "eyJpZCI6Mzc3MTl9",
  "total": 1243
}
```

### 3.4. Maydonlar

| Maydon | Ma'nosi |
|---|---|
| `order_id` | Shartnomaning CRM'dagi id'si — `order/show` ga beriladigan |
| `contract` | Shartnoma raqami |
| `virtual_status` | `virtual_status.key` (`sold`, `for_payment`, `cancellation_process`, `for_return`, `waiting`). `status.type` **emas** |
| `updated_at` | Shartnoma, uning to'lov grafigi yoki to'lovlari oxirgi marta o'zgargan vaqt |
| `client.*` | Ism qismlari lotincha, alohida-alohida. Telefonlar `+998XXXXXXXXX` ko'rinishida |
| `object`, `apartment` | Obyekt va xonadon |
| `monthly_payment` | Shartnoma bo'yicha oylik to'lov summasi |
| `total_paid` | Shu kungacha to'langan jami |
| `overdue.initial` | Boshlang'ich to'lovning muddati o'tgan va to'lanmagan qismi |
| `overdue.monthly` | Oylik to'lovlarning muddati o'tgan va to'lanmagan qismi |
| `overdue.meter` | Hisoblagichlar uchun to'lovning (`for_electrocity`) muddati o'tgan va to'lanmagan qismi |
| `overdue.total` | `initial + monthly` (hisoblagich **kirmaydi**) |
| `overdue.days` | Eng eski to'lanmagan qatordan `date` gacha kunlar |
| `overdue.months` | To'lanmagan oylik qatorlar soni |
| `next_payment` | `date` dan keyingi birinchi to'lanmagan boshlang'ich yoki oylik to'lov |
| `last_payment` | Bankdan kelgan oxirgi real to'lov (`payment_histories` dagi) |

Summalar — so'mda, butun son yoki ikki xonali kasr. Sanalar — `YYYY-MM-DD`, vaqtlar — vaqt mintaqasi bilan ISO 8601.

### 3.5. Kechikish qanday hisoblanadi (muhim)

To'lov grafigidagi qator **kechikkan** hisoblanadi, agar bir vaqtda:
- `date_payment` < `date` (so'rovdagi kun, Toshkent vaqti);
- `status` ≠ `paid`;
- `amount` > `amount_paid`.

Kechikkan summa — `amount − amount_paid`.

Ikki eslatma:
- **`total_debt` ishlatilmasin.** U shartnoma bo'yicha umumiy qoldiq (`transaction_price − total_paid`), kechikkan to'lov emas. Bitta shartnomada ular 684 mln va 17 mln bo'lgan.
- **`payments[].is_expired` hozir ishonchsiz:** muddati o'tgan va to'lanmagan qatorlarda ham `false` turadi. Yangi so'rovda unga tayanmang; imkon bo'lsa, `order/show` dagi shu maydonni ham tuzatib bering.

Ro'yxatga **faqat `overdue.total > 0`** bo'lgan shartnomalar kiradi (`min_overdue_amount` bilan oshirish mumkin). Faqat hisoblagich to'lovi kechikkan shartnoma ro'yxatga kirmaydi, lekin `updated_since` bilan so'ralganda o'zgargani qaytadi (3.6-band).

### 3.6. Sahifalash va o'zgarishlar

- **Sahifalash — kursor bilan**, `order_id` bo'yicha o'sish tartibida. Sahifa raqami (`page`) bilan emas: ro'yxat so'rov davomida o'zgarsa, sahifa raqamida yozuvlar tushib qoladi yoki takrorlanadi.
- **`updated_since` berilsa** — kechikishi bor-yo'qligidan qat'i nazar, shu vaqtdan keyin o'zgargan **hamma** shartnoma qaytadi (kechikishi yopilganlari ham, `overdue.total = 0` bilan). Shu orqali biz to'lagan mijozni darhol ro'yxatdan chiqaramiz.

Biz shunday ishlatamiz:
- kechasi bir marta — to'liq ro'yxat (`updated_since` siz);
- kun davomida har 15–30 daqiqada — faqat o'zgarganlar (`updated_since` = oxirgi so'rov vaqti).

## 4. Nofunksional talablar

| Talab | Qiymat |
|---|---|
| Javob vaqti | Bitta sahifa (100 yozuv) — 2 soniyadan kam |
| Yuk | Kuniga ~100 so'rov (kechasi to'liq ro'yxat + kun davomida o'zgarishlar) |
| Barqarorlik | Bir xil `date` va filtrlar bilan takroriy so'rov bir xil natija beradi |
| Xatolar | Mavjud format; `400` noto'g'ri parametr, `401` token, `429` juda ko'p so'rov (`Retry-After` bilan) |
| Versiya | Maydon nomi o'zgarsa yoki olib tashlansa — oldindan xabar berish; yangi maydon qo'shish — erkin |
| Test muhiti | Real ma'lumotli nusxa yoki shaxsiy ma'lumoti almashtirilgan test baza |

## 5. Qabul qilish mezonlari

1. 5–10 ta tanlangan shartnoma uchun `overdue.*` qiymatlari CRM ekranidagi va `order/show` grafigidan qo'lda hisoblangani bilan bir xil.
2. Bugun to'lagan mijozning shartnomasi `updated_since` bilan so'ralganda `overdue.total = 0` bilan qaytadi.
3. Filtrlar ishlaydi: `for_return` holatidagi shartnoma `virtual_statuses: ["sold"]` bilan qaytmaydi; boshqa obyektdagi shartnoma `object_ids: [4]` bilan qaytmaydi; ikkalasi birga berilganda faqat ikkala shartga mos keladiganlar qaytadi. `debtors/filters` dagi `debtors` soni shu filtr bilan olingan `total` ga teng.
4. 1700 ta shartnomali to'liq ro'yxatni kursor bilan o'qiganda takror va tushib qolgan yozuv yo'q.
5. Mavjud `order/index`, `order/show` va `oauth/login` xatti-harakati o'zgarmagan.

## 6. Sizga savollar

1. CRM'da shartnoma o'zgargan vaqt (`updated_at`) to'lov grafigi va bank to'lovlari o'zgarishini ham qamraydimi? Qamramasa, `updated_since` qanday qilinadi?
2. Bank to'lovi CRM'ga qancha kechikish bilan tushadi (darhol, soatlab, ertasiga)?
3. Excel eksportidagi "предупреждение" ma'lumotlari (soni, turi, usuli, menejer, sana) CRM'da saqlanadimi? Saqlansa, javobga `warnings` bo'limi qo'shsa bo'ladimi — biz ularni ham ishlatamiz.
4. Telefon raqamlarida qaysi biri asosiy ekanini ko'rsatish mumkinmi?
5. Taxminiy muddat: qachon test muhitida ko'ra olamiz?

## 7. Biz tomonda nima o'zgaradi (ma'lumot uchun)

API tayyor bo'lgach, Debitor Agent:
- Excel yuklashsiz yangi qarzdorlarni o'zi qo'shadi va kechikishi yopilganlarni belgilaydi;
- kechasigi 1700 ta alohida `order/show` so'rovini to'xtatadi; `order/show` faqat mijozga yozishdan oldingi jonli tekshiruv uchun qoladi;
- Excel import imkoniyati zaxira sifatida saqlanadi.
