@echo off
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1
echo Prism has stopped.
timeout /t 2 >nul
