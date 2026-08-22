@echo off
rem Start-DSH.cmd - double-click launcher for DeepSeek Harness web UI.
rem Extra args pass through: Start-DSH.cmd -NoOpen  /  Start-DSH.cmd -Workspace C:\some\repo
setlocal
set "PS=pwsh"
where pwsh >nul 2>nul || set "PS=powershell"
"%PS%" -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0start-dsh.ps1" %*
pause
