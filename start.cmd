@echo off
REM Corn Hub — Docker Compose Startup Script (Windows)
REM Usage: start.cmd [up|down|logs|restart|build|status]

setlocal enabledelayedexpansion

set COMPOSE_FILE=infra\docker-compose.yml
set ENV_FILE=infra\.env

echo.
echo  🌽 Corn Hub — AI Agent Intelligence Platform
echo.

REM Check for .env
if not exist "%ENV_FILE%" (
    echo Creating .env from template...
    copy infra\.env.example "%ENV_FILE%" >nul
    echo Edit %ENV_FILE% with your API keys before starting.
    echo.
)

set CMD=%1
if "%CMD%"=="" set CMD=up

if "%CMD%"=="up" goto :up
if "%CMD%"=="down" goto :down
if "%CMD%"=="logs" goto :logs
if "%CMD%"=="restart" goto :restart
if "%CMD%"=="build" goto :build
if "%CMD%"=="status" goto :status
goto :usage

:up
echo Starting Corn Hub stack...
docker compose -f %COMPOSE_FILE% --env-file %ENV_FILE% up -d --build
echo.
echo ✅ Corn Hub is running!
echo    Dashboard:  http://localhost:3000
echo    MCP Server: http://localhost:8317/mcp
echo    API:        http://localhost:4000
goto :end

:down
echo Stopping Corn Hub stack...
docker compose -f %COMPOSE_FILE% down
goto :end

:logs
docker compose -f %COMPOSE_FILE% logs -f --tail=50
goto :end

:restart
echo Restarting Corn Hub stack...
docker compose -f %COMPOSE_FILE% --env-file %ENV_FILE% restart
goto :end

:build
echo Building Corn Hub images...
docker compose -f %COMPOSE_FILE% --env-file %ENV_FILE% build --no-cache
goto :end

:status
docker compose -f %COMPOSE_FILE% ps
goto :end

:usage
echo Usage: start.cmd [up^|down^|logs^|restart^|build^|status]
goto :end

:end
endlocal
