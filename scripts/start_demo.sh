#!/usr/bin/env bash
# Start DeepGuard demo with ngrok tunnel for AI service
# Usage: bash scripts/start_demo.sh
# Prerequisites: ngrok installed and authenticated

set -euo pipefail

echo ""
echo "🚀  Starting DeepGuard Demo"
echo "════════════════════════════"

# 1. Start AI service
cd ai-service
if [[ ! -d venv ]]; then
  echo "Creating Python venv…"
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt -q
else
  source venv/bin/activate
fi

echo "Starting AI service…"
uvicorn main:app --host 0.0.0.0 --port 8000 &
AI_PID=$!
echo "AI Service PID: $AI_PID"
cd ..

# 2. Wait for AI service to load models
echo "Waiting for models to load…"
for i in {1..20}; do
  if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    echo "AI service ready ✓"
    break
  fi
  sleep 3
done

# 3. Start ngrok tunnel
echo "Starting ngrok tunnel…"
ngrok http 8000 --log=stdout > /tmp/ngrok.log &
NGROK_PID=$!
sleep 4

# 4. Extract public URL
NGROK_URL=$(curl -sf http://localhost:4040/api/tunnels \
  | python3 -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print(next(t['public_url'] for t in t if t['proto']=='https'))" 2>/dev/null || echo "")

echo ""
echo "═══════════════════════════════════════"
echo "  ✅ DeepGuard Demo Ready!"
echo ""
if [[ -n "$NGROK_URL" ]]; then
  echo "  AI Service (public): $NGROK_URL"
  echo ""
  echo "  ⚡ Update Render backend env var:"
  echo "     AI_SERVICE_URL=$NGROK_URL"
else
  echo "  Could not get ngrok URL — check http://localhost:4040"
fi
echo ""
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5000"
echo "  AI Docs:  http://localhost:8000/docs"
echo "  Press Ctrl+C to stop all services"
echo "═══════════════════════════════════════"

# Cleanup on exit
trap "echo ''; echo 'Stopping services…'; kill $AI_PID $NGROK_PID 2>/dev/null || true; echo 'Done.'" EXIT
wait
