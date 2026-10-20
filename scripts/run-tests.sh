#!/usr/bin/env bash
# .github/workflows/ci.yml dagi barcha `npm run test:` qatorlarini
# ketma-ket bajaradi; birinchi xatoda to'xtaydi. Repo ildizidan ham, boshqa joydan ham ishlaydi.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Tizimdagi standart node v16 bo'lishi mumkin; nvm'dagi Node 22 PATH boshiga qo'yiladi.
NODE22="$HOME/.nvm/versions/node/v22.23.1/bin"
if [ -d "$NODE22" ]; then export PATH="$NODE22:$PATH"; fi

# ci.yml ning "Agent navbati testlari" bloki shu soxta qiymatlar bilan ishlaydi (baza kerak emas).
export DATABASE_URL="${DATABASE_URL:-postgres://ci:ci@127.0.0.1:5432/ci}"
export JWT_SECRET="${JWT_SECRET:-ci-uchun-soxta-kalit-16+}"
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-ci-uchun-soxta-kalit-16+}"

CI=.github/workflows/ci.yml
CMDS=$(grep -E '^[[:space:]]*npm run test:' "$CI" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+#.*$//; s/[[:space:]]+$//')
[ -n "$CMDS" ] || { echo "ci.yml da test buyruqlari topilmadi" >&2; exit 1; }

total=0
while IFS= read -r cmd; do
  total=$((total + 1))
  echo "==> $cmd"
  bash -c "set -e; $cmd" </dev/null
done <<< "$CMDS"
echo "OK: $total ta test o'tdi"
