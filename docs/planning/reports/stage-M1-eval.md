# Avaliação — Stage M1

**Data:** 2026-10-07
**Veredito:** concluída
**Confiança da avaliação:** alta

## Resumo executivo
M1 (verificador + requisitos + fixtures) está evidenciado no disco e foi reexecutado por este monitor: as 5 fixtures inválidas resultam em FAIL com contagem real de falhas, a suíte vitest passa 12/12, `tsc --noEmit` limpo e `build` verde. O verificador é independente do solver (nenhum import de geração; solver sequer existe ainda) e a paridade contra tradução literal de VM:154-182/260-282 está testada. Uma imprecisão no relato (contagem de regras e "lint OK" global) e um detalhe de causa raiz não persistido são registrados abaixo, sem bloquear o avanço para M2.

## Cobertura de requisitos
- Atendido: `harness/src/` com parser GLB + árvore + bbox locais (`glb.ts`), normalização paritária (`normalize.ts`), schema + apply (`pose.ts`), CLI + regras (`verify.ts`); `requirements.yaml` com 7 categorias (estrutural, tipagem, spec, técnica, continuidade, visual, matemática); `make-fixtures.ts` gerador determinístico; 5 fixtures inválidas; teste de paridade + gate de fixtures em `harness/parity.test.ts`; `STATE.json` com M1 done/PASS e decisions D4–D5; `NOTES.md` com seção "M1 concluído"; roadmap M1 com os 3 itens `[x]` e linha de Gates.
- Parcial: causa raiz do cruzamento ("eixo Y do braço é twist, não move o cotovelo — busca numérica encontrou rotação real") consta só na mensagem de entrega, não em `STATE.json`/`NOTES.md` — relevante para o solver M2 não repetir o erro de eixo.
- Ausente / não evidenciado: nada funcional. `docs/PRD-PROJECT2-v4.md` segue ausente (D1 continua valendo).

## Qualidade do código
Pontos fortes: reexecução independente confirma os números do relato — rest_pose 1 FAIL (fingers), no_renames 3 FAILs (handR + renames + anchor), crossed 3 FAILs (joint_limits 140.5°/139.0° > 120°, fingers, forearm_separation 0.0067m < 0.012m), schema/extra_fields rejeição de entrada com FAIL real + UNVERIFIEDs (veredito FAIL, pois UNVERIFIED ≠ PASS); semântica correta de `root_identity` (TRS de descanso do bake, não transform de runtime); `chain_continuity` em espaço local (imune ao runtime); D4 (união per-mesh × matrixWorld) e D5 (comparação de quaternion componente a componente) plausíveis e documentadas.
Atenção: contagem de regras — o relato diz "19 regras", o `requirements.yaml` lista 18 checks (5+1+1+3+2+4+2). Diferença cosmética, mas o número oficial é 18.

## Discrepâncias
1. "lint OK" é impreciso no escopo global: `bun run lint` falha com 9 erros prettier em `src/routes/index.tsx` (placeholder do template, fora do escopo M1, intocado pela fase). `bunx eslint harness/` está limpo (0 erros) — o gate de lint da fase passa no escopo que lhe compete, mas o relato deveria ter qualificado. 2. Contagem "19 regras" vs 18 checks reais. 3. Twist-do-eixo-Y não persistido em decisions. Nenhuma altera o veredito.

## Riscos para as próximas etapas
- M2 (solver em espaço R) deve reutilizar os eixos corretos de rotação — o aprendizado do twist precisa virar restrição do solver, senão o cruzamento volta.
- `three` agora é dependência real do harness (vitest executou com three); confirmar que o install não contaminou o bundle do app além do necessário.
- Fixtures schema/extra_fields passam com veredito FAIL via 1 FAIL + 16 UNVERIFIED — correto pela regra, mas M2 deve produzir ao menos uma pose PASS de ponta a ponta para provar que o verificador também aprova o válido (hoje só há prova negativa).

## Recomendações
Antes ou durante M2: (a) registrar D6 com a causa raiz do eixo twist; (b) corrigir ou isentar `src/routes/index.tsx` do gate de lint (não é escopo do remix, mas o "lint OK" global seguirá falso até lá); (c) em M2, exigir a primeira pose PASS real no verificador como gate de saída. Sem correções exigidas em M1.

## Evidências consultadas
- `harness/src/glb.ts`, `normalize.ts`, `pose.ts`, `verify.ts` (reexecução via `bun harness/src/verify.ts` nas 5 fixtures)
- `requirements.yaml` (18 checks, 7 categorias), `harness/make-fixtures.ts`, `harness/fixtures/*.json`, `harness/parity.test.ts`
- `STATE.json` (M1 done/PASS, D4–D5), `NOTES.md`, `.opencode/roadmap-proj.md`
- Gates: `bunx vitest run` 12/12 (2 arquivos), `bunx tsc --noEmit` limpo, `bun run build` verde, `bunx eslint harness/` limpo, `bun run lint` global com 9 erros preexistentes em `src/routes/index.tsx`
