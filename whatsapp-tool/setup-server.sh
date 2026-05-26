#!/bin/bash
set -e

echo "=== מתקין Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "=== מתקין Chrome ==="
wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt-get install -y /tmp/chrome.deb || sudo apt-get install -f -y
rm /tmp/chrome.deb

echo "=== מתקין תלויות מערכת ==="
sudo apt-get install -y libgbm-dev libxkbcommon-x11-0 libgtk-3-0 libnss3 libasound2

echo "=== מתקין PM2 ==="
sudo npm install -g pm2

echo "=== מתקין dependencies של הפרויקט ==="
cd /root/whatsapp-tool
npm install

echo "=== מגדיר PM2 startup ==="
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

echo ""
echo "✓ התקנה הושלמה!"
echo ""
echo "עכשיו הרץ:"
echo "  cd /root/whatsapp-tool"
echo "  pm2 start ecosystem.config.js"
echo "  pm2 save"
echo "  pm2 logs brain-bot"
echo ""
echo "סרוק את ה-QR code שיופיע בלוגים עם הוואטסאפ שלך."
