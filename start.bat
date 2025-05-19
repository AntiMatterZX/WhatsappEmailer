@echo off
REM Default to info level if not specified
set LOG_LEVEL=%1
if "%LOG_LEVEL%"=="" set LOG_LEVEL=info

echo Starting WhatsApp Bot with log level: %LOG_LEVEL%

REM Export environment variables
set NODE_ENV=development
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

REM Start the application
echo Starting WhatsApp Bot...
node src/index.js 