@echo off
setlocal

cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    set "PY_CMD=py -3"
) else (
    set "PY_CMD=python"
)

%PY_CMD% --version >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python tidak ditemukan.
    echo [ERROR] Install Python 3.10+ lalu aktifkan opsi "Add Python to PATH" saat instalasi.
    echo [ERROR] Download: https://www.python.org/downloads/windows/
    pause
    exit /b 1
)

if not exist ".venv" (
    echo [INFO] Membuat virtual environment...
    %PY_CMD% -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Gagal membuat virtual environment.
        pause
        exit /b 1
    )
)

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Python virtual environment tidak ditemukan di .venv\Scripts\python.exe
    pause
    exit /b 1
)

call .venv\Scripts\activate.bat

if "%KMZINFRA_HOST%"=="" set "KMZINFRA_HOST=0.0.0.0"
if "%KMZINFRA_PORT%"=="" set "KMZINFRA_PORT=5000"
if "%KMZINFRA_DEBUG%"=="" set "KMZINFRA_DEBUG=1"

echo [INFO] Upgrade pip...
.venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 (
    echo [ERROR] Gagal upgrade pip.
    pause
    exit /b 1
)

echo [INFO] Install dependency...
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Gagal install dependency.
    pause
    exit /b 1
)

echo [INFO] Menjalankan aplikasi di host %KMZINFRA_HOST% port %KMZINFRA_PORT%
.venv\Scripts\python.exe app.py

endlocal
