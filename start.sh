#!/bin/bash
# NIGHTWATCHER — Start everything
#
# Usage:
#   ./start.sh                        # run all 7 strategies in this terminal
#   ./start.sh --tmux                 # run in detached tmux session (survives terminal close)
#   ./start.sh momentum-breakout orb  # run specific strategies
#
# tmux commands:
#   tmux attach -t nightwatcher       # reattach to running session
#   tmux kill-session -t nightwatcher # stop everything
#

set -e

# ── tmux mode ────────────────────────────────────────────────────────────────
if [ "$1" = "--tmux" ]; then
  shift
  SESSION="nightwatcher"
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "[NIGHTWATCHER] Session '$SESSION' already running."
    echo "  Attach:  tmux attach -t $SESSION"
    echo "  Stop:    tmux kill-session -t $SESSION"
    exit 0
  fi
  echo "[NIGHTWATCHER] Starting in tmux session '$SESSION'..."
  tmux new-session -d -s "$SESSION" -x 220 -y 50 \
    "cd \"$(pwd)\" && ./start.sh $* ; read -p 'Press Enter to close...'"
  echo "  Started. Attach with:  tmux attach -t $SESSION"
  exit 0
fi

if [ $# -eq 0 ]; then
  STRATEGIES=("momentum-breakout" "orb" "vwap-reversion" "gap-and-go" "mean-reversion" "futures-hedge" "options-momentum" "pair-trading" "awesome-oscillator")
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
  echo "[NIGHTWATCHER] Shutting down all processes..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null && echo "  killed PID $pid"
  done
  echo "[NIGHTWATCHER] All systems stopped."
}
trap cleanup EXIT INT TERM

# ── 0. Dependency Check & Installation ───────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                NIGHTWATCHER — STARTING                 ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check and install backend dependencies if missing
if [ ! -d "node_modules" ]; then
  echo "[1/6] Installing backend dependencies (npm install)..."
  npm install
  echo "      ✓ Backend dependencies installed."
  echo ""
else
  echo "[1/6] Backend dependencies verified."
  echo ""
fi

# Check and install dashboard dependencies if missing
if [ ! -d "dashboard/node_modules" ]; then
  echo "[2/6] Installing dashboard dependencies (npm install)..."
  npm --prefix dashboard install
  echo "      ✓ Dashboard dependencies installed."
  echo ""
else
  echo "[2/6] Dashboard dependencies verified."
  echo ""
fi

# ── 1. Run Database Migrations ──────────────────────────────────────────────

echo "[3/6] Applying local database migrations..."
# Pipe 'y' to bypass wrangler prompt in case it runs in interactive mode
echo "y" | npm run db:migrate
echo "      ✓ Migrations applied successfully."
echo ""

# ── Start MCP server ──────────────────────────────────────────────────────────

echo "[4/6] Starting MCP server (wrangler dev)..."
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

# ── Start Dashboard API bridge ────────────────────────────────────────────────

DASH_LOG="$LOG_DIR/dashboard-api-$TIMESTAMP.log"
echo "[5/6] Starting dashboard API (port 3001)..."
echo "      Log: $DASH_LOG"
node scripts/dashboard-api.mjs > "$DASH_LOG" 2>&1 &
DASH_PID=$!
PIDS+=("$DASH_PID")
sleep 1

echo ""

# ── Start Frontend Dashboard UI ───────────────────────────────────────────────

DASH_UI_LOG="$LOG_DIR/dashboard-ui-$TIMESTAMP.log"
echo "[6/6] Starting Frontend Dashboard UI (port 3000)..."
echo "      Log: $DASH_UI_LOG"
npm --prefix dashboard run dev > "$DASH_UI_LOG" 2>&1 &
DASH_UI_PID=$!
PIDS+=("$DASH_UI_PID")
sleep 1

echo ""

# ── Start strategy runners ────────────────────────────────────────────────────

echo "      Starting strategy runners..."
for strategy in "${STRATEGIES[@]}"; do
  STRAT_LOG="$LOG_DIR/$strategy-$TIMESTAMP.log"
  echo "      → $strategy  (log: $STRAT_LOG)"
  node scripts/run.mjs "$strategy" > "$STRAT_LOG" 2>&1 &
  STRAT_PID=$!
  PIDS+=("$STRAT_PID")
  sleep 1
done

echo ""
echo "=============================================================="
echo "  All systems successfully running!"
echo "=============================================================="
echo ""
echo "  MCP server:     http://localhost:8787"
echo "  Dashboard API:  http://localhost:3001"
echo "  Dashboard UI:   http://localhost:3000"
for strategy in "${STRATEGIES[@]}"; do
  echo "  Strategy:       $strategy"
done
echo ""
echo "  Logs:           $LOG_DIR/"
echo "  Stop:           Ctrl+C"
echo ""
echo "══════════════════════════════════════════════════════════════"
echo ""

# ── Tail all logs to stdout ───────────────────────────────────────────────────

tail -f "$LOG_DIR"/*-"$TIMESTAMP".log &
TAIL_PID=$!
PIDS+=("$TAIL_PID")

# Wait for any child to exit
wait
