# Stage M2 — status (builder)

**Data:** 2026-10-07
**Fase:** M2 — Geração de poses em espaço R (GLB cru da arma)
**Status registrado:** concluída, gates PASS

## O que foi entregue

1. **Medição antes de posar** (`harness/src/measure2.ts`, `measure3.ts`, `grip.ts`): geometria dos grips medida nos GLBs reais e registrada em `requirements.yaml` (`gripGeometry`), com emenda da regra de wrap (D7): distância perpendicular das pontas ao EIXO do grip, não raio ao redor da âncora.
2. **Solver em espaço R** (`harness/src/solve.ts`, v3): autores rotações de bones do `viewmodel_arms.glb` contra o rig da arma (espaço R), avaliando pelo mesmo pipeline do jogo (paridade M1). Init analítica do frame da mão a partir da geometria medida; alvos na superfície do cilindro; wrapDir testado nos dois sentidos.
3. **Pacotes de pose aprovados**: `poses/pose_rifle.json`, `poses/pose_pistol.json` — verificador **18/18 PASS, 0 FAIL, 0 UNVERIFIED** (relatórios: `docs/planning/reports/m2-verify-rifle.json` / `m2-verify-pistol.json`).

## Correções de causa-raiz nesta fase (sem correção no olho)

- v2: wRest 0.4→0.02, init analítica (convenções provadas em `convention-test.ts`), alvos na superfície do cilindro em vez de clamp em esfera.
- v3: (1) joint_limits — projeção dura nos limites com margem 0,5° (barreira soft deixava juntas no limiar exato e o ruído numérico as empurrava 0,1–0,2° além); (2) fingers_wrap_grip — peso da regra dura 400→4000 + polimento final só com regras do verificador + margens de palma (nu≤−0.63, |n.z|≤0.74).

## Gates

- Verificador: rifle e pistola PASS (18/18 cada); sem primitivas novas (1 mesh original); skin intacta (50 joints); renames `hand.R→handR` / `hand.L→handL` declarados.
- Globais: vitest 12/12, lint OK, tsgo OK.

## Evidências

- Saída do verificador (JSON): `docs/planning/reports/m2-verify-rifle.json`, `docs/planning/reports/m2-verify-pistol.json`
- Decisões: STATE.json D6–D9 (reconstituídas após limpeza do ambiente; ver nota em NOTES.md)

## Pós-avaliação do monitor (mesma data)

- Discrepância nº 1 do relatório resolvida: `npm run lint` agora sem erros (formatação via `eslint --fix` + tipagem explícita no lugar de `any` em harness/src/{debug-pistol,diag-controls,measure,measure2,measure3}.ts). Restam 6 warnings preexistentes de `react-refresh` em `src/` (não erros).
- Rótulo v2→v3 corrigido no cabeçalho de `solve.ts` e nas strings `source`/`notes` dos pacotes; poses regeneradas e re-verificadas: 18/18 PASS ambas.
- Margem fina monitorada para M3 (re-verificar bakes após quantização GLB): rifle |n.z|=0.74 (teto 0.75); pistola dot=−0.63 (piso −0.6).

## Próximo passo

- M3 — conversão/integração (Anexo B): attach H↔R, bakes `viewmodel_arms_pose_rifle.glb` / `_pistol.glb` em `public/game-assets/models/`, skinning autoritativo = three.js.
