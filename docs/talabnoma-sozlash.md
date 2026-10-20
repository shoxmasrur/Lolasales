# Elektron talabnoma — serverni sozlash

Talabnoma PDF'i serverdagi headless Chrome bilan yasaladi va unga muhr, imzo
va fon rasmlari qo'yiladi. Ulardan biri yetishmasa funksiya o'chiq turadi:
sahifada "Talabnoma sozlanmagan" yozuvi chiqadi, API esa 503
`TALABNOMA_SOZLANMAGAN` qaytaradi. Server shu holatda ham ishlayveradi.

Quyidagi qadamlar serverda (`/opt/debitor-agent`) **bir marta** bajariladi.

## 1. Chrome

```bash
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb
google-chrome --version
```

`google-chrome-stable` o'rnatiladi, **snap `chromium` emas**. Ubuntu 22.04 da
`chromium` faqat snap ko'rinishida keladi: snap ichidan `/opt/debitor-agent/storage`
dagi rasmlar va `/tmp` dagi vaqtinchalik HTML ko'rinmaydi, natijada PDF bo'sh
yoki muhrsiz chiqadi.

Chrome o'rnatilgandan keyin serverni qayta ishga tushirish shart emas:
"Chrome yo'q" degan javob keshlanmaydi, keyingi so'rovda qayta tekshiriladi.

## 2. Shriftlar

```bash
sudo apt install -y fonts-liberation fonts-dejavu-core
fc-list | grep -i -E "liberation|dejavu"
```

Bu shriftlar bo'lmasa ў қ ғ ҳ harflari kvadrat bo'lib chiqadi yoki matn
ikkinchi sahifaga o'tib ketadi. Ikki sahifali talabnoma yuborilmaydi: server
uni rad etadi.

## 3. Muhr, imzo va fon rasmlari

Papka `TALABNOMA_ASSETS_DIR` (sukut bo'yicha `storage/talabnoma`, loyiha
ildiziga nisbatan, ya'ni `/opt/debitor-agent/storage/talabnoma`) ichida
aynan shu nomlar bilan turadi:

| Fayl | Nima |
|---|---|
| `fon.png` | blanka foni |
| `muhr.png` | kompaniya muhri |
| `imzo.png` | rahbar imzosi |

```bash
# O'z kompyuteringizdan:
scp fon.png muhr.png imzo.png debitor-new:/tmp/
# Serverda:
sudo mkdir -p /opt/debitor-agent/storage/talabnoma
sudo mv /tmp/fon.png /tmp/muhr.png /tmp/imzo.png /opt/debitor-agent/storage/talabnoma/
sudo chown -R debitor:debitor /opt/debitor-agent/storage/talabnoma
sudo chmod 640 /opt/debitor-agent/storage/talabnoma/*.png
```

**Muhr va imzo hech qachon repoga commit qilinmaydi** (`storage/` `.gitignore`
da). Ular faqat serverda va xavfsiz zaxirada saqlanadi.

## 4. Muhit o'zgaruvchilari (`.env`)

| O'zgaruvchi | Sukut | Qachon o'zgartiriladi |
|---|---|---|
| `TALABNOMA_ASSETS_DIR` | `storage/talabnoma` | Rasmlar boshqa papkada bo'lsa (absolyut yoki loyiha ildiziga nisbatan yo'l) |
| `TALABNOMA_CHROME_PATH` | `google-chrome` | Chrome `PATH` da bo'lmasa, masalan `/usr/bin/google-chrome-stable` |

O'zgartirilgach: `sudo systemctl restart debitor`.

## 5. Sinov renderi (`debitor` foydalanuvchisi nomidan)

Server aynan `debitor` foydalanuvchisi bilan ishlaydi — sinov ham shu
foydalanuvchidan, aks holda ruxsat xatolari ko'rinmay qoladi.

```bash
sudo -u debitor bash -c '
  cd /tmp &&
  printf "<html><body style=\"font-family:Liberation Serif\">ЎЗБЕКИСТОН: ў қ ғ ҳ Ў Қ Ғ Ҳ<img src=\"file:///opt/debitor-agent/storage/talabnoma/muhr.png\" width=120></body></html>" > t.html &&
  google-chrome --headless=new --disable-gpu --no-pdf-header-footer \
    --user-data-dir=/tmp/talabnoma-sinov --print-to-pdf=/tmp/sinov.pdf file:///tmp/t.html &&
  ls -l /tmp/sinov.pdf'
```

`/tmp/sinov.pdf` ni kompyuterga olib (`scp`) ochib ko'ring:

- ў қ ғ ҳ to'g'ri chiqqan (kvadrat yoki bo'sh joy emas);
- muhr ko'rinadi;
- hujjat **bitta sahifa**.

Keyin dashboarddagi «Talabnomalar» sahifasida biror mijozning ko'rinishini
(`ET-__`) ochib, haqiqiy blankani ham xuddi shu uch nuqta bo'yicha tekshiring.

## 6. Obyekt manzili va kompaniya INN

`contracts.object_address` va `contracts.company_inn` 132-migratsiyada
qo'shilgan va **keyingi CRM sinxida** to'ladi. Shungacha «Yuborishga tayyor»
ro'yxatidagi qatorlarda "Kompaniya INN'i / Obyekt manzili hali
sinxronlanmagan — yuborishda yangilanadi" belgisi turadi va ko'rinish
ochilmaydi. Yuborish to'silmaydi: «Yuborish» bosilganda server avval shu
shartnomani CRM'dan yangilaydi. Manzil CRM'da ham bo'lmasa, yuborish
`MALUMOT_YETISHMAYDI` bilan, INN bo'lmasa — `REKVIZIT` bilan rad etiladi va
ET raqami berilmaydi. Hisob raqami har yuborishda CRM'dan yangidan olinadi
(kompaniyalar keshi tashlanadi).

## 7. «CRM'dan yangilash» tugmasi

«Talabnomalar» sahifasi tepasidagi tugma (faqat `talabnoma.send` huquqi
bilan ko'rinadi) kechasigi sinxni kutmasdan INN yoki manzili yo'q hamma
«Yuborishga tayyor» nomzodlarini CRM'dan **fonda, bittadan** yangilaydi va
kompaniyalar (rekvizit) keshini tashlaydi.

- **Qachon bosiladi:** deploy'dan keyin (ayniqsa yangi ustunlar qo'shilganda)
  ro'yxatda "hali sinxronlanmagan" belgilari ko'p bo'lsa, yoki CRM'da
  kompaniya/hisob raqami o'zgartirilganda. Shundan keyin har qatorning
  ko'rinishini tekshirib, so'ng yuborish tavsiya etiladi.
- Ish ketayotganda tugmada «Yangilanmoqda: 45/180» ko'rinadi; tugagach
  ro'yxat o'zi yangilanadi va «Yangilandi: N, xato: M» xulosasi chiqadi.
  Xatolar (CRM'da topilmagan yoki javob bermagan shartnomalar) server
  jurnalida `scope=talabnoma-crm` bilan yoziladi.
- Bir vaqtda bitta ish: qayta bosish yangisini boshlamaydi. Kechasigi to'liq
  sinx ketayotgan bo'lsa, u tugashini kutadi.
- Holat xotirada: server qayta ishga tushsa ish to'xtaydi ("Yangilash
  to'xtadi … — qayta bosing"), qayta bosish kifoya.
- `CONTRACTS_SYNC_ENABLED=false` muhitda ish darhol "CRM sinxronizatsiyasi
  o'chirilgan" bilan tugaydi.
