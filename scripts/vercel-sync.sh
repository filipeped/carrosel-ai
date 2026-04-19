#!/usr/bin/env bash
# Sincroniza .env.local com o projeto Vercel carrosel-ai e redeploya.
# Uso:  VERCEL_TOKEN=vcp_... bash scripts/vercel-sync.sh
# (ou exporte antes). Nenhum secret fica no arquivo.

set -euo pipefail
: "${VERCEL_TOKEN:?VERCEL_TOKEN nao setado. Exporte antes de rodar.}"

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "ERRO: .env.local nao existe"; exit 1
fi

echo "==> Linkando repo ao projeto carrosel-ai..."
vercel link --yes --project carrosel-ai --token "$VERCEL_TOKEN"

add_env () {
  local name="$1" value="$2"
  [ -z "$value" ] && return 0
  echo "  - $name"
  for env in production preview development; do
    vercel env rm  "$name" "$env" --token "$VERCEL_TOKEN" -y 2>/dev/null || true
    printf '%s' "$value" | vercel env add "$name" "$env" --token "$VERCEL_TOKEN" >/dev/null
  done
}

echo "==> Lendo .env.local e setando envs..."
while IFS='=' read -r k v; do
  [[ "$k" =~ ^[A-Z_]+$ ]] || continue
  # remove aspas se houver
  v="${v%\"}"; v="${v#\"}"
  add_env "$k" "$v"
done < .env.local

echo "==> Redeploy producao..."
vercel --prod --token "$VERCEL_TOKEN" --yes
echo ""
echo "Pronto. https://carrosel-ai.vercel.app"
