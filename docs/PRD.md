# PRD — OpenCanvas

**Versão:** 2.0 — runtime visual multiagente  
**Data:** 2026-10-10  
**Estado:** Proposto para implementação  
**Produto:** OpenCanvas (antes `OpenCode Canvas`)  
**Idioma da interface:** preparado para internacionalização; português e inglês como idiomas prioritários  
**Documento relacionado:** `ADR.md`

> **Leitura autônoma:** este documento contém o contexto, os objetivos, o comportamento esperado, os limites e os critérios de aceite do produto. A implementação não deve depender de conversas anteriores.

## 1. Resumo executivo

O **OpenCanvas** é um **runtime visual multiagente, local-first**, acionado a partir de qualquer agente de codificação suportado. Ele converte solicitações em linguagem natural e informações do projeto em **artefatos visuais interativos, bonitos, legíveis e persistentes**, abertos em um navegador.

Exemplo: em qualquer projeto, o usuário digita `/canvas explique a arquitetura de autenticação` (OpenCode) ou pede ao Codex/Cursor/Claude Code via MCP para criar o mesmo canvas. O agente analisa o contexto permitido, escolhe uma composição visual apropriada, gera **apenas uma definição JSON validada (DSL)** e a entrega ao **OpenCanvas Core via MCP Gateway ou adapter nativo**. A página aparece em `http://127.0.0.1:<porta>/p/<project-id>/canvas/<slug>`.

**Decisão fundamental (v2.0):** o OpenCanvas **deixa de ser um plugin específico do OpenCode**. O Core — DSL, storage, validação, layout, projetos, revisões — é **agnóstico ao agente**. Cada agente é um **adapter substituível** sobre a mesma interface compartilhada. Instala-se **um único OpenCanvas por usuário**, não um Canvas por OpenCode.

**Não** é criado um novo app React por solicitação nem um app por repositório. Todos os agentes, projetos e sessões compartilham o mesmo processo de runtime, com isolamento lógico de dados por projeto e interoperabilidade total: um canvas criado pelo OpenCode pode ser atualizado pelo Codex e visualizado após ação do Cursor ou Claude Code.

O produto deve ser visualmente comparável a uma aplicação web bem projetada, e não a um diagrama improvisado ou a texto distribuído em cards.

## 2. Problema

Explicações sobre arquitetura, código, eventos, bancos de dados e decisões técnicas perdem clareza quando entregues somente em texto corrido no terminal. A alternativa comum de pedir ao agente que gere HTML/CSS/React sempre que se precisa visualizar algo cria problemas recorrentes:

- consumo de tokens para boilerplate, CSS, componentes e configuração repetidos;
- resultados visuais imprevisíveis, com qualidade desigual;
- manutenção difícil e retrabalho ao pedir alterações;
- múltiplos servidores, dependências e arquivos temporários;
- ausência de descoberta e histórico dos artefatos;
- dificuldade de reaproveitar o mesmo canvas entre sessões;
- **fragmentação por agente:** o usuário usa OpenCode, Codex, Cursor e Claude Code no mesmo projeto e perde os artefatos ao trocar de ferramenta.

## 3. Objetivos e princípios inegociáveis

> **Regra de produto:** o OpenCanvas deve ser agnóstico ao agente. Nenhuma regra de negócio, persistência, DSL, renderização ou gerenciamento de processos poderá depender de APIs específicas do OpenCode, Codex, Cursor ou Claude Code. Cada integração será um adapter substituível, responsável exclusivamente pela comunicação, descoberta de contexto e invocação das capacidades compartilhadas.

1. **Agnosticismo ao agente:** Core, DSL, storage, validação, runtime e identidade de projeto não importam SDKs de agente. Adapters são finos e substituíveis.
2. **Instalação única por usuário:** um `npx opencanvas install` configura todos os alvos; nenhum runtime, `node_modules` ou arquivo Canvas é adicionado automaticamente aos projetos.
3. **Runtime único:** no máximo uma instância *lógica* ativa por usuário, reutilizada por todos os agentes, sessões e projetos; pode iniciar sob demanda.
4. **Storage global por usuário:** independente do agente; interoperabilidade é requisito, não conveniência.
5. **Alta qualidade visual:** layout, tipografia, cores, espaçamento, diagramas e interações devem ter qualidade de produto profissional, com coerência visual entre canvases.
6. **LLM gera DSL, não frontend:** a saída padrão do agente é dados semânticos estruturados; React e CSS pertencem ao pacote de runtime.
7. **Persistência e edição:** cada canvas possui identidade, URL e revisões; mudanças localizadas não exigem recriação total; revisão otimista vale para qualquer agente.
8. **Visualização semântica:** escolher a representação mais adequada ao assunto (diagrama, comparação, sequência, código, dashboard etc.), não apenas decorar texto.
9. **Local-first:** dados locais por padrão, sem conta, nuvem ou backend remoto obrigatório.
10. **Segurança:** nenhuma definição DSL pode executar JavaScript, HTML perigoso ou código de projeto no navegador.
11. **Economia total:** minimizar tokens de geração **e correção**, sem sacrificar legibilidade ou fidelidade técnica.
12. **Implementação incremental:** mudanças independentes com specs, testes e aceite; o desenvolvimento utilizará **OPSX/OpenSpec**.

### 3.1. Prioridade de compatibilidade

| Agente | Prioridade | Integração |
| --- | --- | --- |
| OpenCode | P0 — principal | Plugin nativo + comando `/canvas` + skill |
| Codex | P0 — secundário | MCP + skill |
| Cursor | P1 | MCP + skill/comando |
| Claude Code | P1 | MCP + skill |

OpenCode e Codex terão validação end-to-end como casos reais prioritários. Cursor e Claude Code também precisam funcionar, mas com menor prioridade de refinamento.

## 4. Público e cenários

**Usuário principal:** desenvolvedor que usa OpenCode, Codex, Cursor ou Claude Code para compreender código, arquitetura, processos e decisões — frequentemente mais de um no mesmo dia/projeto.

**Cenários prioritários:**

- compreender autenticação, autorização e ciclo de uma request;
- visualizar microserviços, filas, eventos e dependências;
- explicar entidades, relacionamentos e processos de banco de dados;
- comparar abordagens arquiteturais e trade-offs;
- ilustrar código, execução, estados e algoritmos;
- construir timeline de eventos, sequência de passos e dashboards explicativos;
- conservar explicações visuais para consulta ou evolução futura;
- **criar no OpenCode, continuar no Codex:** interoperabilidade entre agentes sem migração manual.

O canvas é uma **representação explicativa**, não uma fonte de verdade do código. O agente deve distinguir fatos observados de inferências e de hipóteses.

## 5. Experiência principal

### 5.1. Criar

```text
# OpenCode, a partir de qualquer repositório
/canvas explique o fluxo de autenticação e destaque onde o token é validado

# Codex / Cursor / Claude Code (via MCP + skill)
"Use opencanvas para explicar o fluxo de autenticação e destacar onde o token é validado"
```

Fluxo esperado (idêntico para todos os agentes após o adapter):

1. O adapter encaminha a intenção ao agente e carrega a skill correspondente.
2. O agente obtém contexto do projeto atual pelas ferramentas permitidas do próprio agente.
3. Faz planejamento visual semântico: objetivo, ideias centrais, audiência, layout, agrupamentos e densidade.
4. Produz uma DSL **compatível com a versão instalada** do renderer.
5. Invoca a operação Canvas (`canvas_create` via MCP ou tool nativa OpenCode) com DSL + contexto de diretório explícito.
6. O Core valida, persiste no namespace do projeto, garante que o servidor global esteja disponível e retorna a URL.
7. O navegador abre o canvas criado; a resposta no agente também mostra título, identificador e URL.

O adapter OpenCode é nativo e mais integrado, mas **reutiliza as mesmas operações do Core** expostas via MCP. Nenhum comportamento do Core diverge por agente.

### 5.2. Atualizar sem destruir (incluindo cross-agent)

```text
/canvas no auth-flow destaque o Redis e inclua o cenário de token expirado
```

A operação deve identificar o canvas, carregar a versão atual e aplicar um patch mínimo com validação atômica. Não deve sobrescrever outros blocos ou decisões visuais sem necessidade. Se a referência for ambígua, o agente solicita escolha ou usa uma lista de candidatos.

Requisito cross-agent: um canvas criado pelo OpenCode deve aceitar `canvas_update` originado do Codex (e vice-versa) desde que o `project-id` canônico coincida e o `expectedRevision` seja válido. Conflito de revisão retorna estado atual para resolução consciente, independente do agente de origem.

### 5.3. Encontrar e navegar

```text
/canvas
```

Sem argumentos, o comando deve orientar a abrir a galeria do projeto corrente ou a galeria global. A navegação web oferece:

- página global com projetos e canvases recentes (com origem do agente como metadado, não como partição);
- página por projeto com busca e listagem;
- página individual por slug, com navegação e metadados (incluindo `updatedByAgent`);
- estados de vazio, erro e canvas inexistente devidamente desenhados.

### 5.4. Remover, preservar e reutilizar

A exclusão será explícita e exigirá confirmação na UI ou no fluxo do agente. A operação padrão é reversível por mecanismo de lixeira/soft delete ou restauração da revisão, conforme o desenho de armazenamento. Nunca excluir outro projeto por resolução equivocada. Exclusão feita por um agente deve ser visível/reversível por outro.

### 5.5. URLs

```text
http://127.0.0.1:4173/
http://127.0.0.1:4173/p/<project-id>
http://127.0.0.1:4173/p/<project-id>/canvas/<slug>
```

`4173` é **exemplo**, não porta garantida. O runtime usa a porta efetivamente negociada e retornada pelo gerenciador. Links continuam logicamente estáveis (projeto + slug); a porta é descoberta a cada inicialização. URLs são idênticas independente do agente que criou o canvas.

## 6. Instalação e distribuição globais

### 6.1. Interface de instalação proposta

```bash
npx opencanvas install
# ou seletivamente:
npx opencanvas install --targets opencode,codex
npx opencanvas install --targets cursor,claude
```

`opencanvas` é o **nome proposto** para o pacote unificado (sucessor de `opencode-canvas`), a ser criado/publicado. Este comando é a **CLI a ser implementada**; não se afirma que o pacote já exista no npm. A CLI deve oferecer `install`, `doctor`, `upgrade` e `uninstall` (e um comando opcional `open`), todos com `--targets`.

`--targets` aceita qualquer subconjunto de `opencode,codex,cursor,claude`. Sem flag, configura todos os alvos detectados. Re-execução com alvos diferentes apenas adiciona/remove adapters, sem duplicar runtime ou apagar dados.

### 6.2. Efeitos da instalação

Núcleo (sempre):

- Inicializa configuração e armazenamento globais do OpenCanvas em `~/.config/opencanvas/` (configurável via XDG/env).
- Disponibiliza Core, MCP Gateway/servidor, e runtime web **empacotados**; não gera um Vite novo por projeto nem copia fontes de UI para os repositórios.
- Registra o servidor MCP (`opencanvas`) para os alvos selecionados que usam MCP.
- Valida o ambiente e informa como usar em cada agente.

Por alvo:

- `opencode`: registra pacote `opencanvas` na configuração **global** de plugins (`plugin`, sem apagar outras entradas); cria/atualiza `~/.config/opencode/commands/canvas.md` e `~/.config/opencode/skills/canvas/SKILL.md`.
- `codex`: registra servidor MCP em `~/.codex/config.toml` (ou caminho efetivo da versão instalada) + instala skill em `~/.codex/skills/canvas/SKILL.md` (ou equivalente suportado).
- `cursor`: registra MCP em `~/.cursor/mcp.json` (global) + skill/comando equivalente conforme suporte da versão.
- `claude`: registra MCP em `~/.claude.json` / `claude mcp add` equivalente + skill em `~/.claude/skills/canvas/` conforme suporte da versão.

Na implementação devem ser respeitados os caminhos e formatos efetivos de cada agente — os acima são alvos lógicos, não hardcode. Caminhos exatos serão congelados nas specs de cada adapter após verificação contra a versão-alvo.

Estrutura lógica no Linux/macOS com configuração padrão:

```text
~/.config/opencanvas/
├── config.json                      # configuração do Core (porta, temas, retenção)
├── projects.json                    # registro de workspaces (compartilhado)
├── mcp.json                         # manifesto do MCP Gateway (tools, versão)
├── data/projects/
│   └── <project-id>/
│       ├── manifest.json            # índice reparável
│       └── canvases/
│           └── <canvas-id>.json     # documento canônico (com updatedByAgent)
└── state/                           # informações efêmeras de processo
    ├── runtime.json
    └── runtime.lock

# Adapters (não duplicam dados nem runtime):
~/.config/opencode/commands/canvas.md
~/.config/opencode/skills/canvas/SKILL.md
~/.codex/skills/canvas/SKILL.md (+ MCP registrado)
~/.cursor/... (+ MCP registrado)
~/.claude/... (+ MCP registrado)
```

Migração v1 → v2: se existir storage legado em `~/.config/opencode/canvas/`, o instalador oferece migração assistida para `~/.config/opencanvas/` com backup, sem perda. Instalação nova usa diretamente o caminho global.

O pacote npm e suas dependências ficam no cache do gerenciador global, **não** nas dependências do repositório. A instalação deve ser **idempotente**, não destruir configuração preexistente, detectar conflitos de `/canvas`, fazer backup antes de alterar arquivos do usuário, oferecer diagnóstico, preservar canvases no upgrade e não apagar dados sem consentimento no uninstall.

### 6.3. Múltiplos projetos, múltiplos agentes, uma instância

```text
OpenCode (Projeto A) ── adapter nativo ─┐
Codex    (Projeto A) ── MCP ────────────┼── OpenCanvas Core ── Runtime web global ── Browser
Cursor   (Projeto B) ── MCP ────────────┘   (DSL · Storage · Validation · Projects)
Claude   (Projeto B) ── MCP ─────────────── ▲
                                            │ mesma interface, mesmo storage
```

Cada sessão usa o contexto do próprio workspace via seu adapter, mas os canvases são armazenados em namespaces compartilhados por caminho canônico. Não se instala nada em A ou B. Mesmo com sessões/agentes simultâneos, o gerenciador reutiliza o mesmo processo do runtime.

## 7. Identidade de projeto e persistência

- A identidade é **compartilhada e agnóstica**: o identificador padrão deriva do caminho canônico da raiz do *Git worktree*; sem Git, usa o diretório de trabalho canônico. Adapters apenas informam `cwd`/`worktree` explícitos; o Core canonicaliza (symlinks, separadores, case) e deriva o ID.
- O `project-id` é estável para aquele caminho e não depende apenas do nome da pasta nem do agente; duas pastas `backend` distintas não podem colidir; o mesmo caminho via OpenCode ou Codex gera o mesmo ID.
- Trabalhos em subdiretórios do mesmo worktree pertencem ao mesmo namespace. Worktrees diferentes são independentes por padrão; o usuário poderá configurar alias/agrupamento no futuro.
- Nomes exibidos são amigáveis, mas URLs utilizam IDs e slugs seguros.
- O documento de canvas contém IDs estáveis por bloco, `schemaVersion`, `revision`, metadados (incluindo `createdByAgent`/`updatedByAgent` como informação, nunca como autoridade), conteúdo DSL e timestamps.
- O **arquivo do canvas é a fonte de verdade**; o `manifest.json` é índice reconstruível e nunca deve causar perda da fonte original.
- Escritas são atômicas, revisões verificadas por concorrência otimista cross-agent, com backup mínimo/restauração em caso de falha.
- Não é permitido que o agente persista canvas fora do storage controlado passando caminhos arbitrários; `projectId` nunca é autoridade vinda do LLM — é derivado pelo Core a partir do contexto verificado do adapter.

## 8. Qualidade visual: requisito de primeira classe

### 8.1. Resultado esperado

O Canvas deve ter estética **premium, técnica, editorial e contemporânea**. Deve demonstrar intenção de design em vez de parecer uma dashboard genérica, um template vazio ou uma página composta apenas por cards iguais.

Obrigatório:

- identidade consistente no app e nos artefatos;
- tipografia forte, hierarquia clara, legibilidade e espaços bem distribuídos;
- contraste acessível, escala tipográfica e largura de leitura adequadas;
- composição adequada ao conteúdo, evitando elementos desnecessários;
- densidade variável e controlada (resumo versus exploração detalhada);
- cores e ícones semânticos, não ornamentação gratuita;
- diagramas limpos, conexões legíveis, agrupamentos e auto-layout;
- destaque visual do ponto central e sequência narrativa compreensível;
- responsividade real, sem recortes ou sobreposição de componentes;
- interações elegantes, discretas e funcionais;
- temas coerentes aplicados a todos os componentes.

Idêntico para canvases criados por qualquer agente — qualidade é do runtime, não do adapter.

### 8.2. Design system e temas

O runtime inclui tokens de `color`, `typography`, `spacing`, `radius`, `shadow`, `elevation`, `motion`, `breakpoints` e estados interativos. O tema padrão deve ser escuro, técnico e sofisticado; haverá também ao menos um tema claro de qualidade equivalente. A API da DSL não permite CSS livre, cores hex arbitrárias ou Tailwind gerado pelo modelo. Para variedade visual, o renderer oferece **presets de composição** selecionáveis semanticamente.

### 8.3. Layout engine

Presets iniciais: `explanation`, `architecture`, `flow`, `comparison`, `timeline`, `dashboard`, `code-walkthrough`, `hierarchy`, `sequence` e `mixed`. Devem suportar composições internas distintas (ex.: simples, didática, editorial) sem exigir coordenadas do LLM.

### 8.4. Regras de apresentação do agente

A skill (distribuída de forma adaptada a cada agente, mesmo conteúdo normativo) deve:

- iniciar pela mensagem central e usar poucas ideias por seção;
- trocar parágrafos longos por visualizações quando realmente acrescentarem compreensão;
- escolher títulos informativos, rótulos curtos e agrupamentos semânticos;
- usar arquitetura/flow para relações, comparação para alternativas, sequência para ordem e código para detalhes executáveis;
- evitar cards redundantes, ícones irrelevantes e realces em excesso;
- preservar fatos, nomes de serviços e relações observadas no código;
- explicitar incerteza em informações inferidas.

O renderer deve impor limites seguros de densidade e comprimento, com fallback legível. Conteúdo excedente deve ser tratado por seções, tabs, accordions ou rolagem controlada — nunca truncado silenciosamente.

### 8.5. Gate de qualidade

Cada preset e componente precisa de fixtures de referência e testes de screenshot em desktop (ex.: 1440 px) e mobile (ex.: 390 px), incluindo tema claro/escuro, dados longos, vazios e situações de erro. Critérios: sem overflow não intencional, texto legível, contraste suficiente, diagramas não sobrepostos e navegação operável. Revisão visual humana aprova o padrão inicial; testes automatizados protegem contra regressão.

## 9. Componentes e representações

**Comuns:** título, subtítulo, lead, Markdown seguro, texto, seções, card, grid, coluna, lista, callout, ícones, badges, separadores, steps, métrica/KPI, tabela, abas, accordion, tooltip e imagem segura.

**Técnicos:** bloco de código com syntax highlighting, numeração opcional, trechos destacados, comparação antes/depois, árvore, dependências, arquitetura, fluxo de mensagens, grafo, sequências, timeline, estados e diagrama de banco.

**Dados:** gráficos simples controlados pelo runtime, legendas, eixos, tabelas e indicadores sem configuração arbitrária de bibliotecas por parte do LLM.

**Diagramas:** o agente descreve `nodes`, `edges`, grupos e direção; o runtime calcula posições, roteamento, espaçamento e interações de exploração como zoom, pan e seleção. A biblioteca usada internamente (por exemplo, React Flow e Elkjs/Dagre, se aprovados na implementação) não compõe o contrato da DSL.

Interatividade no MVP: tabs, accordion, tooltips, expandir conteúdo, copiar código, zoom/pan em diagramas, fullscreen e navegação. Não há execução de snippets, queries, scripts ou chamadas arbitrárias definidas no JSON.

## 10. DSL declarativa e contrato com o agente

A DSL é JSON versionado e semanticamente tipado, **idêntico para todos os agentes**. Este exemplo é **ilustrativo do contrato desejado**; o schema formal deverá ser estabelecido e testado antes de implementar o renderer:

```json
{
  "schemaVersion": 1,
  "title": "Fluxo de autenticação",
  "description": "Como uma requisição chega à API e valida a sessão",
  "theme": "graphite",
  "layout": { "type": "architecture", "density": "comfortable" },
  "blocks": [
    {
      "id": "summary",
      "type": "callout",
      "intent": "info",
      "title": "Ponto crítico",
      "text": "O token é validado antes de acessar os recursos protegidos."
    },
    {
      "id": "auth-flow",
      "type": "diagram",
      "variant": "flow",
      "direction": "LR",
      "nodes": [
        { "id": "browser", "kind": "client", "label": "Browser" },
        { "id": "api", "kind": "service", "label": "API" },
        { "id": "session", "kind": "datastore", "label": "Session Store" }
      ],
      "edges": [
        { "from": "browser", "to": "api", "label": "Request + token" },
        { "from": "api", "to": "session", "label": "Validate session" }
      ]
    }
  ]
}
```

Os metadados operacionais (`canvasId`, `projectId`, `revision`, timestamps, slug e autor da atualização) são atribuídos/validados pelo Core, nunca confiados cegamente ao modelo. As operações aceitam criação e patches por IDs de bloco estáveis, informam conflitos de revisão, validam relações e retornam erros tipados passíveis de correção pelo agente — com os mesmos códigos via MCP ou tool nativa.

## 11. Requisitos funcionais e critérios de aceite

| ID | Requisito | Critério de aceite verificável |
| --- | --- | --- |
| RF-01 | Instalação única global | `npx opencanvas install` configura Core + runtime + storage sem tocar repositórios; re-execução é idempotente. |
| RF-02 | Instalação seletiva | `install --targets opencode,codex` configura apenas os alvos; `--targets` distinto posterior não duplica runtime nem apaga dados. |
| RF-03 | OpenCode P0 | `/canvas <pedido>` funciona em projetos diferentes via plugin nativo, sem setup local; E2E cobre criar, atualizar, listar, excluir. |
| RF-04 | Codex P0 | Mesmas operações via MCP + skill funcionam com paridade funcional; E2E cobre criar, atualizar, listar. |
| RF-05 | Cursor / Claude P1 | Operações via MCP funcionam (criar/listar/atualizar); refinamento menor que P0, mas sem erro de protocolo. |
| RF-06 | Interoperabilidade | Canvas criado pelo OpenCode é listado/atualizado pelo Codex e vice-versa (mesmo `project-id`, revisão incrementada, sem perda). |
| RF-07 | Paridade Core/MCP | Toda operação nativa OpenCode tem equivalente MCP com mesmos schemas, validações e códigos de erro. |
| RF-08 | Contexto de projeto compartilhado | Subdiretórios do mesmo worktree compartilham namespace independente do agente; worktrees distintos não colidem. |
| RF-09 | Criação | DSL válida produz documento persistente, URL acessível e feedback no agente de origem. |
| RF-10 | Atualização | Patch sobre canvas existente preserva blocos não modificados e incrementa revisão, mesmo cross-agent. |
| RF-11 | Concorrência | Revisão obsoleta retorna conflito explícito com estado atual; não há *lost update*, mesmo entre agentes distintos. |
| RF-12 | Listagem e exclusão | Listar por projeto/global e excluir com confirmação; outro projeto não é afetado; exclusão visível para todos os agentes. |
| RF-13 | Runtime único | Múltiplos processos/sessões/agentes convergem para um único servidor por usuário. |
| RF-14 | Início sob demanda | Se o servidor está inativo, a primeira operação (MCP ou nativa) o inicia; se ativo, é reutilizado. |
| RF-15 | Rotas | Home, projeto e canvas por slug funcionam; conteúdo ausente tem estado consistente. |
| RF-16 | Live reload | Canvas aberto reflete salvamento confirmado sem recarga manual, independente do agente que salvou. |
| RF-17 | Renderer DSL | Tipos e presets do MVP são renderizados sem gerar JSX/CSS a cada pedido. |
| RF-18 | Diagramas | Grafo renderiza com auto-layout, zoom/pan e sem coordenadas fornecidas pelo LLM. |
| RF-19 | Qualidade visual | Fixtures passam nos critérios definidos de desktop/mobile/temas e revisão visual. |
| RF-20 | Validação | JSON inválido, relações quebradas e tipo desconhecido retornam erros estruturados sem quebrar o app, idênticos via MCP/nativo. |
| RF-21 | Segurança | DSL maliciosa não executa script; servidor escuta somente loopback por padrão; MCP não expõe escrita sem escopo de projeto. |
| RF-22 | Compatibilidade | Versões antigas suportadas são migradas ou recebem erro instrutivo, sem perda de arquivo. |
| RF-23 | Browser | O canvas é aberto no navegador quando possível; sempre retorna URL mesmo em headless. |
| RF-24 | Upgrade/uninstall/migração | Atualização preserva dados; remoção pergunta antes de apagar canvases; migração legada `opencode/canvas` → `opencanvas` com backup. |

## 12. Requisitos não funcionais

**Performance:** aplicação com bundle pré-compilado, lazy loading para diagramas/código/gráficos, atualizações locais responsivas, limite e diagnóstico para documentos grandes. Overhead do MCP Gateway deve ser desprezível (<100 ms p50 local) frente à geração do LLM. Metas iniciais de produto para hardware de desenvolvimento convencional: primeiro canvas visível em até 3 s após servidor disponível, atualização refletida em até 2 s, sem travar a UI em fixtures de até 100 nós/150 arestas. Metas são **critérios-alvo**, não resultados já medidos, e precisam ser calibradas em benchmark.

**Robustez:** inicialização sem corrida, lock com verificação de saúde, reconexão, erro isolado por canvas, escrita atômica e reconstrução do índice. Supervisor único serve MCP e tool nativa sem dupla inicialização.

**Privacidade:** conteúdo do projeto não é enviado a serviços do Canvas; seu envio ao provedor de LLM depende do uso normal do agente em questão. Storage não pode ser acessível em rede por padrão. Metadado `updatedByAgent` não contém segredos.

**Acessibilidade:** navegação por teclado, contraste WCAG AA como alvo, foco visível, semântica e suporte a `prefers-reduced-motion`.

**Observabilidade:** logs estruturados locais com origem do adapter como campo (não como caminho de código distinto), diagnóstico `doctor --targets`, erros com códigos estáveis, sem registrar conteúdo sensível por padrão.

**Portabilidade:** MVP focado em Linux/macOS; suporte Windows depende de validação explícita de caminhos, spawn e abertura do navegador — para Core e para cada adapter.

## 13. UX operacional e falhas

- O usuário sempre recebe o link, mesmo que a abertura automática do navegador falhe.
- Se houver erro de schema, a operação devolve caminho JSON do erro, código, explicação e sugestão; o agente pode tentar corrigir sem exigir que o usuário depure React. Códigos idênticos via MCP e nativo.
- Se o renderer falhar, uma Error Boundary preserva navegação e apresenta estado de erro útil.
- Se o servidor morrer, a operação subsequente (qualquer agente) o reinicia e a UI tenta reconectar.
- Portas ocupadas provocam escolha controlada de outra porta; não há suposição rígida de `4173`.
- Slug duplicado é resolvido de maneira previsível sem sobrescrever canvas existente, mesmo com criação concorrente por agentes distintos.
- Browser indisponível/headless não impede persistência.
- Nenhuma ação de exclusão ocorre por inferência ambígua ou por simples visualização.
- Falha de registro MCP em um alvo não impede os demais; `doctor` indica ação por alvo.

## 14. Não objetivos do MVP

- editor de design manual equivalente a Figma, Canva ou PowerPoint;
- gerar apps React independentes a partir de cada prompt;
- criar dependências/arquivos em todo repositório;
- colaboração multiplayer, contas e sincronização cloud;
- hospedagem pública ou compartilhamento remoto;
- executar JavaScript, HTML arbitrário ou código do projeto;
- permitir APIs externas arbitrárias ou comandos disparados pelo canvas;
- exportação sofisticada, edição drag-and-drop e criação de plugins de terceiros;
- banco de dados obrigatório, Vite dev server por projeto ou infraestrutura cloud;
- acoplar o Core a APIs proprietárias de qualquer agente; adapters não podem vazar para regras de negócio, storage ou renderer.

## 15. Plano de implementação com OPSX/OpenSpec

As entregas devem ser separadas em proposals implementáveis, com specs, design e tasks. **Ordem sugerida**, com dependências consideradas:

1. **Fundação agnóstica:** `canvas-core-package`, `canvas-installer-multitarget`, `canvas-project-identity-shared`, `canvas-storage`, `canvas-manifest`, `canvas-runtime-lifecycle`, `canvas-mcp-gateway`.
2. **Adapters:** `canvas-adapter-opencode` (plugin nativo + comando + skill, P0), `canvas-adapter-codex` (MCP + skill, P0), `canvas-adapter-cursor` (MCP + skill/comando, P1), `canvas-adapter-claude` (MCP + skill, P1), `canvas-context-resolution` (cwd/worktree explícito por adapter, canonicalização no Core).
3. **Contrato e segurança:** `canvas-dsl-schema`, `canvas-dsl-migrations`, `canvas-validation`, `canvas-security` (incluindo escopo MCP), `canvas-update-flow-cross-agent`, `canvas-migration-legacy-path`.
4. **Excelência visual (antes de fechar renderer):** `canvas-design-system`, `canvas-visual-themes`, `canvas-visual-quality-rules`, `canvas-layout-engine`, `canvas-responsive-rendering`.
5. **Renderer e conteúdo:** `canvas-renderer-core`, `canvas-code-renderer`, `canvas-diagrams`, `canvas-diagram-auto-layout`, `canvas-rich-content`, `canvas-motion-and-interactions`, `canvas-accessibility`, `canvas-performance`.
6. **Fluxo agentes + web:** `canvas-opencode-tool` (paridade MCP), `canvas-skills-per-agent`, `canvas-visual-planning`, `canvas-content-quality`, `canvas-command-opencode`, `canvas-web-routing`, `canvas-gallery` (com `updatedByAgent`), `canvas-browser-integration`, `canvas-live-reload`, `canvas-error-boundary`, `canvas-empty-loading-states`.
7. **Qualidade/entrega:** `canvas-example-library`, `canvas-visual-regression-tests`, `canvas-unit-integration-tests`, `canvas-e2e-multitarget`, `canvas-interop-tests` (OpenCode↔Codex obrigatório), `canvas-documentation` (por agente + Core), `canvas-distribution-maintenance`.

Um *vertical slice* inicial deve demonstrar: instalar globalmente com `--targets opencode,codex` → abrir o mesmo projeto nos dois agentes → criar canvas no OpenCode → atualizar pelo Codex → uma só instância de runtime → URLs estáveis → live reload → reiniciar agentes → canvases preservados. Em seguida ampliar componentes e gate visual antes de considerar MVP completo. Cursor/Claude entram no segundo slice de interop.

## 16. Definição de pronto do MVP

O MVP só está pronto quando:

1. a instalação única funciona globalmente, é idempotente por alvo e preserva a configuração de cada agente;
2. OpenCode e Codex (P0) usam o mesmo runtime e mesmo storage sem colisões, em sessões simultâneas;
3. criação, edição incremental cross-agent, navegação, listagem e exclusão funcionam com isolamento por projeto;
4. DSL inválida não corrompe arquivos nem derruba o app, em qualquer adapter;
5. as visualizações de referência — arquitetura, Kafka/eventos, banco, código, comparação, timeline e dashboard — atingem o padrão visual aprovado tanto em desktop quanto em mobile;
6. o pacote funciona sem gerar código React/CSS ou `node_modules` nos projetos e sem duplicar runtime por agente;
7. testes unitários, integração, E2E multitarget, interop OpenCode↔Codex, segurança e regressão visual cobrem os fluxos críticos;
8. documentação de instalação multitarget, uso por agente, DSL, temas, manutenção e troubleshooting permite a adoção **sem contexto prévio**.

## 17. Métricas de sucesso

- taxa de criação/renderização bem-sucedida sem intervenção manual, por agente;
- número médio de reparos de DSL por canvas, por agente;
- tokens e tempo total por canvas comparados ao baseline de geração de app independente;
- tempo até primeira renderização e até live reload;
- taxa de atualizações que preservam conteúdo não solicitado;
- taxa de falhas de runtime com múltiplas sessões/agentes;
- taxa de sucesso cross-agent (criar em A, atualizar em B sem intervenção);
- avaliação visual humana das fixtures de referência.

Não presumir antecipadamente economia percentual de tokens: medi-la com os mesmos prompts, modelos e cenários de teste, por agente.

## 18. Referências de integração

Documentação oficial consultada em 2026-10-10:

- OpenCode — Plugins (npm, diretório global e tools no plugin): https://opencode.ai/docs/plugins/
- OpenCode — Commands globais e `$ARGUMENTS`: https://opencode.ai/docs/commands/
- OpenCode — Skills globais: https://opencode.ai/docs/skills/
- OpenCode — Custom tools e contexto `directory`/`worktree`: https://opencode.ai/docs/custom-tools/
- OpenCode — Configuração global: https://opencode.ai/docs/config/
- MCP — Codex e Claude Code (conceito, transports, uso com agentes OpenAI/Anthropic): https://developers.openai.com/learn/docs-mcp
- Cursor — MCP (configuração de servidores MCP): https://prod.cursor.com/docs/mcp

**Nota de implementação:** nomes de pacote (`opencanvas`), formato exato da CLI (`npx opencanvas install --targets`), caminhos por agente, tools MCP e schemas de exemplo são decisões **propostas para construir**, não comandos ou APIs já publicados pelo projeto OpenCanvas. Caminhos de Codex/Cursor/Claude devem ser confirmados contra a versão-alvo na spec de cada adapter.
