@echo off
chcp 65001 >nul
title VoiceCanvas

set PROJECT_DIR=%~dp0

echo ========================================
echo   VoiceCanvas - Start
echo ========================================
echo.

echo [1/2] Starting Backend...
start "Backend" cmd /k "cd /d %PROJECT_DIR%ai-service && D:\project\python.exe run.py"
echo      Backend: http://localhost:8000
echo.

timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend...
start "Frontend" cmd /k "cd /d %PROJECT_DIR%web && npm run dev"
echo      Frontend: http://localhost:5173
echo.

echo ========================================
echo   Done!
echo   Frontend: http://localhost:5173
echo   Backend: http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo ========================================
echo.
pause
