@echo off
chcp 65001 >nul
title NIKA - control panel launcher
pushd "%~dp0"
echo.
echo   Starting NIKA control panel...
echo   Do NOT close the server window that opens.
echo.
start "NIKA server - do NOT close" cmd /k "node scripts/server.mjs"
timeout /t 2 >nul
start "" http://localhost:5178
exit
