@echo off
title MyLifeStory

echo ========================================
echo   MyLifeStory Starting...
echo ========================================
echo.

set "ROOT=%~dp0"

echo [1/2] Starting backend (port 8000)...
start "MyLifeStory-Backend" cmd /c "cd /d "%ROOT%" && node server.js"

timeout /t 3 /nobreak >nul

echo [2/2] Starting frontend (port 5173)...
start "MyLifeStory-Frontend" cmd /c "cd /d "%ROOT%frontend" && npx vite --open"

echo.
echo ========================================
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo ========================================
echo.
echo Press any key to close this window.
echo To stop services, close the Backend and Frontend windows.
pause >nul
