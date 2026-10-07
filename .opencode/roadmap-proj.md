# Roadmap — Proj1 (PRD-PROJECT2 v4: mãos FPS M4A1 + Glock)

Fonte: project1.md (planejamento) + prd-project1.md (continuação v4). Autoridade de escopo: prd-project1.md.
Foco (project1.md): verificação > geração — cada etapa valida antes de avançar; tratar como código, verificando em cada estágio.
Gates de verificação por etapa (project1.md): tipagem de entrada · validação da spec · checagem técnica · continuidade · visual · testes estruturais · testes matemáticos.

## M0 — Baseline e estado (CONCLUÍDA — Gates PASS)
- [x] Validar sha256 de `prd-proj1-assets/inputs/` contra `MANIFEST.txt` (9/9 OK, hash+tamanho)
- [x] Gerar `asset_inventory.json` (nós, bones, materiais, handR, muzzle/sight nos 3 GLBs)
- [x] Gerar `contract.json` derivado do código real (ViewmodelV2/Engine/viewmodelAssets/weapons)
- [x] Sondar toolchain (bun 1.3.3, node 22.22, three NÃO instalado, package anterior ausente) → `NOTES.md`
- [x] Criar `STATE.json` (all_gates_passed=false, fase corrente M1, decisions D1–D3)
- Gates M0: PASS — hashes ok + inventário completo + contract consistente + STATE.json válido. Achado crítico: bake precisa renomear `hand.R` → `handR` (jogo procura nome exato).

## M1 — Verificador + requisitos + fixtures (não pular)
- [x] `harness/` com normalização paritária ao jogo + teste de paridade (11/11 testes; glb.ts/normalize.ts/pose.ts)
- [x] `requirements.yaml` (7 categorias) + 5 fixtures + CLI `harness/src/verify.ts`
- [x] REPROVAR as poses experimentais anteriores pelo verificador — sem pacote anterior em disco (D3), as 5 fixtures representam os defeitos documentados e TODAS falham com FAIL real (rest_pose 1 FAIL; no_renames 3; crossed 3 — forearm_separation 0.0067m<0.012m; schema/extra_fields rejeição de entrada)
- Gates M1: verificador independente do solver ✓ (regras próprias, sem solver); poses antigas = FAIL ✓; paridade harness/jogo comprovada ✓ (tradução literal VM:154-182/260-282). Gates globais: vitest 12/12, lint OK, tsgo OK, build OK.

## M2 — Geração de poses em espaço R (GLB cru da arma) (CONCLUÍDA — Gates PASS)
- [x] Medir antes de posar (SDF/ancoras medidas, sem correção no olho) — grip.ts/gripGeometry (D6)
- [x] Solver autorando em espaço R; attach à `model` (não ao holder) — solver v3, poses/pose_{rifle,pistol}.json (D8/D9)
- Gates M2: PASS — toda pose nova PASS no verificador (rifle e pistola 18/18, 0 UNVERIFIED); sem primitivas; skin/pesos do viewmodel_arms.glb preservados (50 joints, 1 mesh); vitest 12/12, lint OK, tsgo OK.

## M3 — Conversão/integração (Anexo B) + bakes
- [ ] Converter/validar attach H↔R; gerar bakes (`viewmodel_arms_pose_rifle.glb` / `_pistol.glb`)
- Gates M3: skinning autoritativo = three.js; bakes passam no verificador e carregam no jogo.

## M4 — Revisão visual (duas passadas)
- [ ] Passada 1 rifle + passada 2 pistola: vista do jogador, sem braços cruzados, sem boca aberta do braço, indicador alinhado ao grip
- Gates M4: duas passadas aprovadas com evidência (screenshots/render) anotadas em STATE.json.

## M5 — Fechamento
- [ ] `all_gates_passed: true`, zero `UNVERIFIED`, relatório final + handoff
- Gates M5: STATE.json final revisado pelo monitor; relatório em `docs/planning/reports/`.

## Riscos registrados pelo monitor
- `docs/PRD-PROJECT2-v4.md` ausente → prd-project1.md atua como PRD até recriação; divergências viram `decisions` no STATE.json.
- prd-project1.md (28 linhas) < mínimo de PRD do plan.md — recriar PRD completo como parte de M0/M1 se necessário.
