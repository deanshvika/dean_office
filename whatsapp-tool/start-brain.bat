@echo off
chcp 65001 >nul
title Brain Bot - WhatsApp to Base44

echo ========================================
echo    Brain Bot - מפעיל את הבוט...
echo ========================================
echo.

:: טעינת משתני סביבה
for /f "tokens=3*" %%a in ('reg query "HKCU\Environment" /v ANTHROPIC_API_KEY 2^>nul') do set ANTHROPIC_API_KEY=%%a %%b
for /f "tokens=3*" %%a in ('reg query "HKCU\Environment" /v GROQ_API_KEY 2^>nul') do set GROQ_API_KEY=%%a %%b

:: נווט לתיקייה
cd /d "%~dp0"

:: הפעל
node --max-old-space-size=4096 brain.js

pause
