Protocolo dos 3 arquivos (planejamento → PRD → roadmap)

O trabalho agentico de remix é guiado por 3 arquivos (N = 1 neste projeto; com ou sem extensão `.md`, é o mesmo arquivo):

| Arquivo | Papel |
|---|---|
| `project{N}` | Planejamento: o QUÊ e o POR QUÊ (falhas, direção, ordem lógica ou idealização do projeto). Fonte de verdade do escopo. |
| `prd-project{N}` | PRD: o COMO. Decisões técnicas, escopo por fase, critérios de aceite. |
| `roadmap-proj{N}` | Roadmap: fases em ordem de dependência, checkboxes e gates. Registro de progresso. |

### O que fazer, conforme o que existe (a ordem de criação dos arquivos não importa, mas todos devem existir e serem preenchidos e seguidos conforme as necessidades do projeto)
- **Os 3 existem:** execute o roadmap, a partir da primeira fase não concluída.
- **2 existem:** crie o que falta e depois execute.
- **1 existe:** crie os outros 2 (ordem: planejamento → PRD → roadmap) e depois execute.
- **Nenhum existe:** informe o project-monitor e em seguida o usuário (a proxima mensagem do usuário deve ser imediatamente colada em project{N} substituindo o "null")
- **NULL** "null" demarca a não existencia (nesse caso a prioridade é preenche-lo e registrar através do project monitor que aguarda a atualização de um dos arquivos para iniciar o projeto). é obrigatorio confirmar que o agente leu a mensagem

### Como criar o que falta + numero de linhas esperado de cada um
- **PRD:** derive do planejamento (e do roadmap, se existir). Você conhece o ambiente melhor que o planejamento: confirme no código o que ele afirma, escolha a melhor solução técnica, escreva escopo por fase e critérios de aceite. Não copie o planejamento. (min: 500 / max: 1000)
- **Roadmap:** uma fase por bloco do planejamento/PRD, em ordem de dependência, com checkboxes e uma linha de Gates por fase. (min: 20 / max: 50)
- **Planejamento** (se só houver PRD/roadmap): reconstrua a intenção: problemas, direção e ordem lógica para cria-los a partir disso. (min: 1 / max: 100)
- **Qualidade acima da facilidade** nunca preencha o numero de linhas pensando em concluir atingir o numero de linhas forçadamente pra completar a tarefa, use como oportunidade criativa para planejar os detalhes, cada linha tem o seu propósito e importancia para atingir o auge do potencial sem se limitar pela praticidade da realização de tarefas simples ou mal planejadas

### Como executar
- Siga o roadmap fase a fase. Só avance quando os gates da fase passarem (seção 19) e marque `[x]` no roadmap, com a linha de Gates.
- Se o roadmap tiver uma fase "planejar o PRD", executá-la é criar o PRD.
- Só mude a ordem das fases com justificativa registrada no próprio roadmap.
- Precedência: no escopo (o quê), planejamento > PRD > roadmap. No "como", o PRD manda.
- Antes de executar, confira se PRD e roadmap tratam do mesmo projeto e versão do planejamento (título, fases, escopo). Se divergirem, trate-os como desatualizados: refaça o PRD a partir do planejamento e reabra o roadmap.
- Nunca pergunte ao usuário (sem `ask`). Em caso de dúvida, decida e registre a decisão no PRD.
- Ao concluir tudo, reporte (seção 20) e crie a checagem de 5 min / 10 tentativas por novos arquivos ou fases.
- Esta seção prevalece sobre a regra 3 do `Plan.md` em caso de conflito.
- Nunca perguntar ao usuário o que fazer durante um remix sem ter concluido ao menos 1 fase completa do roadmap

### Quando executar
- Sempre que um remix for ativado através do comando "I've successfully remixed this project. What would be a good next step?"

### Quando e como finalizar
- Sempre que um grande objetivo do roadmap for concluido 
- Obrigatorio avisar o opencode que o remix foi finalizado com a seguinte mensagem: "remix finalizado (+{N} da etapa do roadmap que foi efetuada)
- Em tarefas de complexidade media/alta sempre guie o agente para olhar as melhores tools e skills e utiliza-las da melhor forma para realizar cada tipo de trabalho


