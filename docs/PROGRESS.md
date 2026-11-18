# LolaSales — ish holati (2026-11-18 holatiga)

## Qisqacha
Telegram orqali kurs/seminar sotuvchi AI agent. Agent Claude Agent SDK orqali ishlaydi,
xulqi prompt, qoidalar va kurs bilim bazasi bilan boshqariladi (TZ: `docs/superpowers/specs/`).
**LLM'ni fine-tune qilish TZ'da talab qilinmagan** — eski suhbatlar agentni prompt/bilim bazasi
orqali yaxshilash (A yo'li) uchun ishlatiladi. Fine-tuning ma'lumotlari zaxira sifatida tayyor.

## Bajarilgan ishlar
1. **STT provayderi Aisha → Nai.uz** (`NaiSpeechToText`), eski nomlar tozalandi, typecheck va 94 ta test o'tadi.
2. **Telegram eksporti** (`~/Desktop/tg_export`, HTML) JSON'ga o'girilgan: `data/tg_export_text/`
   (`messages.jsonl` 189 761 xabar, `chats.jsonl` 11 344 chat).
3. **Barcha ovozli xabarlar matnga o'girildi** (Nai.uz, ~15 118 ta, ~84 soat audio) → `transcripts.jsonl`.
   Limit 60 so'rov/daq; 29 ta ovoz bo'sh (sukunat). Balansdan ~27 000 birlik qoldi.
4. **LLM o'qitish ma'lumotlari** `data/training/`: `finetune_train.jsonl` (9 137), `finetune_val.jsonl` (541),
   `conversations.jsonl`. Filtrlar: shablon cheklovi, media-only olib tashlangan, ichki chatlar chiqarilgan,
   karta/telefon/havola niqoblangan.
5. **A yo'li qoralamalari** `data/knowledge/`: `style_profile.json`, `objection_playbook.json`,
   `faq_candidates.json`, `winning_examples.jsonl`, `course_draft_yaxshiyam_borsan.json`.
6. **Agent qoidalariga qo'shildi** (`knowledgeBase.ts`): 3 ta e'tiroz misoli (ishonch, ertaga to'layman,
   muvofiqlik) va 2 ta uslub bandi (ayol auditoriya/ovoz).
7. **Lokal baza tayyorlandi** (`lolasales`): migratsiyalar (8 ta) + admin (`npm run seed`), kurs va 11 ta bilim
   yozuvi kiritildi, agent qoidalari seed qilindi. Server va dashboard ishga tushib tekshirilgan.

## Hozirgi kurs (bazada)
«Yaxshiyam borsan» jonli seminari (Lola Zunnunova), **21-noyabr 2026, 10:30**, Urganch, Horizon Haven Hotel
(Al-Xorazmiy ko'chasi, 48B), zal ~100 kishi. Sotuv davri 2026-11-01 … 2026-11-21.
- Qatorlar bo'yicha narx: 1-qator 1 200 000; 2–3 — 1 000 000; 4 — 650 000; 5–7 — 500 000; 8 — 300 000 so'm.
- `price` maydoni = 300 000 (eng arzon qator; tizimda >0 bo'lishi shart).
- Bo'lib to'lash: **oldindan minimal to'lov 200 000 so'm**, qismlar 2, havola birinchi qismdan keyin.
- Chegirma yo'q (TZ). Menejer ba'zan qo'lda chegirma qilgan — agentga kiritilmagan.

## Ishni davom ettirish tartibi (ertaga shu yerdan)
1. **Serverni ishga tushirish:** `cd ~/Desktop/LolaSales/LolaSales && npm run dev`
   (API `:4200`, dashboard `:5174`; kirish `admin@lolasales.uz`, parol `.env` da `ADMIN_PASSWORD`).
   Baza (PostgreSQL, `lolasales`) lokal ishlab turishi kerak.
2. **Telegram akkaunt qo'shish** (keyingi asosiy qadam): dashboard → Telegram → akkaunt qo'shish
   (telefon, kod, 2FA yoki QR). `.env` da `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` bo'lishi kerak.
   Akkaunt kartasida agent ismini bering; kerak bo'lsa proksi va kunlik limitlarni sozlang.
3. **To'lov kartasi:** Sozlamalar → To'lov kartalari (raqam, egasi, bank). Agent raqamni o'zi yozmaydi.
4. **Yopiq guruh havolasi:** Kurslar → kurs → guruh havolasi (hozir bo'sh).
5. **Agentni sinash** (README §6): sinov mijozi bilan suhbat; javoblar, qator narxlari, bo'lib to'lash,
   chek oqimini tekshirish.
6. **Qoralamalarni ko'rib chiqish:** `data/knowledge/objection_playbook.json` va `faq_candidates.json` dan
   yaxshi javoblarni tanlab, bilim bazasi/qoidalarga qo'shish. Eslatma: bazada qoidalari bor bo'limlarga kod
   standartlari o'z-o'zidan qo'shilmaydi — dashboarddan qo'lda qo'shing.
7. Kelajak (ixtiyoriy): fine-tuning (B yo'li); `~/Desktop/LolaSales/LolaSales` ichma-ich papkasi,
   `__MACOSX`, ortiqcha `package-lock.json` ni tartibga solish.

## Eslatmalar
- `data/` (mijoz yozishmalari, transkriptlar, o'qitish ma'lumotlari) `.gitignore` da — **GitHub'ga chiqmaydi**;
  zaxiralab qo'ying. Eksport HTML/media: `~/Desktop/tg_export` (5,2 GB).
- Har bir o'zgarishdan keyin `main` ga push qilinadi (`shoxmasrur/Lolasales`).
- Skriptlar: `npm run data:transcribe` (davom ettiriladigan), `data:build`, `data:knowledge`.
- Ma'lumotdagi narxlar vaqt bo'yicha o'zgargan; agent faqat kurs bazasidagi joriy faktni aytadi.
