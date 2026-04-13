#!/bin/bash
# CornMCP — Startup Script (Unix/macOS)
# Usage: ./start.sh [up|down|logs|restart|build|status|local|cli]
#
# If Docker is installed, uses Docker Compose.
# If Docker is NOT installed, starts services locally with Node.js.

set -euo pipefail

COMPOSE_FILE="infra/docker-compose.yml"
ENV_FILE="infra/.env"

# Colors
GOLD="\033[33m"
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[93m"
DIM="\033[2m"
RESET="\033[0m"

echo -e "${GOLD}🌽 CornMCP — AI Agent Intelligence Platform${RESET}"
echo ""

# Check for .env
if [ ! -f "$ENV_FILE" ]; then
    if [ -f "infra/.env.example" ]; then
        echo -e "${GOLD}Creating .env from template...${RESET}"
        cp infra/.env.example "$ENV_FILE"
        echo -e "Edit ${ENV_FILE} with your API keys before starting."
        echo ""
    fi
fi

CMD="${1:-up}"

# ── Docker availability check ────────────────────────────
has_docker() {
    command -v docker &>/dev/null && docker info &>/dev/null
}

# ── Local mode (no Docker) ───────────────────────────────
start_local() {
    echo -e "${GREEN}── Starting CornMCP locally (Node.js) ──${RESET}"
    echo ""

    if ! command -v node &>/dev/null; then
        echo -e "${RED}✗ Node.js is not installed. Please install Node.js 22+ first.${RESET}"
        echo "  https://nodejs.org/"
        exit 1
    fi

    # Build if dist files don't exist
    if [ ! -f "apps/corn-api/dist/index.js" ]; then
        echo "Building project first..."
        pnpm build || { echo -e "${RED}✗ Build failed. Run 'pnpm install' first.${RESET}"; exit 1; }
    fi

    echo "Starting API server (port 4000)..."
    node apps/corn-api/dist/index.js &
    API_PID=$!

    echo "Starting MCP server (port 8317)..."
    node apps/corn-mcp/dist/node.js &
    MCP_PID=$!

    sleep 3

    echo ""
    echo -e "${GREEN}✅ CornMCP is running (local Node.js)${RESET}"
    echo "   API:        http://localhost:4000"
    echo "   MCP Server: http://localhost:8317/mcp"
    echo "   Health:     http://localhost:8317/health"
    echo ""
    echo "   PIDs: API=$API_PID, MCP=$MCP_PID"
    echo "   To stop: kill $API_PID $MCP_PID"
    echo "   To use the CLI: node cli/corn-install/dist/index.js"

    # Wait for background processes
    wait
}

case "$CMD" in
    up)
        if ! has_docker; then
            echo -e "${YELLOW}⚠  Docker is not available.${RESET}"
            echo ""
            echo "  Starting services locally with Node.js instead..."
            if ! command -v docker &>/dev/null; then
                echo -e "  ${DIM}To use Docker, install Docker Desktop first.${RESET}"
            else
                echo -e "  ${DIM}Docker is installed but the daemon is not running.${RESET}"
                echo -e "  ${DIM}Start Docker Desktop, then re-run this script.${RESET}"
            fi
            echo ""
            start_local
        else
            echo -e "${GREEN}Starting CornMCP Docker stack...${RESET}"
            docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build
            echo ""
            echo -e "${GREEN}✅ CornMCP is running (Docker)${RESET}"
            echo "   Dashboard:  http://localhost:3000"
            echo "   MCP Server: http://localhost:8317/mcp"
            echo "   API:        http://localhost:4000"
        fi
        ;;
    local)
        start_local
        ;;
    cli)
        echo "Starting CornMCP interactive CLI..."
        node cli/corn-install/dist/index.js
        ;;
    down)
        if ! has_docker; then
            echo "Docker is not available. Nothing to stop."
            exit 0
        fi
        echo "Stopping CornMCP stack..."
        docker compose -f "$COMPOSE_FILE" down
        ;;
    logs)
        if ! has_docker; then
            echo "Docker is not available. Use: node apps/corn-api/dist/index.js"
            exit 0
        fi
        docker compose -f "$COMPOSE_FILE" logs -f --tail=50
        ;;
    restart)
        if ! has_docker; then
            echo "Docker is not available. Use './start.sh local' instead."
            exit 0
        fi
        echo "Restarting CornMCP stack..."
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart
        ;;
    build)
        if has_docker; then
            echo "Building CornMCP images..."
            docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache
        else
            echo "Docker is not available. Building with pnpm instead..."
            pnpm build
        fi
        ;;
    status)
        if has_docker; then
            docker compose -f "$COMPOSE_FILE" ps
        else
            echo "Docker is not available. Checking local services..."
            echo ""
            echo "Checking API (http://localhost:4000/health)..."
            curl -s http://localhost:4000/health 2>/dev/null || echo "  ⚠  API is not running"
            echo ""
            echo "Checking MCP (http://localhost:8317/health)..."
            curl -s http://localhost:8317/health 2>/dev/null || echo "  ⚠  MCP is not running"
        fi
        ;;
    *)
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  up        Start with Docker (auto-fallback to local if no Docker)"
        echo "  local     Start locally with Node.js (no Docker needed)"
        echo "  cli       Launch the interactive CLI"
        echo "  down      Stop Docker containers"
        echo "  logs      Show Docker container logs"
        echo "  restart   Restart Docker containers"
        echo "  build     Build images/project"
        echo "  status    Show service status"
        echo ""
        exit 1
        ;;
esac
