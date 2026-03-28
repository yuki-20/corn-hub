#!/bin/bash
# Corn Hub — Docker Compose Startup Script
# Usage: ./start.sh [up|down|logs|restart|build]

set -euo pipefail

COMPOSE_FILE="infra/docker-compose.yml"
ENV_FILE="infra/.env"

# Colors
GOLD="\033[33m"
GREEN="\033[32m"
RESET="\033[0m"

echo -e "${GOLD}🌽 Corn Hub — AI Agent Intelligence Platform${RESET}"
echo ""

# Check for .env
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${GOLD}Creating .env from template...${RESET}"
    cp infra/.env.example "$ENV_FILE"
    echo -e "Edit ${ENV_FILE} with your API keys before starting."
    echo ""
fi

CMD="${1:-up}"

case "$CMD" in
    up)
        echo -e "${GREEN}Starting Corn Hub stack...${RESET}"
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build
        echo ""
        echo -e "${GREEN}✅ Corn Hub is running!${RESET}"
        echo "   Dashboard:  http://localhost:3000"
        echo "   MCP Server: http://localhost:8317/mcp"
        echo "   API:        http://localhost:4000"
        ;;
    down)
        echo "Stopping Corn Hub stack..."
        docker compose -f "$COMPOSE_FILE" down
        ;;
    logs)
        docker compose -f "$COMPOSE_FILE" logs -f --tail=50
        ;;
    restart)
        echo "Restarting Corn Hub stack..."
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart
        ;;
    build)
        echo "Building Corn Hub images..."
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache
        ;;
    status)
        docker compose -f "$COMPOSE_FILE" ps
        ;;
    *)
        echo "Usage: $0 [up|down|logs|restart|build|status]"
        exit 1
        ;;
esac
