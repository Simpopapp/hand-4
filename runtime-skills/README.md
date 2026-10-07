# Runtime-Skills — Agente Principal da Sandbox

> Skills de runtime do agente principal (o orquestrador que fala com o utilizador),
> **antes** do OpenCode. Seguem a mesma lógica das tool-skills (`.opencode/tools-skills/`),
> mas o domínio aqui é o **próprio funcionamento do agente**: como ele é montado,
> como executa, como vê o mundo e como delega.

Fontes primárias da catalogação: `.opencode/TOOLS.md` (catálogo completo de ferramentas),
`.opencode/metodologia-skills` (método), `AGENTS.md` (raiz), estado real do disco
(`/bin`, `/tmp/observability`, `/tmp/knowledge/skill`, `.workspace/skills/`, `.opencode/mcp/`).

---

## Mapa hierárquico do runtime

```
Agente Principal (orquestrador)
│
├── 01-sessao-e-prompt/          Como as instruções são montadas por camadas a cada mensagem
├── 02-ferramentas-diferidas/    tool_search + dispatch: descobrir e invocar tools não visíveis
├── 03-ciclo-de-execucao/        Tool calls, paralelismo, mensagens ao utilizador, fim de turno
├── 04-memoria/                  mem://, mem://~user, AGENTS.md — regras persistentes
├── 05-skills-e-conhecimento/    .workspace/skills, /tmp/knowledge, lovable-skills
├── 06-observabilidade/          /tmp/observability — logs de build, runtime, consola, rede
├── 07-dev-server-preview/       Vite :8080, restart supervisado, gates de build
├── 08-browser-autenticacao/     Playwright via shell, sessão injetada, segredos
├── 09-gateway-cli/              CLI `lovable` (53 comandos, AGW_URL/AGW_TOKEN)
├── 10-clis-complementares/      /bin/lovable-* (exec, skills, assets, storage, LSP, desktop)
├── 11-mcps-locais/              .opencode/mcp/ — gateway, lovable-tools, projectops
├── 12-sandbox-filesystem/       Hierarquia de paths (/dev-server, /bin, /mnt, /tmp, /tls)
├── 13-cloud-backend/            Lovable Cloud: migrations, RLS, GRANTs, storage
├── 14-delegacao-opencode/       OpenCode como motor de produção: health-check, rota /oc
│
└── (referência cruzada) .opencode/tools-skills/ — skills por ferramenta (outro domínio)
```

## Lógica individual e mútua das peças

| Peça | Papel individual | Como se liga às outras |
|---|---|---|
| **Sessão e prompt** (01) | Monta o contexto: instruções do sistema + conhecimento do projeto + memória + skills. É a "consciência" por mensagem. | Alimenta todas: decide quais skills (05) e memórias (04) entram; define o protocolo de execução (03). |
| **Tools diferidas** (02) | Economiza contexto: só schemas de tools em uso são carregados, sob demanda. | Chamada pelo ciclo de execução (03); catálogo mapeado em TOOLS.md e nas tool-skills. |
| **Ciclo de execução** (03) | Orquestra a ordem real: parallel batches, mensagens mid-turn, fim de turno. | Usa 02 para descobrir tools; reporta progresso ao utilizador; dispara gates da 07. |
| **Memória** (04) | Regras que sobrevivem à sessão (preferências, preços, proibições). | Injetada na sessão (01); `AGENTS.md` é o espelho técnico — nunca duplicar entre ambos. |
| **Skills e conhecimento** (05) | Conhecimento profundo sob demanda (3 níveis: frontmatter → SKILL.md → references). | Ativação decide pelo `description`; lê-se via `lovable-skills` (10) ou `code--view`. |
| **Observabilidade** (06) | Única fonte de verdade sobre o estado do build/preview. | Alimenta o loop de correção da 07; lida com `code--exec`. |
| **Dev server** (07) | Executa a app em `:8080`; reinício supervisado. | Gates dependem dele; browser (08) testa contra `http://localhost:8080`. |
| **Browser/autenticação** (08) | Verificação visual e E2E; sessão Supabase pré-mintada. | Usa o dev server (07); segredos seguem regras da 01/12. |
| **Gateway CLI** (09) | Operações de projeto via `lovable` (read-only na Cloud, drafts, security). | Autenticação via `AGW_URL`/`AGW_TOKEN` (injetados, nunca ecoados). |
| **CLIs complementares** (10) | Exec, skills, assets, storage, LSP, desktop — músculo da sandbox. | Muitos são embrulhados pelos MCPs locais (11); preferir o wrapper MCP. |
| **MCPs locais** (11) | Ponte estável agente → gateway/CLIs via JSON. | `gateway-tools`, `lovable-tools`, `projectops-tools` (`.opencode/mcp/`). |
| **Filesystem** (12) | Onde cada coisa vive e o que persiste. | Enquadra todas as peças: código em `/dev-server`, rascunhos em `/tmp`, entregáveis em `/mnt/documents`. |
| **Cloud backend** (13) | Persistência real: DB, auth, storage. | Migrations com GRANTs obrigatórios; RLS sempre; nunca "Supabase" no chat — dizer "Lovable Cloud". |
| **OpenCode** (14) | Motor de produção de código; o agente principal não escreve o corpo do código "na mão" quando disponível. | Recebe briefs do ciclo (03); UI embutida na rota `/oc` do app via proxy dev (07). |

## Como usar estas skills

1. **Ativação**: o `description` de cada SKILL.md é o roteador — diz quando usar e quando não usar.
2. **Progressive disclosure**: SKILL.md tem o fluxo; detalhes moram em `references/` quando existirem.
3. **Manutenção**: peça nova de runtime (tool, CLI, camada) → nova entrada no tema certo,
   no mesmo formato, logo que descoberta. Nunca duplicar o que já está em TOOLS.md ou tool-skills.
