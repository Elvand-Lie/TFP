@echo off
setlocal
cd /d "%~dp0"
start "" http://127.0.0.1:8765/relationship-demo.html
py -3 -m http.server 8765 2>nul || python -m http.server 8765
