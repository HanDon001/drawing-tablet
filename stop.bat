@echo off
chcp 65001 >nul
title VoiceCanvas Stop

echo ========================================
echo   VoiceCanvas - Stop All Services
echo ========================================
echo.

echo Stopping Backend...
taskkill /FI "WINDOWTITLE eq Backend*" /F >nul 2>&1

echo Stopping Frontend...
taskkill /FI "WINDOWTITLE eq Frontend*" /F >nul 2>&1

echo.
echo All services stopped!
echo.
pause
