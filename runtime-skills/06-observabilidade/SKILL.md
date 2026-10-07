---
name: observabilidade
description: >
  Logs de /tmp/observability (build-errors, console, runtime-errors, network).
  Use após qualquer edit de código e antes de declarar algo consertado — é a
  fonte de verdade sobre o estado do build e do preview.
---

# Observabilidade: /tmp/observability

## Objetivo
Verificar mudanças com sinais reais em vez de declarar conserto sem prova.

## Ficheiros

| Ficheiro | Conteúdo | Quando ler |
|---|---|---|
| `build-errors.log` | Entrada com timestamp a cada build (erros ou "build OK") | Após edits e antes de qualquer "pronto" |
| `console-logs.log` | Consola do browser do preview (telemetria da mensagem atual) | Bugs de runtime/UI |
| `runtime-errors.log` | Erros de execução capturados no preview | Exceptions, stack traces |
| `network-requests.log` | Pedidos de rede do preview | Falhas de API, 4xx/5xx |

## Regras críticas

1. **A entrada mais recente de build-errors.log é o estado atual do preview.**
   Não declarar completo enquanto houver erros — consertá-los sem perguntar,
   inclusive os que precedem as mudanças atuais.
2. A entrada do build aparece **só depois** de a mensagem com os edits
   terminar: ler os logs numa mensagem posterior, nunca no mesmo batch do edit.
3. Logs de consola/rede **não atualizam mid-turn** — refletem o momento em que
   o utilizador enviou a mensagem.
4. Ler com `code--exec` tolerante a ficheiro ausente (nunca `code--view` de
   path que pode não existir).

## Fluxo de depuração

1. Sinais disponíveis primeiro: logs, stack traces.
2. Escolher técnica por tipo: lógica → isolar e testar; UI/estado → Playwright
   + consola + rede; regressão → rodar testes; erro de biblioteca → busca web.
3. Fluxo: Diagnosticar → Investigar → Consertar → Validar.
4. **Consertar a categoria, não a instância**: se X está filtrado/ausente num
   caminho, enumerar os caminhos irmãos com a mesma premissa (rotas, fetchers,
   policies) e consertar no mesmo turno.

## Referências
- Skill `07-dev-server-preview` — gates de build e reinício do dev server.
