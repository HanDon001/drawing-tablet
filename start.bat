@echo off
chcp 65001 >nul
title VoiceCanvas 启动器

echo ========================================
echo   VoiceCanvas 纯语音绘图工具 - 启动器
echo ========================================
echo.

:: 启动后端
echo [1/2] 启动后端服务...
cd /d "%~dp0ai-service"
start "VoiceCanvas Backend" cmd /k "uvicorn app.main:app --reload --port 8000"
echo      后端地址: http://localhost:8000
echo.

:: 等待后端启动
timeout /t 3 /nobreak >nul

:: 启动前端
echo [2/2] 启动前端服务...
cd /d "%~dp0web"
start "VoiceCanvas Frontend" cmd /k "npm run dev"
echo      前端地址: http://localhost:5173
echo.

echo ========================================
echo   启动完成！
echo   前端: http://localhost:5173
echo   后端: http://localhost:8000
echo   API文档: http://localhost:8000/docs
echo ========================================
echo.
echo 按任意键退出...
pause >nul
