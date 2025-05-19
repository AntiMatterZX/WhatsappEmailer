@echo off
REM Default to info level if not specified
set LOG_LEVEL=%1
if "%LOG_LEVEL%"=="" set LOG_LEVEL=info

echo Stopping any running WhatsApp Bot instances...
REM Find and kill any node processes running index.js
for /f "tokens=1" %%i in ('tasklist /fi "imagename eq node.exe" /fo csv /nh') do (
  REM This will terminate all node processes, be careful in production!
  taskkill /f /im node.exe
)

echo Starting WhatsApp Bot with log level: %LOG_LEVEL%

REM Export environment variables
set NODE_ENV=development

REM Start the application
node src/index.js 