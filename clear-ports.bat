@echo off
setlocal enabledelayedexpansion

echo ========================================
echo WhatsApp Bot - Port Clearing Utility
echo ========================================
echo.

REM Check port 3000 (WhatsApp Bot)
echo Checking port 3000 (WhatsApp Bot)...
set PORT_USED=0
netstat -ano | findstr :3000 > nul
if %ERRORLEVEL% EQU 0 (
    set PORT_USED=1
    echo Port 3000 is in use. Attempting to free it...
    
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
        set PID=%%a
        if defined PID (
            echo Found process on port 3000: PID !PID!
            echo Killing process...
            taskkill /f /pid !PID! 2>nul
            if !ERRORLEVEL! EQU 0 (
                echo Process terminated successfully.
            ) else (
                echo Failed to terminate process. You may need to kill it manually.
            )
        )
    )
) else (
    echo Port 3000 is free.
)

echo.
echo Port check complete.
echo You can now run start-all.bat to start the bot and LogViewer.
echo.
pause 