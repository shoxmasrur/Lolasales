#!/usr/bin/env bash
#
# Produksiyaga chiqarish — serverning O'ZIDA bajariladi.
#
# GitHub Actions buni SSH orqali ishga tushiradi, lekin qo'lda ham
# ishlatsa bo'ladi:  ssh debitor-new 'bash -s' < scripts/deploy.sh
#
# Nima qiladi: kodni GitHub'dan tortadi, bog'liqliklarni o'rnatadi,
# build qiladi va xizmatni qayta ishga tushiradi. Migratsiyalar xizmat
# ko'tarilganda o'zi qo'llanadi.
#
# DIQQAT: `.env` va `storage/` git'da yo'q va `git reset` ularga
# tegmaydi — ular serverning o'zida qoladi.

set -euo pipefail

APP_DIR=${APP_DIR:-/opt/debitor-agent}
SERVICE=${SERVICE:-debitor}
BRANCH=${BRANCH:-main}

log() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }

cd "$APP_DIR"

# ─── Baza zaxirasi ─────────────────────────────────────────────────────
#
# Har bir deploy migratsiya olib kelishi mumkin. Zaxira arzon, buzilgan
# bazani tiklash esa qimmat. Oxirgi 10 tasi saqlanadi.
log "Baza zaxirasi"
BACKUP_DIR=/var/backups/debitor
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
sudo -u postgres pg_dump debitor_agent02 | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"
ls -1t "$BACKUP_DIR"/db-*.sql.gz | tail -n +11 | xargs -r rm --
echo "  $BACKUP_DIR/db-$STAMP.sql.gz ($(du -h "$BACKUP_DIR/db-$STAMP.sql.gz" | cut -f1))"

# ─── Kod ───────────────────────────────────────────────────────────────
log "Kodni tortish ($BRANCH)"
git fetch --prune origin
PREV=$(git rev-parse --short HEAD)
git reset --hard "origin/$BRANCH"
NEXT=$(git rev-parse --short HEAD)
echo "  $PREV → $NEXT"

# ─── Build ─────────────────────────────────────────────────────────────
#
# `--include=dev` shart: build uchun tsup va vite kerak, ular esa
# devDependencies da. Muhitda NODE_ENV=production bo'lsa `npm ci` ularni
# o'tkazib yuboradi va build "Could not resolve" deb yiqiladi.
log "O'rnatish va build"
NODE_ENV=development npm ci --include=dev
npm run build

chown -R debitor:debitor "$APP_DIR"

# ─── Ishga tushirish ───────────────────────────────────────────────────
log "Xizmatni qayta ishga tushirish"
systemctl restart "$SERVICE"

# Ko'tarilishini kutamiz — migratsiyalar shu paytda qo'llanadi.
for i in $(seq 1 30); do
  if systemctl is-active --quiet "$SERVICE" \
     && curl -sf -o /dev/null -w '' http://127.0.0.1:4200/api/health 2>/dev/null; then
    break
  fi
  # /api/health kirish talab qiladi (401) — bu ham "javob beryapti" degani.
  if systemctl is-active --quiet "$SERVICE" \
     && [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4200/api/health || true)" = "401" ]; then
    break
  fi
  sleep 2
  if [ "$i" = 30 ]; then
    echo "XATO: xizmat 60 soniyada ko'tarilmadi" >&2
    journalctl -u "$SERVICE" -n 40 --no-pager >&2
    exit 1
  fi
done

log "Tayyor"
systemctl is-active "$SERVICE"
sudo -u postgres psql -d debitor_agent02 -qtc \
  "SELECT 'oxirgi migratsiya: ' || name FROM schema_migrations ORDER BY name DESC LIMIT 1;"
