# Ovozli qo'ng'iroq platformasi uchun MCP

## Ulanish

| | |
|---|---|
| Manzil | `https://debitorapp.xonsaroy.uz/api/mcp` |
| Transport | MCP Streamable HTTP, holatsiz (faqat `POST`, sessiya yo'q) |
| Kirish | `Authorization: Bearer dbt_…` yoki `X-Api-Key: dbt_…` |

## Kalit olish

1. Panel → Foydalanuvchilar → yangi foydalanuvchi (masalan `ovozli-agent@xonsaroy.uz`), rol: **Qo'ng'iroq agenti**.
2. API kalitlar → Kalit yaratish. Kalit faqat bir marta ko'rsatiladi.

Bu rol faqat qo'ng'iroq asboblarini ishlata oladi: mijozlar ro'yxati, panel va xabar yuborish yo'q.

## Asbob: `qongiroq_oldi`

Har qo'ng'iroqdan oldin chaqiring. Kirish: `{ "shartnoma_raqami": "5582MSO25F3" }`.

Javob — JSON matn: `mijoz`, `shartnomalar[]` (kechikkan summa: boshlang'ich / oylik / hisoblagich / jami), `telegram` (yozishma, agent ismi, ochiq va'dalar; suhbat bo'lmasa `null`), `xotira`, `qongiroqlar[]`, `qongiroq_mumkin`, `sabablar[]`, `malumot_eskirgan`.

`telegram.suhbatdosh` — mijoz nomidan boshqa odam (masalan o'g'li) yozsa `{ qarindoshligi, ismi }`, aks holda `null`. Bor bo'lsa, Telegramdagi `mijoz` deb belgilangan xabarlarni o'sha qarindosh yozgan bo'lishi mumkin — ularni mijozning o'ziga nisbat bermang.

`telegram.vadalar` — mijozning ochiq va'dalari, va agar oxirgi va'da buzilgan bo'lsa, o'sha va'da `holat: "broken"` bilan ham shu ro'yxatda bo'ladi.

`qongiroqlar[]` — shu mijozning oxirgi 5 ta qo'ng'irog'i, eng yangisi birinchi: `sana`, `agent_ismi`, `natija`, `xulosa`, `vada` (`{ kun, summa }` yoki `null`). Transkript bu javobda QAYTARILMAYDI.

**`qongiroq_mumkin = false` bo'lsa qo'ng'iroq qilmang** — `sabablar` da nega ekani yozilgan. Sabab matnlari:

- mijozda «bog'lanmaslik» belgisi bor;
- yoziladigan holatdagi (Сотилди, К оплате, Проц. отказ) shartnoma yo'q;
- kechikkan to'lov yo'q yoki minimal chegaradan kichik;
- ochiq va'da bor va uning kuni o'tmagan (bugun ham) — qo'ng'iroq kutadi;
- Telegram suhbati operator qo'lida yoki to'xtatilgan (masalan, mijoz chek yuborgan va operator tasdiqlashi kutilyapti; suhbat yopilgan; agent o'chirilgan) — avtomatik aloqa qilinmaydi;
- qo'ng'iroq xizmati to'xtatilgan (KILL_SWITCH);
- To'lov ma'lumotini CRM'dan yangilab bo'lmadi va mavjudi eskirgan.

Oxirgi sabab chiqqanda `malumot_eskirgan` ham `true` bo'ladi. Agar CRM yangilanishi xato bersa, lekin ma'lumot hali yetarli darajada yangi bo'lsa, `malumot_eskirgan: true` qoladi, sabab qo'shilmaydi.

Summalar so'mda, sonda; ovozda aytish uchun ularni platforma so'zga aylantiradi.

## Asbob: `qongiroq_natijasi`

Har qo'ng'iroqdan KEYIN chaqiring — natija qanday bo'lishidan qat'i nazar (gaplashildi, ko'tarmadi, band va h.k.). Ruxsat: `calls.record` («Qo'ng'iroq agenti» roli).

| Maydon | Majburiy | Qiymat |
|---|---|---|
| `shartnoma_raqami` | ha | 1–64 belgi; katta-kichik harfga sezgir emas |
| `qongiroq_id` | ha | 1–200 belgi; platformadagi qo'ng'iroq identifikatori |
| `agent_kaliti` | ha | 1–100 belgi |
| `agent_ismi` | ha | 1–100 belgi |
| `boshlandi` | ha | vaqt zonasi bilan to'liq ISO 8601 vaqt (masalan `2026-10-14T09:30:00Z` yoki `2026-10-14T14:30:00+05:00`); zonasiz qabul qilinmaydi; ≤ 40 belgi |
| `davomiylik_soniya` | ha | butun son, 0–14400 |
| `natija` | ha | `gaplashildi`, `kotarmadi`, `band`, `boshqa_odam`, `raqam_notogri` |
| `xulosa` | `gaplashildi` da ha | 1–2000 belgi |
| `vada` | yo'q | `{ kun, summa? }` — faqat `natija = gaplashildi` bilan |
| `vada.kun` | | `YYYY-MM-DD`; bugundan (Toshkent) oldin emas va 120 kundan uzoq emas |
| `vada.summa` | yo'q | 0 dan katta; berilmasa mijozning kechikkan jami summasi olinadi |
| `transkript` | yo'q | ko'pi bilan 100 000 belgi; 180 kundan keyin tozalanadi |
| `telefon` | yo'q | ko'pi bilan 32 belgi |

**Takror yuborish.** `qongiroq_id` bitta kalit (foydalanuvchi) doirasida yagona. Xuddi shu `qongiroq_id` qayta yuborilsa yozuv yangilanadi, ikkinchisi ochilmaydi — tarmoq xatosida xavfsiz qayta urinish mumkin.

**Va'da qoidasi.** Va'da har doim qo'ng'iroq yozuvida saqlanadi. Qo'shimcha:

- mijozda Telegram suhbati bo'lsa — va'da to'lov va'dalari tizimiga ham tushadi (kuzatuv, buzilganini aniqlash, hisobot o'zi ishlaydi). Ochiq va'da bor bo'lib kun va summa bir xil bo'lsa, yangisi yozilmaydi; farq qilsa, eskisi bekor qilinadi va yangisi yoziladi;
- mijozda bir nechta yoziladigan shartnoma bo'lsa — va'da bitta shartnomaga bog'lanmaydi; `summa` berilmasa mijozning jami kechikishi olinadi;
- Telegram suhbati bo'lmasa — va'da faqat qo'ng'iroq yozuvida qoladi, kuzatilmaydi;
- `vada.summa` berilmasa — mijozning kechikkan jami summasi olinadi; u ham 0 bo'lsa, va'da faqat qo'ng'iroqda qoladi.

**Javob** — JSON matn: `{ "qongiroq_id": "…", "saqlandi": "yangi" | "yangilandi", "vada": … }`. `vada` qiymatlari:

- `yozildi` — va'da to'lov va'dalari tizimiga yozildi;
- `ozgarmadi` — shunday va'da allaqachon bor, yangisi ochilmadi;
- `faqat_qongiroqda` — faqat qo'ng'iroq yozuvida saqlandi (Telegram suhbati yo'q yoki summa 0);
- `yoq` — va'da berilmagan.

**Xatolar** MCP asbob xatosi (`isError: true`) sifatida o'zbekcha matn bilan qaytadi: ruxsat yo'q, chegara oshdi, shartnoma topilmadi, qiymat noto'g'ri (masalan `gaplashildi` da xulosa yo'q, `vada` boshqa natija bilan, `vada.kun` o'tgan yoki 120 kundan uzoq), ichki xato.

## Chegaralar

- Chegara bitta foydalanuvchiga: har platforma kaliti alohida foydalanuvchi (bitta platforma kaliti = bitta alohida foydalanuvchi). Daqiqasiga 60 chaqiruv.
- Chegara oshsa, ruxsat yo'q bo'lsa yoki shartnoma topilmasa, xato MCP asbob xatosi sifatida (`isError: true`) o'zbekcha matn bilan qaytadi — HTTP `403` yoki `429` emas.
- Faqat aniq shartnoma raqami bo'yicha; ro'yxat yoki qidiruv yo'q.
- Chegara ikki asbobga umumiy: `qongiroq_oldi` va `qongiroq_natijasi` birgalikda daqiqasiga 60 chaqiruv.
- Har chaqiruv — rad etilgani ham (ruxsat yo'q, chegara, topilmadi, noto'g'ri qiymat) — natijasi bilan Debitor amallar jurnaliga yoziladi (`calls.brief`, `calls.record`). Istisno: asbobning kirish sxemasiga mos kelmagan so'rov (noto'g'ri tur, noma'lum `natija`, juda uzun maydon) asbob ishga tushmasdan MCP qatlamida rad etiladi va jurnalga YOZILMAYDI; asbobga yetib kelgan har so'rov jurnalga yoziladi.
- Transkript 180 kundan keyin avtomatik tozalanadi; xulosa va boshqa maydonlar qoladi.

## Keyingi bosqich

Qo'ng'iroqlarni ko'rish va boshqarish paneli (3-bosqich) — spec: `docs/superpowers/specs/2026-10-14-qongiroq-mcp-design.md`.
