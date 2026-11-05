#!/usr/bin/env bash
# Calls the app's cron routes, so a single Railway cron service can drive them.
#
#   APP_URL=https://your-app.up.railway.app \
#   CRON_TOKEN_SVP_RESULTS=... CRON_TOKEN_MESSAGING=... \
#   CRON_TOKEN_EXAM_SMS=... CRON_TOKEN_SVP_PENDING_CANCEL=... \
#   bash scripts/cron-ping.sh all
#
# Or one route at a time (use one Railway cron service per schedule):
#   APP_URL=... CRON_TOKEN_SVP_RESULTS=... bash scripts/cron-ping.sh svp-results
#
# Tokens are the per-route values verified by the verify_cron_token() database
# function. They are not the LOVABLE_CRON_SECRET.
set -euo pipefail

routes=(svp-results messaging exam-sms svp-pending-cancel)

app_url="${APP_URL:?APP_URL is required, for example https://your-app.up.railway.app}"
target="${1:-all}"

if [[ "$target" == "all" ]]; then
  selected=("${routes[@]}")
else
  selected=("$target")
fi

token_for() {
  local name="${1//-/_}"
  local var="CRON_TOKEN_${name^^}"
  local value="${!var:-}"
  if [[ -z "$value" ]]; then
    echo "missing $var" >&2
    return 1
  fi
  printf '%s' "$value"
}

status=0
for route in "${selected[@]}"; do
  if ! token="$(token_for "$route")"; then
    status=1
    continue
  fi
  code="$(
    curl -sS -m 120 -o "/tmp/cron-${route}.json" -w '%{http_code}' \
      -X POST \
      -H "Authorization: Bearer ${token}" \
      "${app_url%/}/api/public/cron/${route}"
  )"
  if [[ "$code" == "200" ]]; then
    echo "ok   ${route}: $(cat "/tmp/cron-${route}.json")"
  else
    echo "fail ${route}: HTTP ${code} $(cat "/tmp/cron-${route}.json")" >&2
    status=1
  fi
done

exit "$status"
