@echo off
cd /d "%~dp0backend"
npx electron-builder --config electron-builder-allinone.json
pause
