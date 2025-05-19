@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Starting WhatsApp Bot
echo ========================================
echo.

REM Check and kill processes using port 3000
echo Checking for processes using port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    set PID=%%a
    echo Found process using port 3000: PID !PID!
    echo Killing process...
    taskkill /f /pid !PID! > nul 2>&1
    timeout /t 1 /nobreak > nul
)

echo Port cleanup complete.
echo.

echo Starting WhatsApp Bot...
start cmd /k "npm start"
echo.

echo ========================================
echo Services are starting up:
echo.
echo WhatsApp Bot available at: http://localhost:3000
echo  (or an alternative port if 3000 is in use)
echo.
echo TROUBLESHOOTING:
echo - If you encounter any issues, restart with:
echo   .\start-all.bat
echo - For detailed diagnostics run:
echo   .\clear-ports.bat
echo ========================================
echo.
echo Press Enter to exit this window (services will continue running)
pause > nul 