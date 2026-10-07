# Avaliação — Stage M2

**Data:** 2026-10-07
**Veredito:** concluída
**Confiança da avaliação:** alta

## Resumo executivo
M2 (poses em espaço R geradas pelo solver a partir de geometria medida) está evidenciado no disco e foi reexecutado por este monitor: `poses/pose_rifle.json` e `poses/pose_pistol.json` (41 bones cada) resultam em PASS 18/18, 0 FAIL, 0 UNVERIFIED no verificador, com skin intacta (50 joints), 1 primitiva original e renames `hand.R→handR`/`hand.L→handL` declarados. O solver v3 (`harness/src/solve.ts`) ancora-se na geometria medida (`grip.ts` → `gripGeometry` em `requirements.yaml`) e as correções de causa-raiz v2/v3 estão provadas no código. As 5 fixtures inválidas da M1 continuam todas FAIL após a emenda D7, e os gates funcionais passam (vitest 12/12, `tsc --noEmit` limpo, build verde). Única ressalva: "lint OK" é falso — `bunx eslint harness/` tem 166 erros prettier (formatação, sem impacto lógico), introduzidos pelos arquivos novos da M2.

## Cobertura de requisitos
- Atendido: medição antes de posar (`measure2.ts`, `measure3.ts`, `grip.ts` → `gripGeometry` rifle/pistola idêntica em `grip.ts` e `requirements.yaml`); solver em espaço R com init analítica, alvos na superfície do cilindro, wrapDir bidirecional (`solve.ts`); pacotes `poses/pose_rifle.json`/`pose_pistol.json` com 18/18 PASS cada (reexecutado neste turno, confere com `m2-verify-*.json` byte a detalhe); sem primitivas novas; skin 50 joints; renames obrigatórios; decisões D6–D9 presentes em `STATE.json` (fase M3, M2 done/PASS) e seção "M2 concluído" em `NOTES.md`; roadmap M2 com os 3 itens `[x]` e linha de Gates.
- Parcial: margens finas em duas regras visuais — rifle `|n.z|=0.74` contra teto 0.75 (folga 0.01) e pistola `dot=-0.63` contra piso −0.6 da regra (exatamente na margem interna do solver). PASS determinístico confirmado, mas a conversão M3 (bake GLB) pode introduzir ruído numérico.
- Ausente / não evidenciado: nada funcional. `docs/PRD-PROJECT2-v4.md` segue ausente (D1 continua valendo; PRD/ROADMAP canônicos seguem placeholders, autoridade real em `.opencode/roadmap-proj.md` + `prd-project1.md`).

## Qualidade do código
Pontos fortes: reexecução independente confirma os números do relato nas duas poses; causas-raiz v3 provadas no código — projeção dura com margem 0,5° (`setDeltas`, `limitFor(name) - 0.5*DEG`), peso do wrap 400→4000, polimento final só com regras do verificador, margens de palma nu≤−0.63/`|n.z|`≤0.74, alvos do rifle em arco alcançável (theta 140/120/95/68); verificador independente do solver (nenhum import de `solve.ts` em `verify.ts`, só docstring que o cita); emenda D7 documentada no cabeçalho do `requirements.yaml` com os números medidos (pistola 0.048m, rifle 0.051m fora do eixo); fixtures antigas continuam reprovadas com FAIL real (rest_pose agora 2 FAILs sob a regra perpendicular mais estrita — esperado, não regressão).
Atenção: `bunx eslint harness/` = 166 erros, todos `prettier/prettier` (formatação dos arquivos novos da M2); `bun run lint` global = 181 problemas (harness + 9 preexistentes em `src/routes/index.tsx`, já anotados na eval M1). Nenhum erro de tipo ou lógica — só estilo.

## Discrepâncias
1. "lint OK" é falso no escopo global e no do harness: 166 erros prettier em `harness/` (M1 estava limpo — regressão de formatação introduzida pela M2) + preexistentes em `src/routes/index.tsx`. Gate funcional não afetado, mas o relato deveria ter qualificado. 2. Cabeçalho de `solve.ts` diz "v2" e `notes` das poses diz "M2 v2", enquanto o relato/STATE falam em "solver v3" — o corpo do código contém as mudanças v3 (peso 4000, polimento, margens), então é deriva de rótulo, não de conteúdo. 3. Relato fala em "deltas", poses usam chave `bones` (41 entradas) — o verificador aceita (`applyPose` lê `bones`), deriva terminológica sem efeito.

## Riscos para as próximas etapas
- Margens finas (rifle `|n.z|`, pistola `dot`) podem virar FAIL no bake M3 por ruído de quantização GLB — M3 deve re-verificar os bakes e, se necessário, repolir com margem interna mais folgada.
- Lint de formatação pendente: normalizar com `bunx eslint --fix` (ou prettier) antes de M4 para o gate "lint OK" voltar a ser verdadeiro.
- M3 gera `public/game-assets/models/viewmodel_arms_pose_{rifle,pistol}.glb` — lembrar o rename `hand.R→handR` no bake (achado M0) e confirmar skinning autoritativo three.js.

## Recomendações
Antes ou durante M3: (a) correr o fix de formatação no harness e confirmar `bunx eslint harness/` limpo; (b) ao bakear, reexecutar o verificador sobre os GLBs e tratar qualquer flip das duas regras de margem fina como sinal para repolir, não como ruído a suprimir; (c) corrigir o cabeçalho "v2"→"v3" em `solve.ts`/poses quando tocar nesses arquivos. Sem correções exigidas em M2 — etapa aprovada como concluída.

## Evidências consultadas
- `poses/pose_{rifle,pistol}.json` (41 bones, renames hand.R→handR/hand.L→handL) + reexecução `bun harness/src/verify.ts --pose` (18/18 PASS ambas)
- `docs/planning/reports/m2-verify-rifle.json`, `m2-verify-pistol.json` (conferem com a reexecução)
- `harness/src/solve.ts` (setDeltas margem 0,5°, peso 4000, polimento, margens −0.63/0.74, arcos theta), `harness/src/grip.ts` vs `requirements.yaml` (gripGeometry idêntica)
- `harness/fixtures/*.json` (5/5 ainda FAIL: crossed 4, extra_fields 1+16 UNVERIFIED, no_renames 3+4 UNVERIFIED, rest 2, schema 1+16 UNVERIFIED)
- `STATE.json` (M2 done/PASS, D6–D9), `NOTES.md` (seção M2), `.opencode/roadmap-proj.md` (M2 `[x]`)
- Gates: `bunx vitest run` 12/12 (2 arquivos), `bunx tsc --noEmit` limpo (exit 0), `bun run build` verde, `bunx eslint harness/` 166 erros prettier, `bun run lint` global 181 problemas
