@echo off
setlocal
cd /d "%~dp0"

if not exist data mkdir data
if not exist uploads mkdir uploads

echo Starting AI Drama Workbench...
echo URL: http://127.0.0.1:3000
start "" http://127.0.0.1:3000
pnpm dev
