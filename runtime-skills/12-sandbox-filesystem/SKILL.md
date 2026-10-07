---
name: sandbox-filesystem
description: >
  Hierarquia de paths da sandbox (/dev-server, /bin, /mnt/documents, /tmp, /tls)
  e o que persiste onde. Use ao decidir destino de ficheiros, entregáveis,
  rascunhos e logs.
---

# Filesystem da sandbox

## Objetivo
Saber onde cada coisa vive, o que persiste entre chamadas e o que é efémero.

## Árvore

```
/dev-server/        Projeto do utilizador — ÚNICO sítio onde se implementa a app
├── src/            Código TanStack Start (routes, lib, components...)
├── .opencode/      Documentação e MCPs do OpenCode (Plan.md, TOOLS.md, mcp/)
│   └── tools-skills/   Skills por ferramenta (descompactadas do zip)
├── runtime-skills/ Skills de runtime do agente principal
├── .workspace/     Skills ativas
└── AGENTS.md       Regras técnicas do projeto

/bin/               CLIs do runtime (symlinks /nix/store)
/mnt/documents/     Entregáveis / publicação (Files)
/mnt/user-uploads/  Uploads do utilizador (read-only; mirror /tmp/user-uploads/)
/tmp/               Rascunhos, logs, healthcheck, estado (efémero entre sessões)
├── browser/<slug>/ Scripts e screenshots Playwright
├── observability/  build-errors, console, runtime-errors, network
├── exec-logs/      stdout/stderr completos de comandos
├── dev-server-logs/ Logs do dev server
└── knowledge/      Conhecimento/skills da plataforma
/tls/               mTLS do dev-server (ca.pem, cert.pem, key.pem — key restrita)
```

## Regras de destino

- Código e ficheiros que a app exibe → **apenas** em paths do projeto.
- Standalone deliverables (relatórios, imagens avulsas) → `/mnt/documents`.
- Rascunhos, scripts temporários, staging de ZIPs → `/tmp`.
- Assets de mídia gerados para a app → `src/assets/` via import ES6.
- Uploads do utilizador: montagem read-only; não editar no lugar.

## CWD e env

- CWD reseta para `/dev-server` a cada chamada; env vars não carregam entre
  chamadas. Para correr noutro diretório, usar o parâmetro `cwd`.
- Ficheiros persistem entre chamadas; variáveis de ambiente, não.

## Armadilhas

- Nunca `find /` nem comandos que varrem a raiz.
- Entregável de código em Files: montar pasta limpa em `/tmp` sem git,
  dependências nem build output; listar recursivamente (incluindo hidden) antes
  de copiar.
- ZIP em Files: criar em `/tmp`, inspecionar entradas, depois copiar.
