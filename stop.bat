@echo off
chcp 65001 >nul
title VoiceCanvas 停止器

echo ========================================
echo   VoiceCanvas - 停止所有服务
echo ========================================
echo.

echo 正在停止后端服务...
taskkill /FI "WINDOWTITLE eq VoiceCanvas Backend*" /F >nul 2>&1
taskkill /FI "IMAGENAME eq uvicorn.exe" /F >nul 2>&1

echo 正在停止前端服务...
taskkill /FI "WINDOWTITLE eq VoiceCanvas Frontend*" /F >nul 2>&1
taskkill /FI "IMAGENAME eq node.exe" /F >nul 2>&1

echo.
echo 所有服务已停止！
echo.
pause
