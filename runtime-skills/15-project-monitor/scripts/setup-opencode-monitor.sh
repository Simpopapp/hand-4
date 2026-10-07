#!/usr/bin/env bash
# Persistent variant of the OpenCode project monitor setup.
# Only difference vs 15-project-monitor: binary lives inside the project and
# the server runs under a detached restart-on-exit supervisor.
# Safe to re-run after an ephemeral environment wipe.

set -euo pipefail

PLANNING_DIR="${PLANNING_DIR:-docs/planning}"
AGENTS_FILE="${AGENTS_FILE:-AGENTS.md}"
FORCE_AGENTS="${FORCE_AGENTS:-0}"
OC_HOME="${OC_HOME:-$(pwd)/tools/opencode}"   # project-owned, survives wipes
OC_BIN="${OC_HOME}/bin/opencode"
OC_PORT="${OC_PORT:-4096}"
OC_HOST="${OC_HOST:-127.0.0.1}"
OC_LOG="${OC_LOG:-/tmp/opencode-web.log}"
OC_PIDFILE="${OC_PIDFILE:-/tmp/opencode-supervisor.pid}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/../assets/AGENTS.md.template"

echo "==> Restoring OpenCode project monitor (persistent)"

# 1. Binary inside the project (not in $HOME, which is wiped)
mkdir -p "${OC_HOME}/bin"
if [[ ! -x "${OC_BIN}" ]]; then
  if command -v opencode >/dev/null 2>&1; then
    cp "$(command -v opencode)" "${OC_BIN}"
  else
    echo "Installing OpenCode into ${OC_HOME}..."
    curl -fsSL https://opencode.ai/install | bash
    cp "$HOME/.opencode/bin/opencode" "${OC_BIN}"
  fi
  chmod +x "${OC_BIN}"
fi
echo "OpenCode: $("${OC_BIN}" --version 2>/dev/null || echo unknown)"

# 2. Planning folders
mkdir -p "${PLANNING_DIR}/stages" "${PLANNING_DIR}/reports"
for f in PRD.md ROADMAP.md; do
  if [[ ! -f "${PLANNING_DIR}/${f}" ]]; then
    printf '# %s\n\n(Placeholder. Populate with project planning content.)\n' "${f%.md}" > "${PLANNING_DIR}/${f}"
  fi
done

# 3. Monitor AGENTS.md
if [[ ! -f "${AGENTS_FILE}" ]] || [[ "${FORCE_AGENTS}" == "1" ]]; then
  cp "${TEMPLATE}" "${AGENTS_FILE}"
  echo "Wrote ${AGENTS_FILE}"
else
  echo "${AGENTS_FILE} exists — left as is (FORCE_AGENTS=1 to replace)"
fi

# 4. Named monitor agent
mkdir -p .opencode/agents
if [[ ! -f .opencode/agents/monitor.md ]]; then
  cat > .opencode/agents/monitor.md <<'EOF'
---
description: Quality monitor that evaluates completed roadmap stages against PRD and roadmap
mode: primary
---

When a stage-completion message arrives, follow AGENTS.md —
read the shared planning files, evaluate the code for that stage,
and write a report under docs/planning/reports/.
EOF
fi

# 5. Detached supervisor: restarts the server whenever it exits
if [[ -f "${OC_PIDFILE}" ]] && kill -0 "$(cat "${OC_PIDFILE}")" 2>/dev/null; then
  echo "Supervisor already running (pid $(cat "${OC_PIDFILE}"))"
else
  setsid bash -c "
    while true; do
      '${OC_BIN}' serve --port ${OC_PORT} --hostname ${OC_HOST} >>'${OC_LOG}' 2>&1 </dev/null
      echo \"[\$(date -u +%FT%TZ)] opencode exited (\$?), restarting in 2s\" >>'${OC_LOG}'
      sleep 2
    done
  " >/dev/null 2>&1 </dev/null &
  echo $! > "${OC_PIDFILE}"
  disown || true
  echo "Supervisor started (pid $(cat "${OC_PIDFILE}"))"
fi

# 6. Health check
for i in $(seq 1 30); do
  if curl -sf "http://${OC_HOST}:${OC_PORT}/api/health" >/dev/null; then
    echo "OpenCode healthy on ${OC_HOST}:${OC_PORT}"; exit 0
  fi
  sleep 1
done
echo "WARN: health check failed — see ${OC_LOG}" >&2
exit 1
