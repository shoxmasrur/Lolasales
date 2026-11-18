# LolaSales

Telegram orqali onlayn kurs sotuvchi AI agent va uni kuzatish uchun Telegram-messenjerga
o'xshash dashboard. Agent mijozlar (leadlar) bilan **faqat shaxsiy chatda** gaplashadi:
ehtiyojni aniqlaydi, kursni tushuntiradi, to'lov uchun karta yuboradi va chekni menejer
tasdiqlashiga uzatadi. To'lov tasdiqlangach kursning yopiq guruh havolasi yuboriladi.

- **Agent** — Claude Agent SDK (akkauntga OpenAI modeli ham biriktirilishi mumkin).
- **Telegram** — MTProto (userbot): mijozga shaxsiy akkauntdan yoziladi.
- **Baza** — PostgreSQL (`lolasales`).
- **Struktura** — qatlamli arxitektura (domain → application → infrastructure → presentation).

Asosiy qoidalar:

- Karta raqami va guruh havolasini **LLM yozmaydi** — ular Sozlamalar yoki kurs
  ma'lumotidan tizim xabari sifatida aniq yuboriladi.
- Menejer chekni tasdiqlamaguncha agent "to'lov qabul qilindi" demaydi va havola bermaydi.
- Guruh va kanallarga hech narsa yozilmaydi.
- Yuborish limitlari, pauzalar va ish vaqti oynasi barcha chiquvchi xabarlarga amal qiladi.

---

## 1. Talablar va o'rnatish

| Nima | Versiya | Izoh |
|------|---------|------|
| Node.js | 20.10+ (22 tavsiya) | `.nvmrc` da 22 ko'rsatilgan |
| PostgreSQL | 14+ | `pgcrypto` kengaytmasi avtomatik yoqiladi |
| Telegram `api_id` / `api_hash` | — | [my.telegram.org](https://my.telegram.org) → **API development tools** |
| Anthropic API kaliti yoki Claude obuna tokeni | — | [console.anthropic.com](https://console.anthropic.com) |

```bash
nvm use            # Node 22
npm install
cp .env.example .env
```

`.env` da to'ldirilishi shart bo'lganlar:

```
PORT=4200
WEB_ORIGIN=http://localhost:5174
DATABASE_URL=postgres://user@localhost:5432/lolasales
JWT_SECRET=<uzun tasodifiy satr>
ENCRYPTION_KEY=<uzun tasodifiy satr — Telegram sessiyalari shu bilan shifrlanadi>
ADMIN_EMAIL=admin@lolasales.uz
ADMIN_PASSWORD=<kuchli parol>
TELEGRAM_API_ID=<my.telegram.org dan>
TELEGRAM_API_HASH=<my.telegram.org dan>
ANTHROPIC_API_KEY=<sk-ant-api… bilan boshlansa>
CLAUDE_CODE_OAUTH_TOKEN=<sk-ant-oat… bilan boshlansa>
```

> `sk-ant-api…` — API kalit → `ANTHROPIC_API_KEY`; `sk-ant-oat…` — Claude Code obuna
> tokeni (`claude setup-token`) → `CLAUDE_CODE_OAUTH_TOKEN`. `AGENT_AUTH_MODE=auto` da
> tur prefiksdan aniqlanadi.

> ⚠️ `ENCRYPTION_KEY` keyin o'zgartirilsa, saqlangan Telegram sessiyalari o'qilmay qoladi va
> akkauntlarga qaytadan kirish kerak bo'ladi.

Bazani yaratish, migratsiyalar va admin foydalanuvchi:

```bash
createdb lolasales && npm run seed
```

Ishga tushirish:

```bash
npm run dev
```

- API: `http://localhost:4200` (sog'lik: `GET /health`)
- Dashboard: `http://localhost:5174`

Alohida: `npm run dev:server` / `npm run dev:web`. Produksiya: `npm run build` →
`npm start --workspace=server`.

Tekshiruvlar: `npm run typecheck` va `bash scripts/run-tests.sh` (ci.yml dagi barcha
birlik testlari; bazasiz ishlaydi).

## 2. Birinchi ishga tushirish

1. **Telegram akkaunt** — `Telegram` sahifasi → akkaunt qo'shish (telefon, kod, 2FA yoki QR).
   Kerak bo'lsa proksi va kunlik limitlarni sozlang. Akkaunt kartasida mijoz ko'radigan
   **agent ismi** beriladi. Ulangan akkauntga yozgan har bir notanish odam avtomatik
   mijoz (manba «Reklama») bo'ladi va agent darhol javob beradi.
2. **Kurs** — `Kurslar` sahifasi → kurs yarating: narx, sotuv davri, bo'lib to'lash
   (qismlar soni, birinchi qismning eng kam summasi), yopiq guruh havolasi va havola
   qachon yuborilishi (`birinchi qism` yoki `to'liq to'lov`). Kurs bazasiga dastur,
   savol-javob va e'tirozlarga javoblarni qo'shing — agent faqat shu ma'lumotdan gapiradi.
3. **Karta** — `Sozlamalar` → *To'lov kartalari*: raqam, egasi, bank. Agent mijoz rozi
   bo'lganda birinchi faol kartani tizim xabari bilan yuboradi.
4. **Mijozlarga chiqish** — ikki yo'l:
   - **Kampaniya** — `Import` sahifasida Excel/CSV (ism, telefon, ixtiyoriy kurs) yuklang,
     so'ng `Kampaniyalar` (yoki `Mijozlar` → belgilab *Suhbat boshlash*): Telegramdan
     qidirish va birinchi xabar limit, pauza va ish vaqti oynasi bilan ketadi.
   - **Guruhlar** — `Guruhlar` sahifasida akkaunt a'zo kanal postlari ostidagi izohlar
     kalit so'zlar bo'yicha saralanadi; tanlanganlar mijoz (manba «Guruh») bo'ladi va
     ularga birinchi shaxsiy xabar kampaniya orqali ketadi.

Mijoz chek yuborsa, u Dashboard va `Suhbatlar` → *Chek keldi* filtrida navbatga tushadi.
Menejer summani kiritib **Tasdiqlaydi** (xarid `To'ladi` yoki `Qisman to'ladi` bo'ladi,
agent rahmat aytadi, qoida bajarilsa havola ketadi) yoki sababini yozib **Rad etadi**.

Xarid bosqichlari: Yangi → Suhbatda → Qiziqdi → Karta yuborildi → Chek keldi →
(Qisman to'ladi →) To'ladi, alohida Rad etdi. `Qiziqdi` yoki `Karta yuborildi`
bosqichida jim qolgan mijozga har bosqich uchun bitta yumshoq eslatma ketadi
(`Sozlamalar` → *Eslatma*, standart 24 soat).

## 3. Bo'limlar

| Bo'lim | Nima bor |
|--------|----------|
| Boshqaruv paneli | Sotuv voronkasi, bugungi mijozlar manbalar bo'yicha, bugun tasdiqlangan to'lovlar, navbatdagi cheklar |
| Suhbatlar | Chapda suhbatlar, o'rtada yozishma, o'ngda mijoz kartasi (bosqich, manba, kurs, izoh, chek). Qo'lda yozish, tahrirlash va o'chirish, agentni o'chirish, agentga topshiriq, qayta urinish |
| Mijozlar | Filtrlar (bosqich, manba, kurs, Telegram holati, akkaunt, qidiruv), qo'lda mijoz qo'shish, ommaviy Telegram qidiruvi va suhbat boshlash, Excel eksport, savat |
| Kurslar | Kurslar va ularning ma'lumot bazasi |
| Guruhlar | Kanal izohlaridan lead olish |
| Kampaniyalar | Filtr bo'yicha nishonlar va rejalashtirilgan birinchi xabarlar |
| Import | Mijozlar fayli (ism, telefon, kurs) va importni qaytarish |
| Agent | Prompt, qoidalar va saboqlar |
| Telegram | Akkauntlar, proksi, limitlar, spam holati |
| Telegram qutisi | Akkauntning Telegramdagi barcha suhbatlari (alohida ruxsat) |
| Tizim jurnali | Xato va ogohlantirishlar, Telegram audit izi |
| Foydalanuvchilar | Foydalanuvchilar, rollar va ruxsatlar, API kalitlari |
| Sozlamalar | Yuborish tezligi va oyna, kill switch, agent avto-javobi, persona ismi, akkaunt navbati, AI modellar va OpenAI kaliti, to'lov kartalari, eslatma, guruh kalit so'zlari, kunlik xulosa boti, sinov reseti |

## 4. Ban riskini kamaytiruvchi qatlamlar

1. **Global to'xtatish** (`Sozlamalar`) — bir tugma bilan hamma yuborish to'xtaydi.
2. **Ish vaqti oynasi** — sukut bo'yicha 09:00–19:00, dushanba–shanba (Asia/Tashkent).
3. **Kunlik limitlar** — har akkaunt uchun yangi suhbatlar va telefon qidiruvlari alohida.
4. **Tasodifiy pauza** — mijozlar orasida va akkauntning har ikki so'rovi orasida.
5. **Avtomatik pauza** — `PEER_FLOOD` yoki blokirovkada to'xtash, `FLOOD_WAIT` da kutish.

Bitta mijoz — bitta akkaunt, suhbat oxirigacha: yozishmasi boshlangan mijozning akkaunti
o'zgarmaydi.

## 5. Rasm, ovoz va fayllar

Ovozli xabar STT (Nai) orqali matnga o'giriladi. Rasm va PDF vision bilan tasniflanadi:
chek bo'lsa chek tekshiruvi ochiladi va agent "qabul qildim, tekshirib chiqamiz" deydi —
to'lovni faqat menejer tasdiqlaydi. Fayllar statik papkadan berilmaydi: har so'rov
(`GET /api/media/:messageId`) avtorizatsiyadan o'tadi.

## 6. Agentni sinab ko'rish

```bash
npm run try-agent --workspace=server
```

## 7. Deploy va baza zaxirasi

Serverda: `scripts/deploy.sh` (kod `/opt/lolasales`, xizmat `lolasales`, deploy oldidan
`/var/backups/lolasales/db-*.sql.gz` zaxira). Soatlik zaxira — `scripts/backup.sh`,
systemd unitlari `scripts/systemd/lolasales-backup.{service,timer}`:

```bash
sudo mkdir -p /var/backups/lolasales && sudo chown lolasales:lolasales /var/backups/lolasales
sudo cp /opt/lolasales/scripts/systemd/lolasales-backup.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now lolasales-backup.timer
```

`.env` da `BACKUP_BOT_TOKEN`, `BACKUP_CHAT_ID` berilsa zaxira yopiq Telegram guruhiga ham
yuboriladi. Tiklash:

```bash
sudo systemctl stop lolasales
gunzip -c /var/backups/lolasales/hourly-20261020-1400.sql.gz | psql "$DATABASE_URL"
sudo systemctl start lolasales
```

## 8. LLM o'qitish ma'lumotlari (Telegram eksporti)

Eski yozishmalar (Telegram HTML eksporti → `data/tg_export_text/*.jsonl`) va ovozli
xabarlar matni (Nai.uz STT) asosida fine-tuning ma'lumotlari tayyorlanadi. `data/` papkasi
mijozlarning haqiqiy yozishmalarini saqlaydi va **git'ga qo'shilmaydi**.

```bash
npm run data:transcribe   # ovozlarni matnga o'giradi (davom ettiriladigan; limit 60 so'rov/daq)
npm run data:build        # data/training/ ga finetune_train.jsonl, finetune_val.jsonl, stats.json yozadi
```

```bash
npm run data:knowledge    # data/knowledge/ ga uslub profili, e'tiroz javoblari, FAQ qoralamalari
```

`data:knowledge` — agentni fine-tuning'siz yaxshilash yo'li: natijalar qoralama bo'lib, kurs
faktlarini (narx, sana, manzil) odam tekshirgach bilim bazasi va uslub qoidalariga kiritiladi.

Rollar: menejer «Lola Zunnunova Menejer» = `assistant`, mijoz = `user`. Karta va telefon
raqamlari niqoblanadi. Tafsilot: `data/training/README.md`.

## 9. Ma'lum cheklovlar

- **Maxfiylik sozlamasi** — mijoz raqam bo'yicha qidiruvni yopgan bo'lsa, uni topib
  bo'lmaydi (`privacy_restricted`).
- **Bitta server nusxasi** — hodisa shinasi (`InMemoryEventBus`) jarayon ichida ishlaydi.
