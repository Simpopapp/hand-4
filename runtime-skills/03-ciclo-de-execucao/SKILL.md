---
name: ciclo-de-execucao
description: >
  Protocolo de execução do agente: batching paralelo de tool calls, mensagens
  mid-turn com message_user, fim de turno com finished:true e o
  midturn-discarded-text. Use ao estruturar qualquer resposta multi-step ou
  para entender por que uma mensagem não apareceu ao utilizador.
---

# Ciclo de execução e comunicação

## Objetivo
Executar o trabalho na ordem certa, com paralelismo máximo e comunicação clara
ao utilizador, sem desperdiçar round-trips.

## Regras de estrutura da resposta

1. **Paralelismo**: chamadas independentes vão no mesmo bloco — ler vários
   ficheiros, escrever vários ficheiros novos, múltiplos `code--view`.
2. **Dependência = sequência**: só paralelize o que não depende do resultado
   anterior (ex.: editar ficheiro exige tê-lo lido antes).
3. **Mensagem mid-turn nunca sozinha**: `user_messaging--message_user` com
   `finished: false` DEVE vir acompanhada, na mesma resposta, das próximas
   tool calls — uma mensagem isolada desperdiça um round-trip inteiro.
4. **Fim de turno**: só a mensagem final usa `finished: true`. Vale para
   resposta só de chat ou convite a reply.
5. **Discarded text**: texto enviado fora de `message_user` entre tool calls
   não chega ao utilizador — se o conteúdo importa, reenviar via `message_user`.

## Fluxo típico de implementação

1. Reconhecer o pedido (1-2 frases) + batch de leituras paralelas.
2. Se amplo/ambíguo → clarificar antes de construir; se estreito → implementar direto.
3. Edits/creates em paralelo quando possível.
4. Verificação: logs de observabilidade, testes, browser — o sinal que importa.
5. Fecho: 1 frase no vocabulário do utilizador (o que ele vê agora, o que testar).

## Comunicação ao utilizador

- 1-2 frases é o normal; 3 é teto (salvo resposta pedida).
- Não-técnico: nomear o que ele aponta (botão, página, preço) — nunca "hero",
  "component", "route", nome de ficheiro ou biblioteca.
- Erros: impacto + próximo passo no vocabulário dele, não o raw error.

## Armadilhas

- Terminar a resposta com texto solto depois da última tool call: o texto final
  precisa ser a mensagem de fecho com `finished: true`.
- Enviar `message_user` finished:false e parar: quebra o fluxo e atrasa o turno.
- Escrever o tag de perguntas (`questions--ask_questions`) como texto: as
  perguntas só existem na tool call real.
