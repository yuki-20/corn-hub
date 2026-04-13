@echo off
chcp 65001 >nul 2>nul
REM CornMCP - Startup Script (Windows)
REM
REM Double-click this file to launch interactive CLI (stays open)
REM From terminal: start.cmd [up/down/logs/restart/build/status/local/cli]

setlocal enabledelayedexpansion
title CornMCP

set COMPOSE_FILE=infra\docker-compose.yml
set ENV_FILE=infra\.env

echo.
echo  CornMCP - AI Agent Intelligence Platform
echo.

REM Check for .env
if not exist "%ENV_FILE%" (
    if exist "infra\.env.example" (
        echo  Creating .env from template...
        copy infra\.env.example "%ENV_FILE%" >nul
        echo  Edit %ENV_FILE% with your API keys before starting.
        echo.
    )
)

REM If no arguments (double-click), launch interactive CLI
set CMD=%1
if "%CMD%"=="" goto :cli

REM Route commands
if "%CMD%"=="up" goto :up
if "%CMD%"=="down" goto :down
if "%CMD%"=="logs" goto :logs
if "%CMD%"=="restart" goto :restart
if "%CMD%"=="build" goto :build_cmd
if "%CMD%"=="status" goto :status
if "%CMD%"=="local" goto :local
if "%CMD%"=="cli" goto :cli
goto :usage

REM ============================================================
REM  Interactive CLI (default when double-clicked)
REM ============================================================
:cli
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [X] Node.js is not installed!
    echo    Please install Node.js 22+ from https://nodejs.org/
    echo.
    pause
    goto :end
)

if not exist "cli\corn-install\dist\index.js" (
    echo  Building CLI first...
    call pnpm build
    if errorlevel 1 (
        echo.
        echo  [X] Build failed. Run "pnpm install" first.
        echo.
        pause
        goto :end
    )
)

node cli\corn-install\dist\index.js
if errorlevel 1 (
    echo.
    echo  The CLI exited unexpectedly.
    echo.
)
pause
goto :end

REM ============================================================
REM  Docker up (with auto-fallback to local)
REM ============================================================
:up
where docker >nul 2>nul
if errorlevel 1 (
    echo  [!] Docker is not installed.
    echo.
    echo  Starting services locally with Node.js instead...
    echo  To use Docker, install Docker Desktop first:
    echo    winget install Docker.DockerDesktop
    echo.
    goto :local
)

REM Check if Docker daemon is running
docker info >nul 2>nul
if errorlevel 1 (
    echo  [!] Docker is installed but the daemon is not running.
    echo.
    echo  Starting services locally with Node.js instead...
    echo  Start Docker Desktop from the Start menu, then retry.
    echo.
    goto :local
)

echo  Starting CornMCP Docker stack...
docker compose -f %COMPOSE_FILE% --env-file %ENV_FILE% up -d --build
if errorlevel 1 (
    echo.
    echo  [!] Docker Compose failed. Falling back to local mode...
    echo.
    goto :local
)
echo.
echo  [OK] CornMCP is running (Docker)
echo     Dashboard:  http://localhost:3000
echo     MCP Server: http://localhost:8317/mcp
echo     API:        http://localhost:4000
echo.
pause
goto :end

:down
where docker >nul 2>nul
if errorlevel 1 (
    echo  Docker is not installed. Nothing to stop.
    pause
    goto :end
)
echo  Stopping CornMCP stack...
docker compose -f %COMPOSE_FILE% down
pause
goto :end

:logs
where docker >nul 2>nul
if errorlevel 1 (
    echo  Docker is not installed.
    pause
    goto :end
)
docker compose -f %COMPOSE_FILE% logs -f --tail=50
goto :end

:restart
where docker >nul 2>nul
if errorlevel 1 (
    echo  Docker is not installed. Use "start.cmd local" instead.
    pause
    goto :end
)
echo  Restarting CornMCP stack...
docker compose -f %COMPOSE_FILE% --env-file %ENV_FILE% restart
pause
goto :end

:build_cmd
where docker >nul 2>nul
if errorlevel 1 (
    echo  Docker is not installed. Building with pnpm instead...
    call pnpm build
    pause
    goto :end
)
echo  Building CornMCP images...
docker compose -f %COMPOSE_FILE% --env-file %ENV_FILE% build --no-cache
pause
goto :end

:status
where docker >nul 2>nul
if errorlevel 1 (
    echo  Docker is not installed. Checking local services...
    echo.
    goto :status_local
)
docker compose -f %COMPOSE_FILE% ps
echo.
:status_local
echo  Checking API...
curl -s http://localhost:4000/health 2>nul
if errorlevel 1 echo    [!] API is not running
echo.
echo  Checking MCP...
curl -s http://localhost:8317/health 2>nul
if errorlevel 1 echo    [!] MCP is not running
echo.
pause
goto :end

REM ============================================================
REM  Local mode - start Node.js servers in foreground
REM ============================================================
:local
where node >nul 2>nul
if errorlevel 1 (
    echo  [X] Node.js is not installed!
    echo    Please install Node.js 22+ from https://nodejs.org/
    echo.
    pause
    goto :end
)

if not exist "apps\corn-api\dist\index.js" (
    echo  Building project first...
    call pnpm build
    if errorlevel 1 (
        echo  [X] Build failed. Run "pnpm install" first.
        pause
        goto :end
    )
)

echo.
echo  Starting CornMCP locally (Node.js)
echo.

REM Start API in a new window so it persists
start "CornMCP API" cmd /k "title CornMCP API & node apps\corn-api\dist\index.js"

REM Start MCP in a new window so it persists
start "CornMCP MCP" cmd /k "title CornMCP MCP & node apps\corn-mcp\dist\node.js"

echo  [OK] CornMCP servers are starting in separate windows.
echo.
echo     API:        http://localhost:4000
echo     MCP Server: http://localhost:8317/mcp
echo     Health:     http://localhost:8317/health
echo.
echo     Close the server windows to stop them.
echo     To use the CLI: start.cmd cli
echo.
pause
goto :end

REM ============================================================
REM  Help
REM ============================================================
:usage
echo  Usage: start.cmd [command]
echo.
echo  Commands:
echo    (none)    Launch interactive CLI (default, safe to double-click)
echo    cli       Launch interactive CLI
echo    up        Start with Docker (auto-fallback to local if no Docker)
echo    local     Start API + MCP servers in separate windows
echo    down      Stop Docker containers
echo    logs      Show Docker container logs
echo    restart   Restart Docker containers
echo    build     Build images/project
echo    status    Show service status
echo.
pause
goto :end

:end
endlocal
