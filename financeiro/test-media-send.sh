#!/bin/bash
# ─── Test Script: Evolution API Media Send ───
# Run this after reconnecting WhatsApp to verify media sending works
# Usage: bash test-media-send.sh [PHONE_NUMBER]
# Example: bash test-media-send.sh 5511912345678

API_URL="http://212.28.186.222:8080"
API_KEY="Virtuosa2026EvolutionKey"
INSTANCE="virtuosa"
PHONE="${1:-5511999990000}"

echo "═══════════════════════════════════════"
echo "  Evolution API Media Send Test"
echo "═══════════════════════════════════════"
echo ""

# 1. Check connection
echo "1️⃣  Checking connection status..."
STATE=$(curl -s "$API_URL/instance/connectionState/$INSTANCE" \
  -H "apikey: $API_KEY" | python3 -c "import sys,json; print(json.load(sys.stdin)['instance']['state'])" 2>/dev/null)

echo "   Status: $STATE"
if [ "$STATE" != "open" ]; then
  echo "   ❌ WhatsApp NOT connected. Please scan QR at /crm/whatsapp-connect first."
  exit 1
fi
echo "   ✅ WhatsApp connected!"
echo ""

# 2. Test text message
echo "2️⃣  Testing text message..."
TEXT_RESULT=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/message/sendText/$INSTANCE" \
  -H "apikey: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"number\":\"$PHONE\",\"text\":\"🧪 Teste automático - mensagem de texto\"}")
TEXT_HTTP=$(echo "$TEXT_RESULT" | tail -1)
TEXT_BODY=$(echo "$TEXT_RESULT" | head -n -1)

if [ "$TEXT_HTTP" = "200" ] || [ "$TEXT_HTTP" = "201" ]; then
  echo "   ✅ Text message sent! (HTTP $TEXT_HTTP)"
else
  echo "   ❌ Text failed (HTTP $TEXT_HTTP)"
  echo "   Response: $TEXT_BODY"
fi
echo ""

# 3. Test image (1x1 red pixel PNG, raw base64 - no data: prefix)
echo "3️⃣  Testing image send (raw base64)..."
IMG_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58hHgAH+AL/hY2rNAAAAABJRU5ErkJggg=="
IMG_RESULT=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/message/sendMedia/$INSTANCE" \
  -H "apikey: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"number\":\"$PHONE\",\"mediatype\":\"image\",\"media\":\"$IMG_B64\",\"caption\":\"🧪 Teste - imagem base64 raw\"}")
IMG_HTTP=$(echo "$IMG_RESULT" | tail -1)
IMG_BODY=$(echo "$IMG_RESULT" | head -n -1)

if [ "$IMG_HTTP" = "200" ] || [ "$IMG_HTTP" = "201" ]; then
  echo "   ✅ Image sent with raw base64! (HTTP $IMG_HTTP)"
else
  echo "   ❌ Image failed (HTTP $IMG_HTTP)"
  echo "   Response: $IMG_BODY"
fi
echo ""

# 4. Test image with data URI prefix (what the frontend sends before stripping)
echo "4️⃣  Testing image send (data URI - should FAIL)..."
IMG_URI="data:image/png;base64,$IMG_B64"
URI_RESULT=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/message/sendMedia/$INSTANCE" \
  -H "apikey: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"number\":\"$PHONE\",\"mediatype\":\"image\",\"media\":\"$IMG_URI\",\"caption\":\"data URI test\"}")
URI_HTTP=$(echo "$URI_RESULT" | tail -1)
URI_BODY=$(echo "$URI_RESULT" | head -n -1)

if [ "$URI_HTTP" = "200" ] || [ "$URI_HTTP" = "201" ]; then
  echo "   ⚠️  Data URI also accepted! (HTTP $URI_HTTP) — stripping prefix not required"
else
  echo "   ✅ Confirmed: data URI rejected (HTTP $URI_HTTP) — our fix is correct"
  echo "   Response: $(echo $URI_BODY | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('response',{}).get('message',['?'])[0])" 2>/dev/null || echo "$URI_BODY")"
fi
echo ""

# 5. Test document
echo "5️⃣  Testing document send..."
# Small text file as base64
DOC_B64=$(echo "Teste de documento - Virtuosa CRM" | base64)
DOC_RESULT=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/message/sendMedia/$INSTANCE" \
  -H "apikey: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"number\":\"$PHONE\",\"mediatype\":\"document\",\"media\":\"$DOC_B64\",\"fileName\":\"teste.txt\",\"mimetype\":\"text/plain\",\"caption\":\"🧪 Teste - documento\"}")
DOC_HTTP=$(echo "$DOC_RESULT" | tail -1)
DOC_BODY=$(echo "$DOC_RESULT" | head -n -1)

if [ "$DOC_HTTP" = "200" ] || [ "$DOC_HTTP" = "201" ]; then
  echo "   ✅ Document sent! (HTTP $DOC_HTTP)"
else
  echo "   ❌ Document failed (HTTP $DOC_HTTP)"
  echo "   Response: $DOC_BODY"
fi
echo ""

# 6. Test via our Next.js API (end-to-end)
echo "6️⃣  Testing via CRM API (end-to-end)..."
CRM_RESULT=$(curl -s -w "\n%{http_code}" -X POST "https://financeiro-blush-nine.vercel.app/api/whatsapp/evolution" \
  -H "Content-Type: application/json" \
  -d "{\"remoteJid\":\"${PHONE}@s.whatsapp.net\",\"unit\":\"Barueri\",\"mediaBase64\":\"data:image/png;base64,$IMG_B64\",\"mediaType\":\"image\",\"mimetype\":\"image/png\",\"fileName\":\"test.png\",\"caption\":\"🧪 Teste E2E via CRM\"}")
CRM_HTTP=$(echo "$CRM_RESULT" | tail -1)
CRM_BODY=$(echo "$CRM_RESULT" | head -n -1)

if [ "$CRM_HTTP" = "200" ] || [ "$CRM_HTTP" = "201" ]; then
  SUCCESS=$(echo "$CRM_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null)
  if [ "$SUCCESS" = "True" ]; then
    echo "   ✅ End-to-end CRM media send works! (HTTP $CRM_HTTP)"
  else
    echo "   ❌ CRM returned error: $CRM_BODY"
  fi
else
  echo "   ❌ CRM API failed (HTTP $CRM_HTTP)"
  echo "   Response: $CRM_BODY"
fi
echo ""

echo "═══════════════════════════════════════"
echo "  Test Complete"
echo "═══════════════════════════════════════"
