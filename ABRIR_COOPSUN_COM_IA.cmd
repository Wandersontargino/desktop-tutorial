@echo off
setlocal
title CoopSun - Projeto com Claude Code
set "iniciadorCoopSun=%USERPROFILE%\CoopSun-IA\ABRIR_CLAUDE_COOPSUN.cmd"
if not exist "%iniciadorCoopSun%" (
  echo O iniciador automatico da CoopSun nao foi encontrado neste computador.
  echo Instale o pacote CoopSun_Claude_Automatico e abra este arquivo novamente.
  pause
  exit /b 1
)
call "%iniciadorCoopSun%" "%~dp0."
exit /b %errorlevel%
