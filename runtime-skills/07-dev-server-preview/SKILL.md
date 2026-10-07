---
name: dev-server-preview
description: >
  Dev server Vite na porta 8080: reinício supervisado por kill, gates de
  build/verificação e rota de preview. Use quando o preview estiver travado,
  após instalar pacotes, ou para validar mudanças visuais.
---

# Dev server e preview (:8080)

## Objetivo
Manter o preview a correr e validar mudanças contra ele.

## Fatos do ambiente

- Vite serve em `http://localhost:8080` — **não reiniciar** por hábito.
- Supervisão com restart-on-failure: morte com sinal (exit != 0) → respawn
  automático; até 5 restarts por 60 segundos.
- LSP local na porta 9999 (via `lsp-bridge`).
- Edits em `src/` são fluscados pelo gate HMR automaticamente — não matar o
  servidor para "aplicar" edits.

## Reinício (só quando necessário)

```bash
kill -9 $(ps -ef | grep -E '[v]ite|bun run dev' | grep -v grep | awk '{print $2}')
for i in $(seq 1 30); do curl -sf -o /dev/null http://localhost:8080/ && break; sleep 1; done
```

- `kill -9` ou qualquer sinal → exit != 0 → respawn. `exit 0` limpo NÃO reinicia.
- Não usar após `code--exec` de installs — instalações já reiniciam sozinhos.

## Gates antes de declarar pronto

1. Mudanças conferidas no disco.
2. `lovable-exec build` ou build Vite; `tsc --noEmit`; lint quando aplicável.
3. Logs de `/tmp/observability/build-errors.log` sem erros.
4. Tarefa visual → verificação real no browser (Playwright) contra `:8080`.

## Regras do projeto TanStack Start

- Não re-adicionar plugins Vite já injetados pelo wrapper (duplicados quebram a app).
- Não remover middleware de erro/CSRF em `src/start.ts`; não trocar o wrapper
  SSR de `src/server.ts` sem causa forte.
- Nunca editar `src/routeTree.gen.ts` (regenerado).
- Não editar ficheiros gerados; não reescrever história git.

## Armadilhas

- Matar o servidor em loop: estoura o limite de 5 restarts/min e deixa o
  preview fora do ar.
- Declarar conserto só porque compilou: validar o sinal que importa (build OK +
  comportamento no preview).
