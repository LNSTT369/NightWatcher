#!/bin/bash
# NIGHTWATCHER V3 — Start everything
#
# Usage: ./start.sh [strategy1] [strategy2] ...
# Default: runs momentum-breakout and orb
#
# Examples:
#   ./start.sh
#   ./start.sh momentum-breakout
#   ./start.sh momentum-breakout orb

set -e

STRATEGIES=("${@:-momentum-breakout orb}")
if [ $# -eq 0 ]; then
  STRATEGIES=("momentum-breakout" "orb")
else
  STRATEGIES=("$@")
fi

LOG_DIR="logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
MCP_LOG="$LOG_DIR/mcp-$TIMESTAMP.log"

# ── Cleanup on exit ───────────────────────────────────────────────────────────

PIDS=()
cleanup() {
  echo ""
  echo "[NIGHTWATCHER] Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null && echo "  killed PID $pid"
  done
  echo "[NIGHTWATCHER] Done."
}
trap cleanup EXIT INT TERM

# ── Start MCP server ──────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║            NIGHTWATCHER V3 — STARTING                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "[1/3] Starting MCP server (wrangler dev)..."
echo "      Log: $MCP_LOG"

npm run dev > "$MCP_LOG" 2>&1 &
MCP_PID=$!
PIDS+=("$MCP_PID")

# Wait for MCP server to be ready
echo "      Waiting for server on http://localhost:8787..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:8787/health > /dev/null 2>&1; then
    echo "      ✓ Server ready"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "      ✗ Server did not start in 30s — check $MCP_LOG"
    exit 1
  fi
  sleep 1
done

echo ""

# ── Start strategy runners ────────────────────────────────────────────────────

echo "[2/3] Starting strategies..."
for strategy in "${STRATEGIES[@]}"; do
  STRAT_LOG="$LOG_DIR/$strategy-$TIMESTAMP.log"
  echo "      → $strategy  (log: $STRAT_LOG)"
  node scripts/run.mjs "$strategy" > "$STRAT_LOG" 2>&1 &
  STRAT_PID=$!
  PIDS+=("$STRAT_PID")
  sleep 1
done

echo ""
echo "[3/3] All systems running."
echo ""
echo "  MCP server:  http://localhost:8787"
for strategy in "${STRATEGIES[@]}"; do
  echo "  Strategy:    $strategy"
done
echo ""
echo "  Logs:        $LOG_DIR/"
echo "  Stop:        Ctrl+C"
echo ""
echo "══════════════════════════════════════════════════════════════"
echo ""

# ── Tail all logs to stdout ───────────────────────────────────────────────────

tail -f "$LOG_DIR"/*-"$TIMESTAMP".log &
TAIL_PID=$!
PIDS+=("$TAIL_PID")

# Wait for any child to exit
wait
