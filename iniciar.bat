@echo off
title Panel de Vida
cd /d "%~dp0"
echo ==================================================
echo           INICIANDO PANEL DE VIDA
echo ==================================================
echo.
echo Abriendo en tu navegador: http://localhost:8000
echo.
echo Presiona Ctrl+C en esta ventana para detener el servidor.
echo ==================================================
start http://localhost:8000
python -m http.server 8000
pause
