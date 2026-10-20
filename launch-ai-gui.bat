@echo off
setlocal
title BattleFight AI Control Center
cd /d "%~dp0"

set "STATUS_URL=http://127.0.0.1/api/training/status"
curl.exe --silent --fail --max-time 2 "%STATUS_URL%" >nul 2>&1
if not errorlevel 1 goto server_ready

echo Starting the BattleFight training server...
start "BattleFight Training Server" /D "%~dp0" cmd /k "npm run server"

set "attempts=0"
:wait_for_server
timeout /t 2 /nobreak >nul
curl.exe --silent --fail --max-time 2 "%STATUS_URL%" >nul 2>&1
if not errorlevel 1 goto server_ready

set /a attempts+=1
if %attempts% GEQ 60 goto server_timeout
goto wait_for_server

:server_timeout
echo The training server did not become ready within 2 minutes.
echo Check the BattleFight Training Server window for startup errors.
pause
exit /b 1

:server_ready
echo Training server is ready. Opening the AI control GUI...
python tools\trainer_gui.py
if errorlevel 1 (
    echo Failed to start the GUI. Make sure Python and Tkinter are installed.
    pause
    exit /b 1
)
