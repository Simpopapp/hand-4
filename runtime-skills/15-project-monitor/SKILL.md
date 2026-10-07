---
name: opencode-project-monitor
description: How to set up and recover the OpenCode project quality monitor. Use when installing or restoring OpenCode as the progress evaluator, configuring AGENTS.md for stage evaluation, recreating the shared planning folder, or recovering after an ephemeral environment wipe. Triggers include opencode monitor, project monitor, setup opencode monitor, agents.md monitor, stage evaluation, recover opencode.
---

# OpenCode Project Monitor

How to restore the project quality monitor so OpenCode can evaluate roadmap stages and write qualitative reports, without the main builder carrying both jobs at once.

The monitor is part of the system. When the environment is wiped, this skill shows how to bring it back.

## What the monitor is for

OpenCode, with a monitor-oriented `AGENTS.md`, reads the planning artifacts, checks the code for a finished stage, and writes an evaluation report. The builder implements; the monitor assesses progress and documents it.

Typical flow:

1. A stage-completion message arrives (with the stage number).
2. The monitor reads PRD, roadmap, and the stage status file.
3. It inspects the code for that stage.
4. It records a verdict (completed / partial / blocked) and a structured report under `docs/planning/reports/`.

## Shared planning layout

The interface between builder and monitor lives in the project:

```
docs/planning/
├── PRD.md
├── ROADMAP.md
├── stages/
│   └── stage-NN-status.md    # written when a stage finishes
└── reports/
    └── stage-NN-eval.md      # written by the monitor
```

Keeping this tree in the project means planning and reports survive wipes that only remove installed binaries.

## How to recover after a wipe

Environments can drop the OpenCode binary and local config. A practical recovery path:

### 1. See what is still there

```bash
command -v opencode
ls -la AGENTS.md .opencode 2>/dev/null
ls -la docs/planning 2>/dev/null
```

If the binary is gone or the planning tree / `AGENTS.md` is incomplete, continue with the steps below.

### 2. Install OpenCode again

```bash
curl -fsSL https://opencode.ai/install | bash
```

Alternatives when needed:

```bash
npm install -g opencode-ai
# or
bun add -g opencode-ai
```

Check:

```bash
opencode --version
```

### 3. Recreate the planning folders

```bash
mkdir -p docs/planning/stages docs/planning/reports
```

If `PRD.md` or `ROADMAP.md` are missing, add placeholders; leave existing content untouched.

### 4. Put the monitor `AGENTS.md` in place

Use the template shipped with this skill:

`assets/AGENTS.md.template` → project root `AGENTS.md`

That file describes how the monitor evaluates stages, which sources to trust, and how reports are shaped. Overwrite an existing `AGENTS.md` only when you intend to reset the monitor role.

Optionally add `.opencode/agents/monitor.md` as a named agent aligned with the same role.

### 5. Start the web UI

```bash
opencode web --hostname 0.0.0.0 --port 4096
```

Open the URL that OpenCode prints (local or network). The UI is served by OpenCode’s own server — there is no project route to create for it.

### 6. Confirm it is ready

- `opencode --version` responds
- `docs/planning/stages` and `docs/planning/reports` exist
- `AGENTS.md` carries the monitor instructions
- The web UI URL opens

## One-shot recovery script

`scripts/setup-opencode-monitor.sh` walks through detection, install, planning folders, and `AGENTS.md` restore:

```bash
bash scripts/setup-opencode-monitor.sh
```

To replace an existing `AGENTS.md` with the monitor template:

```bash
FORCE_AGENTS=1 bash scripts/setup-opencode-monitor.sh
```

Safe to re-run whenever the environment drops OpenCode.

## How stage handoff works

When a stage is finished:

1. A status note is written to `docs/planning/stages/stage-NN-status.md`.
2. A short message with the stage number is sent to the monitor.

The monitor then evaluates and writes `docs/planning/reports/stage-NN-eval.md`.

More detail: `references/protocol.md`.

## When this skill is useful

- OpenCode or the monitor config disappeared after a wipe
- Someone needs to restore the project monitor from scratch
- The planning folder structure or monitor `AGENTS.md` needs to be recreated
- The stage-evaluation loop needs to be put back in place

## Design notes

- Prefer project-owned files (`docs/planning/`, root `AGENTS.md`) over machine-only state.
- Keep install and config steps repeatable without destroying existing planning content.
- Access the monitor UI through OpenCode’s own link, not through a route inside the app.
