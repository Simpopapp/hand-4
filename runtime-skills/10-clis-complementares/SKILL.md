---
name: clis-complementares
description: >
  Binários de /bin (lovable-exec, lovable-skills, lovable-assets, lovable-storage,
  lsp-bridge, agent-browser, desktop, slides...). Use ao executar tasks do
  projeto, gerir assets/storage e fazer typecheck rápido via LSP.
---

# CLIs complementares da sandbox (/bin)

## Objetivo
Conhecer o músculo executável da sandbox além do CLI `lovable`.

## Principais

| CLI | Uso |
|---|---|
| `lovable-exec` | Tasks do projeto: `lovable-exec <task> [-- extra]` — `install`, `dev`, `build`, `build:dev`, `test`, `lint`, `start`. `dev`/`start` são longa duração (não bloquear automação neles). |
| `lovable-skills` | `list [--only-workspace]` e `get --skill <nome> --file <ficheiro>`. Rascunhos fora de `.workspace/skills/` são inertes. |
| `lovable-agentmds` | `list [root]` — descobre AGENTS.md/CLAUDE.md do projeto. |
| `lovable-assets` | Upload para CDN: `create --file <f> [--content-type]` devolve pointer `.asset.json`; `get --file <pointer> --output <out>` materializa; `delete` remove. Guardar o pointer no projeto, nunca o binário grande. |
| `lovable-artifacts` | `scaffold <artifact> [--stack <s>] [--input-json <j>] [--write]` — sem `--write` é dry-run. |
| `lovable-events` | `catalog`, `event-types`, `export`, `replays get`, `schema-check`, `sql`, `status`. |
| `lovable-storage` | Object storage: `cp`, `pipe`, `batch`, `run`, `rm` (rm é destrutivo — só com pedido explícito). |
| `lsp-bridge` | Ponte HTTP na porta 9999 (hover/definition/diagnostics) — typecheck rápido sem build completo. |
| `agent-browser` | Automação rápida de browser; alternativa ao Playwright. Scripts em `/tmp/browser/`. |
| `lovable-canvas-screenshot` | Captura o canvas renderizado (`--url`, `--output`, `--shape-id`, `--bounds`). |
| `lovable-computer` / `lovable-desktop-*` | Desktop virtual X/VNC (display :99) — debug visual pesado apenas. |
| `lovable-slides` | Pipeline de apresentações: `read`/`prepare`/`apply` via snapshots. |
| `lovable-commit-check` | Gate interno de commits — não chamar manualmente. |
| `lovable-mods` / `lovable-dwl-bundle` / `lov-tool` | Manutenção interna do runtime — não usar em fluxos de app. |

## Regras

- Vários são embrulhados pelos MCPs locais (`.opencode/mcp/`) — **preferir o
  wrapper MCP** quando existir.
- `lovable-exec -w /dev-server` para install/build/test/lint.
- Nunca imprimir valores de segredos manipulados por estes CLIs.

## Referências
- `.opencode/TOOLS.md` secção 1.18 — detalhes completos por CLI.
- Skill `11-mcps-locais` — wrappers MCP disponíveis.
