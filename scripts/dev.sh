#!/bin/bash
# Скрипт запуска dev-окружения с показом ngrok URL

cd /home/artem/planer

# Убить старые процессы
pkill -f ngrok 2>/dev/null
pkill -f "bun.*index.ts" 2>/dev/null  
pkill -f "bun.*dev.ts" 2>/dev/null
sleep 1

# Запустить ngrok в фоне
ngrok start --all --config "/home/artem/.config/ngrok/ngrok.yml" &>/dev/null &
sleep 3

# Получить URL
NGROK_URL=$(curl -s localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$NGROK_URL" ]; then
    echo "❌ Ngrok не запустился!"
    exit 1
fi

echo ""
echo "=================================================="
echo "🚀 LAZYFLOW DEV ENVIRONMENT"
echo "=================================================="
echo ""
echo "📡 NGROK URL: $NGROK_URL"
echo ""
echo "📋 Скопируй URL и вставь в:"
echo "   1. .env → APP_URL, MINI_APP_URL, GOOGLE_REDIRECT_URI"
echo "   2. frontend/index.html → window.LAZYFLOW_API_BASE_URL"
echo "   3. BotFather → /setmenubutton"
echo ""
echo "=================================================="
echo ""

# Обновить .env автоматически
sed -i "s|APP_URL=.*|APP_URL=$NGROK_URL|" /home/artem/planer/.env
sed -i "s|MINI_APP_URL=.*|MINI_APP_URL=$NGROK_URL|" /home/artem/planer/.env
if grep -q '^GOOGLE_REDIRECT_URI=' /home/artem/planer/.env; then
    sed -i "s|GOOGLE_REDIRECT_URI=.*|GOOGLE_REDIRECT_URI=$NGROK_URL/google/callback|" /home/artem/planer/.env
else
    echo "GOOGLE_REDIRECT_URI=$NGROK_URL/google/callback" >> /home/artem/planer/.env
fi

# Обновить frontend/index.html
sed -i "s|window.LAZYFLOW_API_BASE_URL = \"[^\"]*\"|window.LAZYFLOW_API_BASE_URL = \"$NGROK_URL\"|" /home/artem/planer/frontend/index.html

echo "✅ .env (включая GOOGLE_REDIRECT_URI) и frontend/index.html обновлены автоматически!"
echo ""
echo "📱 NGROK URL: $NGROK_URL"
echo ""
echo "⏳ Запускаю backend и frontend..."
sleep 1

tmux kill-session -t lazyflow 2>/dev/null
tmux new-session -d -s lazyflow -c /home/artem/planer
tmux send-keys -t lazyflow "bun run src/index.ts" Enter
tmux split-window -h -t lazyflow -c /home/artem/planer/frontend
tmux send-keys -t lazyflow "bun run dev" Enter

sleep 1
tmux attach -t lazyflow
