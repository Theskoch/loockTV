#!/bin/bash
set -e

echo "=== Building Admin UI ==="
cd admin-ui
npm install
npm run build
cd ..

echo "=== Starting Docker services ==="
docker compose up -d --build

echo ""
echo "Done! Server running at http://localhost:${SERVER_PORT:-3000}"
echo "Login: admin / changeme123 (change in .env)"
