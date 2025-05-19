@echo off
echo Stopping any running WhatsApp services...
taskkill /f /im node.exe

echo Clearing WhatsApp session data...
rmdir /s /q .wwebjs_auth\session
rmdir /s /q .wwebjs_cache

echo Creating fresh session directories...
mkdir .wwebjs_auth\session
mkdir .wwebjs_cache

echo Starting WhatsApp service...
start cmd /k "npm run dev"

echo Done! Please scan the QR code to authenticate when it appears. 