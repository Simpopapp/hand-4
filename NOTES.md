# NOTES.md — PRD-PROJECT2 v4 (mãos FPS)

## Toolchain (sondada em M0, 2026-10-07)
- bun 1.3.3 / node v22.22.0 / python3 (usado para inventário GLB)
- three.js: NÃO instalado no package.json deste projeto Lovable (TanStack Start). Instalar via `bun add three @types/three` em M1 (harness) — sem tocar no app web.
- Sem `public/game-assets/models/` — os GLBs de input vivem em `prd-proj1-assets/inputs/models/`; copiar para `public/game-assets/models/` só em M3 (integração), nomeando os bakes como o jogo espera (`viewmodel_arms_pose_rifle.glb`, `viewmodel_arms_pose_pistol.glb`).

## Fatos medidos (M0)
- `viewmodel_arms.glb`: 66 nós, 1 skin com 50 joints (esqueleto rigify: clavicle/deltoid/arm/forearm/hand + dedos f_*/thumb), 8152 tris, 1 animação (caucasian_male_1|Action).
- Nomes de bones com ponto: `hand.R`, `hand.L` — o jogo procura `handR` EXATO (ViewmodelV2.ts:278). **Bake precisa renomear `hand.R` → `handR`** (e idealmente `hand.L` → `handL` para simetria futura).
- `viewmodel_pistol.glb`: 3 nós, sem muzzle/sight → fallbacks do jogo se aplicam.
- `viewmodel_rifle.glb`: 13 meshes (M4A1 com Magazine, Barrel, Charging_Handle, Ejector, Sight).

## Sessão / recuperação
- OpenCode (project-monitor) reinstalado em `/root/.opencode/bin/opencode`, serve na porta 4096, sessão do relato: `ses_eeb6c52f3ffecNQFFM40idzyPi`.
- Roadmap criado em `.opencode/roadmap-proj.md` (estava null) após confirmação do monitor.
- Próximo passo exato: **M1** — criar `harness/` (normalização paritária + teste de paridade), `requirements.yaml` e fixtures; provar que o verificador reprova poses inválidas.

## M1 concluído (gates PASS)
- Verificador: `bun harness/src/verify.ts --pose <pkg> [--out <report>]`; regras de requirements.yaml em 7 categorias (estrutural, tipagem, spec, técnica, continuidade, visual, matemática).
- Fixtures (todas FAIL, provadas): rest_pose, no_renames, crossed_forearms (forearm_separation 0.0067m < 0.012m), schema, extra_fields.
- Paridade: buildWeaponRig/buildFullRig/attachArms vs tradução literal de VM:154-182 e VM:260-282 — 11/11.
- Correções de causa raiz nesta fase: (1) center por união per-mesh × matrixWorld (setFromObject do jogo); (2) comparação de quaternion componente a componente (rig não normalizado → angleTo falso positivo); (3) ROOT portável bun/node (fileURLToPath).
- Próximo passo: M2 — medir âncoras (SDF) nos GLBs das armas e gerar poses em espaço R com solver, sem correção no olho.
