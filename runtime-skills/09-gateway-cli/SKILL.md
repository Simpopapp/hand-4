---
name: gateway-cli
description: >
  CLI `lovable` (/bin/lovable): 53 comandos para operações de projeto (drafts,
  security, supabase read-only, urls, chat-history, credits). Use para
  operações de plataforma sem tool diferida dedicada.
---

# Gateway CLI `lovable`

## Objetivo
Operar a plataforma via CLI quando a operação é de projeto (não produção de
código — isso é papel do OpenCode).

## Contrato

- stdout = resultado (JSON único com `--json`); stderr = diagnósticos.
- Sem ANSI; não depende de TTY.
- Exit codes: `0` ok · `1` erro · `2` uso · `3` auth · `4` gateway indisponível
  · `5` rate limit (esperar `retry_after_seconds` e retentar **uma** vez).
- Auth automática via `AGW_URL`/`AGW_TOKEN` injetados (nunca ecoar valores).
- Flags globais: `--gateway-url`, `--json`, `--timeout` (default 30s).

## Comandos de uso frequente

| Comando | Uso |
|---|---|
| `lovable commands --json` | Catálogo máquina dos 53 comandos — consultar antes de adivinhar flags |
| `lovable whoami` | Confirmar autenticação do token |
| `lovable supabase query "<sql>"` | SQL **read-only** no backend (writes só via migrations) |
| `lovable supabase info/linter/slow-queries/function-logs` | Saúde do backend |
| `lovable build status/diagnostics` | Estado e erros de build do preview |
| `lovable urls` | Preview URL, published URL, domínios |
| `lovable drafts list/status/plan/restore/verify` | Gestão de drafts (ramos isolados) |
| `lovable security scan/results` | Scan de segurança |
| `lovable websearch search/context` | Busca web (context = focada em código) |
| `lovable chat-history sync` | Materializa histórico do chat para `rg` |
| `lovable connections call/list/config/secrets` | APIs de conectores; secrets devolvem só NOMES de env vars |
| `lovable credits balance/usage` | Saldo e consumo |
| `lovable comments list/read/reply/resolve/delete` | Threads de comentários |
| `lovable preview execute-js` | JS no tab de preview aberto do utilizador |
| `lovable auth-session --json` | Cunha sessão para o browser tool (ficheiro 0600; nunca imprimir) |

## Armadilhas

- `supabase query` é só leitura: seed inicial vai na migration com INSERTs
  literais, nunca via query/tool.
- Rate limit (exit 5): esperar e retentar uma vez; insistir em loop é proibido.
- Não substitui o OpenCode: o gateway é infra de operações de projeto.

## Referências
- `.opencode/TOOLS.md` secção 1.16 — tabela completa dos 53 comandos.
