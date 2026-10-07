---
name: memoria-persistente
description: >
  Sistema de memória mem:// (index, ficheiros temáticos, ~user) e AGENTS.md.
  Use sempre que o utilizador declarar preferência, rejeição, preço, regra de
  negócio ou pedir para lembrar/esquecer — grave na hora.
---

# Memória persistente

## Objetivo
Fazer regras sobreviverem à sessão: o que o utilizador declara uma vez vale
para sempre, sem re-perguntar.

## Estrutura

- `mem://index.md` — sempre em contexto. **Core** (one-liners <150 chars
  aplicados a TODA ação) + **Memories** (refs a ficheiros com descrição).
- `mem://<path>` — ficheiros temáticos com frontmatter
  `name`/`description`/`type` (`design`, `constraint`, `preference`,
  `feature`, `reference`).
- `mem://~user` — preferências cross-session do utilizador (flat, <2KB).
- `AGENTS.md` (raiz) — decisões técnicas/estruturais com o porquê.

## Quando gravar (imediatamente)

- Preferência, correção ou rejeição (nunca re-propor ideia rejeitada).
- Fatos de negócio: preços, taxas, horários, áreas, fórmulas, palavras banidas.
- "Lembra de X" / "esquece X" → agir na hora.

## Como gravar

Duas escritas em paralelo (sem dependência entre elas):
1. O ficheiro `mem://<path>` com frontmatter + conteúdo.
2. A atualização do `mem://index.md` (Core se universal; Memories se detalhado).

## Divisão de responsabilidades

| Vai para | Exemplos |
|---|---|
| **Memória** | Valores escolhidos: preços, cores, fontes, tom, regras de negócio |
| **AGENTS.md** | Decisões de arquitetura/estrutura (uma regra, um porquê; substitui a anterior, nunca empilha) |
| **Nunca** | Estrutura de código, paths, detalhes de implementação, nada óbvio do codebase |

## Armadilhas

- Duplicar regra em memória E AGENTS.md — escolher um único lar.
- Gravar "notas de sessão" em vez de regras aplicáveis.
- Index Core crescente demais: regras Core são para "uma sessão nova em
  qualquer página precisa disto?".
- Índice desatualizado: ao mudar/remover ficheiro, atualizar o índice no mesmo batch.
