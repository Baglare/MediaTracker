@echo off
chcp 65001 >nul

set "ROOT=%~dp0"
set "ML_DIR=%ROOT%ml-service"
set "ML_HOST=127.0.0.1"
set "ML_PORT=8001"
set "ML_URL=http://%ML_HOST%:%ML_PORT%"

echo ================================
echo MediaTracker Dev Starter
echo ================================
echo Root: %ROOT%
echo ML Service: %ML_URL%
echo.

if not exist "%ML_DIR%\app.py" (
  echo [HATA] ml-service klasoru veya app.py bulunamadi.
  echo Beklenen yol: %ML_DIR%\app.py
  pause
  exit /b 1
)

if not exist "%ML_DIR%\.venv\Scripts\python.exe" (
  echo [HATA] ml-service icinde .venv bulunamadi.
  echo Once sunu calistir:
  echo cd "%ML_DIR%"
  echo py -3.12 -m venv .venv
  echo .\.venv\Scripts\activate
  echo python -m pip install -r requirements.txt
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [HATA] npm bulunamadi. Node.js kurulu mu?
  pause
  exit /b 1
)

echo [1/2] ML servisi baslatiliyor...
start "MediaTracker ML Service" cmd /k "cd /d "%ML_DIR%" && ".venv\Scripts\python.exe" -m uvicorn app:app --host %ML_HOST% --port %ML_PORT%"

timeout /t 3 /nobreak >nul

echo [2/2] Next.js dev server baslatiliyor...
start "MediaTracker Web" cmd /k "cd /d "%ROOT%" && set "MEDIA_TRACKER_ML_SERVICE_URL=%ML_URL%" && npm run dev"

echo.
echo Iki terminal acildi:
echo - ML Service: %ML_URL%
echo - Web: npm run dev
echo.
echo ML servis hazir mi diye kontrol:
echo %ML_URL%/health
echo.
pause