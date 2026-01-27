#!/bin/bash
# Dashboard startup script
# Runs Next.js dev server on port 5000 in background

cd "$(dirname "$0")"

# Kill existing process on port 5000
lsof -ti:5000 | xargs kill -9 2>/dev/null

# Start dev server
PORT=5000 npm run dev &

echo "Dashboard starting on http://localhost:5000"
echo "PID: $!"
