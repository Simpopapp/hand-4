---
name: delegacao-opencode
description: >
  OpenCode como motor de produção de código da sandbox: health-check com prova
  em disco, ciclo brief→produção→verificação, UI embutida na rota /oc e proxy
  dev. Use em todo pedido de implementação e em qualquer setup/sessão nova.
---

# Delegação ao OpenCode

## Objetivo
Garantir que toda produção de código passa pelo OpenCode, com prova de
funcionamento antes de qualquer entrega.

## Papel

- O agente principal **pensa, planeja e decide**; o OpenCode **produz** no
  workspace `/dev-server` (ler, escrever, terminal, patches).
- O agente principal não escreve o corpo principal do código "na mão" quando o
  OpenCode está disponível.
- O agente continua responsável por: brief claro, verificação no disco, gates e
  reporte.

## §0.1 — Arranque e health-check (antes da primeira entrega de código)

1. **Garantir processo**: preferir binário em `tools/opencode/`; senão instalar/
   arrancar de forma idempotente. Workspace = `/dev-server`.
2. **Prova de funcionamento** (não declarar "ok" sem prova): enviar pedido
   mínimo determinístico — criar/sobrescrever `/tmp/opencode-healthcheck.txt`
   com token único da sessão — e **conferir no disco**.
   - Falhou → reiniciar uma vez, repetir; falhou de novo → reportar erro exato
     (log `/tmp/opencode-web.log`) e NÃO avançar como saudável.
3. **UI embutida**: só depois da prova verde. Forma canónica = chat do app em
   `/dev-server` com iframe apontando ao OpenCode web local (porta real do
   processo). Rota existente: `/` renderiza o chat via `/oc`; proxy same-origin
   em `vite-opencode-proxy.ts` (target `OPENCODE_URL` ou `127.0.0.1:4096`).
4. **Ordem do reporte de setup**: estado do OpenCode (up + prova) → rota do app
   onde está embutido → resto do trabalho.

## §0.2 — Ciclo de trabalho normal

1. Brief objetivo: ficheiros alvo, comportamento, restrições.
2. Enviar o brief ao OpenCode para produzir as alterações.
3. Verificar no disco o diff/resultado.
4. Gates: build, tipos, lint, browser quando visual.
5. Reporte em três blocos: o que foi feito / como foi verificado / o que falta.

## Modelo

- `opencode.json` define modelo free local (ex.: `muse-spark-1.3-contributor-free`).
  Não usar apikey no opencode: corre localmente com modelos free.

## Regras

- Nunca usar o OpenCode para tarefas que o plano reservou ao agente principal
  (ex.: a tarefa do Plan.md em si) — só depois de entrega completa.
- Mensagens do utilizador passam pelo agente principal e chegam ao OpenCode.
- Se cair a meio: refazer §0.1 antes de continuar a produzir.

## Referências
- `.opencode/AGENTS.md` — documento canónico de operação do OpenCode.
- `.opencode/Plan.md` — tarefas pendentes do runtime.
- Skill `07-dev-server-preview` — proxy `/oc` e portas.
