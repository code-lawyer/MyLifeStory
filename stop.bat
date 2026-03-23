@echo off
echo Stopping MyLifeStory services...
taskkill /FI "WINDOWTITLE eq MyLifeStory-Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MyLifeStory-Frontend*" /F >nul 2>&1
echo Done.
timeout /t 2 /nobreak >nul
