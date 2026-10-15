#!/usr/bin/env bash
# DeepGuard integration smoke test
# Usage: bash scripts/smoke_test.sh
# Run after all 3 services are started.

set -euo pipefail

BASE="http://localhost:5000/api"
AI="http://localhost:8000"
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

pass=0; fail=0

check() {
  local name=$1 result expected=$3
  result=$(eval "$2" 2>/dev/null) || result=""
  if echo "$result" | grep -q "$expected"; then
    echo -e "  ${GREEN}✓${NC} $name"
    ((pass++))
  else
    echo -e "  ${RED}✗${NC} $name"
    if [[ -n "$result" ]]; then
      echo -e "    ${YELLOW}Got: $(echo "$result" | head -c 120)${NC}"
    fi
    ((fail++))
  fi
}

echo ""
echo "🔍  DeepGuard Smoke Test"
echo "════════════════════════════════════════"

echo ""
echo "Node.js Backend"
check "Server alive"      "curl -sf $BASE/health"                         '"status":"healthy"'

echo ""
echo "Python AI Service"
check "AI alive"          "curl -sf $AI/health"                           '"status":"healthy"'
check "Image model loaded" "curl -sf $AI/health"                          '"image":true'

echo ""
echo "Authentication"
EMAIL="smoke$RANDOM@test.com"
REG=$(curl -sf -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test\",\"email\":\"$EMAIL\",\"password\":\"Test@1234!\"}")
check "Register user"     "echo '$REG'"                                   '"success":true'

TOKEN=$(echo "$REG" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null || echo "")

if [[ -n "$TOKEN" ]]; then
  check "Token received"     "echo '$TOKEN'"                              "eyJ"
  check "Protected /me"      "curl -sf -H 'Authorization: Bearer $TOKEN' $BASE/auth/me" '"success":true'
  check "Unauth blocked"     "curl -sf $BASE/auth/me"                    '"success":false'
  check "Analytics endpoint" "curl -sf -H 'Authorization: Bearer $TOKEN' $BASE/reports/analytics" '"success":true'
  check "History endpoint"   "curl -sf -H 'Authorization: Bearer $TOKEN' $BASE/history"            '"success":true'
else
  echo -e "  ${RED}✗${NC} Could not extract token — skipping auth tests"
  ((fail+=4))
fi

echo ""
echo "Security headers"
check "X-Frame-Options"       "curl -sI $BASE/health"  "X-Frame-Options"
check "X-Content-Type-Options" "curl -sI $BASE/health" "X-Content-Type-Options"

echo ""
echo "════════════════════════════════════════"
echo -e "  ${GREEN}PASSED: $pass${NC}   ${RED}FAILED: $fail${NC}"
if [[ $fail -eq 0 ]]; then
  echo -e "  ${GREEN}All checks passed! ✓${NC}"
  exit 0
else
  echo -e "  ${RED}Some checks failed. Check service logs.${NC}"
  exit 1
fi
