#!/usr/bin/env bash
#
# Soatlik baza zaxirasi → BACKUP_DIR va yopiq Telegram guruhi.
#
# systemd timer (debitor-backup.timer) har soat chaqiradi, qo'lda ham
# ishlatsa bo'ladi:  ./scripts/backup.sh
#
# Nega bash, ilova ichidagi rejalashtiruvchi emas: zaxira aynan ilova
# ishlamay qolgan paytda kerak bo'ladi. `debitor` xizmati yiqilsa yoki
# build buzilsa, ilova ichidagi timer ham to'xtardi.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${ENV_FILE:-$ROOT/.env}

# .env ni `source` qilmaymiz. Ikki sabab: u ixtiyoriy shell kodini
# bajaradi, va izohlardagi apostroflar ("o'zgartirsangiz") qatorni
# ochilmagan qo'shtirnoq deb qabul qildiradi. Kerakli kalitlarnigina
# nuqtali o'qiymiz.
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 |
    sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
  return 0
}

DATABASE_URL=${DATABASE_URL:-$(env_get DATABASE_URL)}
BOT_TOKEN=${BACKUP_BOT_TOKEN:-$(env_get BACKUP_BOT_TOKEN)}
CHAT_ID=${BACKUP_CHAT_ID:-$(env_get BACKUP_CHAT_ID)}
BACKUP_DIR=${BACKUP_DIR:-$(env_get BACKUP_DIR)}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/debitor}
KEEP=${BACKUP_KEEP:-$(env_get BACKUP_KEEP)}
KEEP=${KEEP:-48}
API_BASE=${TELEGRAM_API_BASE:-https://api.telegram.org}
TZ_NAME=${TIMEZONE:-Asia/Tashkent}

# Bot API sendDocument cheki — 50 MB. 45 dan oshsa yubormay, ogohlantiramiz:
# limitdan oshgan so'rov tushunarsiz xato qaytaradi.
#
# Chegara o'zgaruvchi qilingan, chunki bu tarmoq odatdagi ishda hech
# qachon yurmaydi — ya'ni buzilgani ham faqat kerak bo'lgan kuni
# ma'lum bo'lardi. Sinov uni past qiymat bilan tekshiradi.
MAX_BYTES=${BACKUP_MAX_BYTES:-$((45 * 1024 * 1024))}

if [ -z "$DATABASE_URL" ]; then
  echo "XATO: DATABASE_URL topilmadi ($ENV_FILE)" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# `flock` GNU-ga xos — macOS'da yo'q. `mkdir` atomar va hamma joyda bor.
LOCK="$BACKUP_DIR/.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "Oldingi zaxira hali tugamagan — bu safar o'tkazib yuborildi" >&2
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

STAMP=$(TZ="$TZ_NAME" date +%Y%m%d-%H%M)
HUMAN=$(TZ="$TZ_NAME" date '+%d.%m.%Y %H:%M')
FILE="$BACKUP_DIR/hourly-$STAMP.sql.gz"

# URL'dan baza nomi: …/debitor_agent02?sslmode=… → debitor_agent02
DB_NAME=${DATABASE_URL##*/}
DB_NAME=${DB_NAME%%\?*}

notify() {
  [ -n "$BOT_TOKEN" ] && [ -n "$CHAT_ID" ] || return 0
  curl -sS -m 30 -o /dev/null \
    -d chat_id="$CHAT_ID" --data-urlencode text="$1" \
    "$API_BASE/bot$BOT_TOKEN/sendMessage" || true
}

# ─── Dump ──────────────────────────────────────────────────────────────
#
# Avval `.part` ga yozamiz va faqat muvaffaqiyatda o'z nomiga
# ko'chiramiz. Shunda yarim yozilgan arxiv hech qachon `hourly-*.sql.gz`
# nomida ko'rinmaydi (u borga o'xshab turardi), va yiqilgan urinish
# o'sha daqiqadagi mavjud zaxirani o'chirib yubormaydi.
#
# `set -e` ni vaqtincha o'chiramiz: quvurning qaysi bo'g'ini yiqilganini
# PIPESTATUS orqali aniq bilishimiz kerak.
set +e
pg_dump "$DATABASE_URL" | gzip > "$FILE.part"
DUMP_STATUS=("${PIPESTATUS[@]}")
set -e

if [ "${DUMP_STATUS[0]}" -ne 0 ] || [ "${DUMP_STATUS[1]}" -ne 0 ]; then
  rm -f -- "$FILE.part"
  notify "⚠️ Backup olinmadi ($HUMAN): pg_dump xatosi"
  echo "XATO: pg_dump yiqildi" >&2
  exit 1
fi

mv -f -- "$FILE.part" "$FILE"

BYTES=$(wc -c < "$FILE" | tr -d ' ')
SIZE=$(awk -v b="$BYTES" 'BEGIN { printf "%.1f MB", b / 1048576 }')

# ─── Telegramga ────────────────────────────────────────────────────────
SEND_FAILED=0
if [ -z "$BOT_TOKEN" ] || [ -z "$CHAT_ID" ]; then
  echo "BACKUP_BOT_TOKEN yoki BACKUP_CHAT_ID bo'sh — faqat lokal nusxa" >&2
elif [ "$BYTES" -gt "$MAX_BYTES" ]; then
  notify "⚠️ Zaxira Telegramga sig'madi ($HUMAN, $SIZE). Fayl serverda: $FILE"
else
  curl -sS -f -m 300 -o /dev/null \
    -F chat_id="$CHAT_ID" \
    -F caption="🗄 $DB_NAME · $HUMAN · $SIZE" \
    -F document=@"$FILE" \
    "$API_BASE/bot$BOT_TOKEN/sendDocument" || SEND_FAILED=1
fi

# ─── Eskilarini tozalash ───────────────────────────────────────────────
#
# Yuborish yiqilgan bo'lsa ham bajariladi — aks holda Telegram uzilib
# qolgan kuni disk to'lib ketadi.
#
# `hourly-` prefiksi ataylab: deploy.sh o'zining `db-*` fayllarini
# alohida sanaydi, ikki to'plam bir papkada bir-biriga tegmaydi.
{ ls -1t "$BACKUP_DIR"/hourly-*.sql.gz 2>/dev/null || true; } |
  tail -n +$((KEEP + 1)) |
  while read -r old; do rm -f -- "$old"; done

if [ "$SEND_FAILED" -ne 0 ]; then
  echo "XATO: Telegramga yuborilmadi. Lokal nusxa: $FILE" >&2
  exit 1
fi

echo "$FILE ($SIZE)"
