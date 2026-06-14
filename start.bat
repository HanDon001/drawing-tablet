@echo off
chcp 65001 >nul 2>&1

echo ========================================
echo   VoiceCanvas AI v0.2
echo ========================================

echo Killing old processes on port 8000 and 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
echo Done.

echo.
echo [1/2] Starting backend on port 8000...
start "AI-Backend" /D "%~dp0ai-service01" cmd /c ".venv\Scripts\python.exe run.py"

timeout /t 3 /nobreak >nul 2>&1

echo [2/2] Starting frontend on port 5173...
start "Web-Frontend" /D "%~dp0web01" cmd /c "npx vite --host"

echo.
echo Done!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:8000
echo.
pause
