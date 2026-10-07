# Avaliação — Stage M0

**Data:** 2026-10-07
**Veredito:** concluída
**Confiança da avaliação:** alta

## Resumo executivo
M0 (baseline e estado) está integralmente evidenciado no disco: 9/9 hashes de inputs conferem, `asset_inventory.json` e `contract.json` correspondem ao código e aos GLBs reais, `STATE.json`/`NOTES.md` criados com decisions D1–D3, e o roadmap saiu de `null` para 40 linhas com M0 marcada `[x]`. O achado crítico `hand.R` → `handR` foi confirmado na fonte. Nada impede o início de M1.

## Cobertura de requisitos
- Atendido: validação sha256+bytes de `prd-proj1-assets/inputs/` contra `MANIFEST.txt` (9/9 OK, verificado por recomputação independente); inventário dos 3 GLBs (arms 66 nós / 50 joints / 8152 tris; pistol 3 nós / 30636 tris sem muzzle-sight; rifle 13 meshes / 30 nós / 9258 tris); `contract.json` derivado do código (weaponsConfig rifle/pistol, âncora L278, hierarquia, runtimeMods, bake URLs); `STATE.json` (phase M1, allGatesPassed false, M0 done/PASS, decisions D1–D3); `NOTES.md` (toolchain + fatos medidos + próximo passo M1); roadmap criado dentro do limite 20–50 linhas.
- Parcial: autoridade `docs/PRD-PROJECT2-v4.md` ausente — mitigado por D1 (`prd-project1.md` como PRD operacional); status canônico `docs/planning/stages/stage-M0-status.md` não escrito — mitigado por `STATE.json` + checkbox no roadmap, mas segue como lacuna de rastreabilidade.
- Ausente / não evidenciado: nada crítico para M0. Pacote experimental anterior (poses/, anchors.json, rig/verify reports) corretamente declarado inexistente — ausência confirmada em disco, não é omissão.

## Qualidade do código
Pontos fortes: números do `contract.json` conferem linha a linha com `ViewmodelV2.ts` (weaponsConfig 0.82/0.19, hip/sightTarget/armsScale/armsHandR, `getObjectByName("handR")` em L278 com early-return em L279, yaw 180° + escala); inventário GLB com joints rigify completos e `allNamedNodes` sem `handR` (só `hand.R`), sustentando D3/inventário; inputs intactos (hashes OK = escrita proibida respeitada); `STATE.json` válido e `NOTES.md` com recuperação de sessão.
Atenção: `STATE.json` usa `allGatesPassed` camelCase vs `all_gates_passed` do PRD-texto — cosmético, sem impacto; `contract.json` não cita `Engine.ts`/`AssetLoader.ts` além do inventário — aceitável para M0, detalhar em M1 se o harness precisar.

## Discrepâncias
Nenhuma divergência material entre status e código. Três notas menores: (1) relato diz "13 meshes: Magazine, Barrel, Charging_Handle, Ejector, Sight" — inventário confirma meshCount 13 e os 5 nós-chave listados (o resto são sub-nós Sight_2/Switch/Ejector_2/Lid etc.); (2) relato diz pistol "sem muzzle/sight" — inventário confirma (só `Cube.010_Cube.016`, `glock.obj`); (3) roadmap marca M0 CONCLUÍDA antes deste veredito do monitor — ordem invertida mas conteúdo verificado, sem correção exigida.

## Riscos para as próximas etapas
- M1 instala `three` — fazer isolado do app TanStack (harness/ + script), sem `bun add` no `package.json` do jogo, senão o preview Lovable ganha dependência pesada.
- Gate M1 adaptado (reprovar fixtures sintéticas em vez das poses antigas, que não existem) é correto, mas o verificador precisa de fixtures *inequivocamente* inválidas (mão à frente do grip, indicador para cima, boca do braço visível, antebraços cruzados) para não virar teste tautológico.
- `handR` ausente no GLB cru: todo bake M3 precisa criar/renomear o nó — se o pipeline esquecer, os braços colapsam na origem (L279).

## Recomendações
Prosseguir para M1 exatamente como planejado: `harness/` com normalização paritária + teste de paridade, `requirements.yaml`, fixtures + controles, verificador independente do solver. Manter `inputs/` read-only e atualizar `STATE.json` a cada gate. Sem correções exigidas em M0.

## Evidências consultadas
- `.opencode/project1.md`, `.opencode/prd-project1.md`, `.opencode/roadmap-proj.md` (40 linhas, M0 `[x]`)
- `STATE.json`, `NOTES.md`, `asset_inventory.json` (268 linhas), `contract.json`
- `prd-proj1-assets/MANIFEST.txt` + recomputação sha256 independente (9/9 OK)
- `prd-proj1-assets/inputs/src/ViewmodelV2.ts` (L50–90 weaponsConfig, L270–281 âncora), `viewmodelAssets.ts` (bakes `viewmodel_arms_pose_*.glb`)
- Ausências confirmadas: `poses/`, `anchors.json`, `docs/PRD-PROJECT2-v4.md`, `three` em `package.json`, `bun 1.3.3 / node v22.22.0`
