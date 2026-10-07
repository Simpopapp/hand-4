# Como funciona o handoff de etapa

## Do lado do builder

Quando uma etapa do roadmap termina:

1. Registrar um status curto em:
   `docs/planning/stages/stage-NN-status.md`

   Exemplo de conteúdo:

   ```markdown
   # Stage NN — <título>

   Status: completed
   Date: YYYY-MM-DD

   ## O que foi entregue
   - ...

   ## Arquivos / áreas tocadas
   - ...

   ## Notas para o monitor
   - ...
   ```

2. Enviar ao monitor uma mensagem com pelo menos:
   - o número da etapa (NN)
   - um resumo de que a etapa terminou

   Exemplo:

   > Stage 03 completed. Please evaluate against PRD and roadmap.

## Do lado do monitor

Ao receber a mensagem de finalização:

1. Identificar o número da etapa.
2. Carregar:
   - `docs/planning/PRD.md`
   - `docs/planning/ROADMAP.md`
   - `docs/planning/stages/stage-NN-status.md`
3. Inspecionar o código relevante.
4. Escrever `docs/planning/reports/stage-NN-eval.md` no formato descrito no `AGENTS.md`.

## Por que esse desenho aguenta ambiente efêmero

- A árvore de planejamento fica no projeto → permanece quando só o binário some.
- O script de recovery recoloca OpenCode e o `AGENTS.md` em poucos passos.
- O handoff é por arquivos + mensagem de etapa; não depende de estado longo compartilhado além do servidor do OpenCode.
