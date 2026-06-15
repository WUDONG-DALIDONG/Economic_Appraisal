#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
DB_PATH="${DB_PATH:-$REPO_ROOT/data.db}"
BACKUP_DIR="$REPO_ROOT/backups/db"
PID_FILE="/tmp/economic-backend.pid"
PORT=3001

echo "========================================"
echo " Economic Appraisal Backend Restarter"
echo "========================================"

# 1. Backup current DB before any change
mkdir -p "$BACKUP_DIR"
if [ -f "$DB_PATH" ]; then
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  BACKUP_PATH="$BACKUP_DIR/data-$TIMESTAMP.db"
  cp "$DB_PATH" "$BACKUP_PATH"
  echo "[1/4] DB backed up to $BACKUP_PATH"
  
  # Keep only last 5 backups
  ls -t "$BACKUP_DIR"/data-*.db 2>/dev/null | tail -n +6 | xargs -r rm -f
else
  echo "[1/4] No existing DB found at $DB_PATH"
fi

# 2. Graceful stop existing process
echo "[2/4] Stopping existing backend..."
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill -TERM "$PID" 2>/dev/null || true
    for i in {1..10}; do
      if ! kill -0 "$PID" 2>/dev/null; then
        echo "      Process $PID stopped gracefully."
        break
      fi
      sleep 0.3
    done
    if kill -0 "$PID" 2>/dev/null; then
      echo "      Force killing $PID..."
      kill -9 "$PID" 2>/dev/null || true
    fi
  fi
  rm -f "$PID_FILE"
fi

# Double-check port
if ss -tlnp | grep -q ":$PORT "; then
  echo "      Port $PORT still in use, killing all node processes..."
  killall -9 node 2>/dev/null || true
  sleep 1
fi

# 3. Start new backend
echo "[3/4] Starting backend on port $PORT..."
cd "$REPO_ROOT/packages/backend"
DB_PATH="$DB_PATH" nohup npx tsx src/server.ts > /tmp/backend.log 2>&1 &
NEW_PID=$!
echo $NEW_PID > "$PID_FILE"
disown

# 4. Wait for health check
echo "[4/4] Waiting for health check..."
for i in {1..15}; do
  if curl -sf http://127.0.0.1:$PORT/api/health >/dev/null 2>&1; then
    echo "      Backend ready! (PID: $NEW_PID)"
    echo "      API: http://127.0.0.1:$PORT/api/models"
    exit 0
  fi
  sleep 0.5
done

echo "      Backend did not respond in time. Check /tmp/backend.log"
cat /tmp/backend.log | tail -20
exit 1
