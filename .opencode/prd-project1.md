# Prompt de continuação — PRD-PROJECT2 v4

Você vai **continuar** um trabalho parcial de empunhadura FPS (mãos segurando M4A1 e Glock) num jogo Three.js/TypeScript/Vite.

## Leia antes de qualquer edição (nesta ordem)
1. `docs/PRD-PROJECT2-v4.md` — **autoridade**. Em conflito com qualquer outro arquivo, vale o v4.
2. `STATE.json` e `NOTES.md`, se existirem. Se não existirem, comece em M0 criando-os.
3. `inputs/game_contract.md`, `inputs/src/ViewmodelV2.ts` e `inputs/MANIFEST.txt`.
4. O pacote experimental anterior (`poses/`, `models/`, `anchors.json`, `rig_report.json`, `verify_report.json`, `docs/INTEGRATION.md`) é **hipótese, não prova** (Anexo E do PRD).

## Estado herdado (resumo)
- `all_gates_passed` está `false`. As poses anteriores foram posicionadas só pelo punho + curl por preset, **sem SDF, sem solver, sem verificador**. Visualmente reprovadas (fuzil: mão à frente do grip com indicador para cima; pistola: boca aberta do braço visível na vista do jogador; antebraços cruzados no topo).
- O pacote anterior autorou os braços em espaço **H** (holder). O v4 manda autorar em espaço **R** (GLB cru da arma) e anexar a `model`. Converta (Anexo B), não refaça a solução do zero se ela passar no verificador.
- O `viewer.html` anterior reimplementa a normalização do jogo; substitua por um módulo `harness/` com teste de paridade (M1).

## Ordem de trabalho
1. **M0:** valide hashes/schemas, gere `asset_inventory.json` e `contract.json` do código, sonde a toolchain, crie `STATE.json`.
2. **M1 (não pule):** verificador + `requirements.yaml` + fixtures + controles. **As poses experimentais anteriores devem ser REPROVADAS** pelo verificador; se forem aprovadas, o verificador está errado.
3. **M2 → M3 → M4 → M5**, com os gates do PRD.

## Regras que não mudam
- Medir antes de posar; proibido corrigir no olho; toda mudança vem de causa raiz + regeração + verificação.
- Verificador independente do solver; skinning autoritativo = three.js.
- `UNVERIFIED` não é `PASS`. "Não implementado" não é "falhou".
- Não altere `inputs/`. Preserve mesh, skin, pesos e materiais do `viewmodel_arms.glb`; sem primitivas como mãos.
- Atualize `STATE.json` a cada gate e a cada reformulação do solver. Se a sessão acabar, termine o item atômico em curso, atualize `STATE.json`/`NOTES.md` e escreva o próximo passo exato neste arquivo.
- Não declare "pronto" sem `all_gates_passed: true` com zero `UNVERIFIED` e revisão visual (duas passadas) aprovada.
- Não faça perguntas ao dono; decida, registre em `STATE.json` (`decisions`) e siga.
