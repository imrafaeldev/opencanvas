# ADR-001 — OpenCanvas: runtime multiagente agnóstico, Core + MCP + adapters

**Status:** Revisado v2.0 — decisão arquitetural fundamental (ainda não implementado)  
**Data:** 2026-10-10 (v1 OpenCode-only) / 2026-10-10 (v2 multiagente)  
**Escopo:** Core agnóstico, MCP Gateway, adapters (OpenCode/Codex/Cursor/Claude), instalação única, armazenamento compartilhado, processo web, DSL, renderer e segurança  
**Documento relacionado:** `PRD.md`
**Supersede:** v1 (`OpenCode Canvas: plugin global, runtime único e DSL declarativa`) passa a ser caso particular desta decisão; o nome do produto passa a **OpenCanvas**.

> **Leitura autônoma:** este ADR explica o que será construído, como os componentes se relacionam, por que essas decisões foram tomadas e o que não deve ser feito. Dispensa histórico de conversa. A mudança multiagente aqui descrita **é a arquitetura**, não uma integração adicionada a posteriori.

## 1. Contexto e forças em conflito

O objetivo é disponibilizar em qualquer agente de codificação uma capacidade de transformar solicitações e contexto técnico de um repositório em interfaces explicativas de altíssima qualidade, acessíveis pelo navegador e persistentes entre sessões e entre agentes.

A v1 previa um plugin específico do OpenCode. Isso resolveria um agente, mas criaria fragmentação imediata: o usuário usa OpenCode, Codex, Cursor e Claude Code no mesmo projeto e esperaria reencontrar os mesmos canvases. Um Canvas por OpenCode violaria a expectativa de instalação única por usuário.

Uma abordagem óbvia seria gerar um novo site React/Vite para cada solicitação. Ela oferece liberdade, mas desperdiça tokens em boilerplate e CSS, replica dependências, produz qualidade visual irregular e dificulta manutenção. Uma abordagem JSON puramente estática reduz custos, mas precisa de um renderer suficientemente sofisticado para não limitar o resultado a cartões e diagramas genéricos.

Forças arquiteturais (v2):

- **qualidade estética e capacidade expressiva** versus restrição de uma DSL;
- **baixo custo de tokens** versus necessidade de corrigir saídas inválidas;
- **instalação única por usuário** versus quatro ecossistemas de extensão distintos;
- **Core agnóstico** versus APIs proprietárias de cada agente (plugin OpenCode, MCP, skills, comandos);
- **um processo / um storage** versus sessões concorrentes de agentes distintos;
- **edição incremental cross-agent** versus consistência do documento;
- **facilidade de acesso local** versus proteção contra abuso de servidor loopback e de MCP;
- **simplicidade de arquivos JSON** versus concorrência e compatibilidade de versões;
- **paridade OpenCode↔MCP** versus tentação de divergir o adapter nativo.

Prioridade assumida: OpenCode P0 principal, Codex P0 secundário (ambos com E2E obrigatório), Cursor e Claude Code P1 (funcionam via MCP, menor refinamento).

## 2. Decisão central

Será publicado um pacote **agnóstico `opencanvas`** com:

1. **OpenCanvas Core** — DSL, storage, validação, versionamento, identidade de projetos, revisões, supervisor de runtime. Zero dependência de SDKs de agente.
2. **MCP Gateway / MCP Server** — interface interoperável canônica (`canvas_create/get/update/list/delete/open`, `ensureRunning`). É o contrato que todos os agentes podem consumir.
3. **Adapters substituíveis** — OpenCode (plugin nativo + comando + skill), Codex (MCP + skill), Cursor (MCP + skill/comando), Claude Code (MCP + skill). Cada adapter só faz comunicação, descoberta de contexto e invocação do Core.
4. **Um runtime web global** com SPA React pré-compilada, gallery e live reload compartilhados.
5. Renderer baseado em **DSL JSON semântica versionada**, idêntica para todos os agentes.
6. Design system, layout engine, diagrama/auto-layout e biblioteca de visualizações de qualidade premium no runtime.

> OpenCanvas deve ser agnóstico ao agente. Nenhuma regra de negócio, persistência, DSL, renderização ou gerenciamento de processos poderá depender de APIs específicas do OpenCode, Codex, Cursor ou Claude Code. Cada integração será um adapter substituível, responsável exclusivamente pela comunicação, descoberta de contexto e invocação das capacidades compartilhadas.

Nenhum canvas cria um projeto React independente. Nenhuma sessão ou repositório recebe cópia do app, bundle ou dependências. **Um usuário tem um único serviço OpenCanvas no host**, iniciado sob demanda e compartilhado entre agentes, sessões e projetos. Um canvas criado pelo OpenCode pode ser atualizado pelo Codex sem migração.

```text
                 ┌─ OpenCode adapter (nativo P0) ─┐
                 │  plugin + /canvas + skill     │
OpenCode sess ───┘                                │
                                                  ▼
Codex sess ─────── MCP + skill ─────────►  OpenCanvas Core
Cursor sess ────── MCP + skill ─────────►  (DSL · Storage · Validation
Claude sess ────── MCP + skill ─────────►   Projects · Revisions · Supervisor)
                                                  │
                                                  ▼
                                      MCP Gateway (canonical ops)
                                                  │
                                                  ▼
                                   Global Runtime (HTTP + SPA React)
                                                  │
                                                  ▼
                       /p/<project-id>/canvas/<slug> no navegador
```

O adapter OpenCode é mais integrado, mas **reutiliza as mesmas operações do Core**. Divergência de comportamento por agente é bug.

## 3. Distribuição e bootstrap

### 3.1. Núcleo agnóstico + adapters finos

- O Core não importa `@opencode-ai/plugin`, SDKs OpenAI/Anthropic, nem APIs do Cursor. Importar SDK de agente fora de `adapters/*` é violação arquitetural.
- O OpenCode suporta plugins npm em `plugin`, comandos em `commands/`, skills em `skills/<nome>/SKILL.md`, tools via `@opencode-ai/plugin`. Codex/Cursor/Claude consomem MCP via seus respectivos registros. O instalador conhece essas diferenças; o Core não.

**Decisão:** as tools nativas OpenCode pertencem ao adapter OpenCode e são wrappers finos sobre chamadas ao Core; **não** há duplicação de regra de negócio entre nativo e MCP. Instalador gerencia registro global, comandos, skills e MCP por alvo, mais dados/configuração compartilhados. Uma única fonte de verdade no Core.

### 3.2. Comando proposto de instalação

```bash
npx opencanvas install
npx opencanvas install --targets opencode,codex
```

`opencanvas` é o **nome proposto** unificado (sucessor de `opencode-canvas`), a ser criado/publicado. Não depender de comando nativo `opencode plugin add` sem confirmar existência na versão-alvo. O instalador deverá:

- inicializar `~/.config/opencanvas/` (Core) independente de qualquer agente;
- para cada `--target`: localizar config global do agente ou aceitar override explícito; preservar/mesclar sem apagar entradas; instalar skill/comando/MCP no formato efetivo da versão-alvo; impedir substituição silenciosa de `/canvas` preexistente;
- registrar `"opencanvas"` em `plugin` OpenCode sem duplicação (alvo `opencode`); registrar servidor MCP `opencanvas` nos alvos MCP sem duplicação;
- ser idempotente por alvo e transacional ao alterar arquivos do usuário;
- migrar storage legado `~/.config/opencode/canvas/` → `~/.config/opencanvas/` com backup, quando detectado;
- manter backups e oferecer `doctor [--targets]`, `upgrade` e `uninstall [--targets]`;
- preservar canvases no upgrade/uninstall, salvo decisão explícita de remover dados; `uninstall --targets X` remove só o adapter X.

O pacote distribui SPA **já compilada** + MCP server + adapters. Não exigir Vite em execução, build no projeto, nem `npm install` por workspace. Dados do usuário ≠ bundles instalados.

### 3.3. Diretórios

Estrutura lógica Linux/macOS, configurável via XDG/env:

```text
~/.config/opencanvas/               # Core — dono: OpenCanvas, não um agente
├── config.json
├── projects.json
├── mcp.json                        # manifesto do gateway (tools, versão)
├── data/projects/<project-id>/
│   ├── manifest.json
│   └── canvases/<canvas-id>.json
└── state/
    ├── runtime.json
    └── runtime.lock

# Adapters — ponteiros, sem dados nem runtime:
~/.config/opencode/opencode.json           # "plugin": [..., "opencanvas"]
~/.config/opencode/commands/canvas.md
~/.config/opencode/skills/canvas/SKILL.md
~/.codex/config.toml  (+ skills/canvas/SKILL.md)   # caminhos lógicos; confirmar na spec
~/.cursor/mcp.json    (+ skill/comando equivalente)
~/.claude.json        (+ skills/canvas/)            # idem
```

O caminho real do pacote npm é determinado pelo gerenciador, não hardcoded. Upgrades substituem bundles sem apagar `~/.config/opencanvas/data`. Diretórios XDG e Windows parametrizáveis sem mudar a topologia lógica. Caminhos exatos de Codex/Cursor/Claude serão congelados nas specs `canvas-adapter-*` após verificação.

## 4. Identidade e isolamento de projetos

**Decisão:** identidade compartilhada, resolvida pelo Core a partir de contexto explícito informado pelo adapter. Nenhum agente é autoridade de `projectId`.

Regras:

1. Adapters informam `cwd` (e `worktree`, se o agente expuser) como parâmetro explícito da chamada MCP/nativa. Core canonicaliza: Git worktree root quando disponível, senão cwd canônico; normaliza separadores/case/symlinks por SO.
2. ID estável, ex. hash de caminho canônico com prefixo (`prj_<hash>`). **Não** usar basename. Mesmo caminho via agentes distintos gera mesmo ID — é o que permite interop.
3. Subdiretórios de um worktree compartilham namespace; worktrees distintos isolados por padrão.
4. Nome amigável/root em `projects.json` (inclui opcional `lastSeenVia` como metadado); nunca parte de segurança/URL.
5. Migração/relocalização explícita futura; sem fusão automática por nomes.
6. Documento carrega `createdByAgent/updatedByAgent` como **informação** (ex. `opencode|codex|cursor|claude`), nunca como escopo de acesso.

Acesso restrito ao projeto inferido da chamada. Listagem global é operação separada e não autoriza escrita cross-namespace por engano. `projectId` vindo do LLM é ignorado.

## 5. Separação dos domínios

| Componente | Responsabilidade | Não faz |
| --- | --- | --- |
| OpenCanvas Core | DSL, validação, storage, revisões, identidade, supervisor, HTTP+SSE | Não importa SDK de agente |
| MCP Gateway | Expõe operações canônicas com schemas validados | Não decide estética nem inferência |
| Adapter OpenCode | Plugin/tools nativas, `/canvas`, skill; traduz `worktree/directory` → `cwd` explícito | Não duplica regra de negócio |
| Adapters Codex/Cursor/Claude | Registro MCP + skill/comando; mesma tradução de contexto | Não bifurcam protocolo |
| Canvas Skill (por agente) | Planeja narrativa e escolha de visualização (mesmo normativo) | Não decide CSS ou processos |
| Storage | Documentos, revisões, índices, atomicidade | Não renderiza |
| Runtime supervisor | Processo/porta/saúde únicos por usuário | Não faz inferência |
| Servidor Canvas | Serve SPA, leitura autorizada, eventos | Não executa código de projetos |
| React Renderer + Design/Layout/Diagram | Converte DSL validada em UI premium, auto-layout | Não aceita JS/CSS livre |

Core, Gateway e adapters podem viver no mesmo repo/pacote, mas em módulos com fronteira testável (`core/*` sem imports de `adapters/*`). Teste de arquitetura deve falhar se Core importar agente.

## 6. Runtime global, lifecycle e concorrência

### 6.1. Um runtime por usuário, não por sessão nem por agente

O primeiro acesso (MCP ou nativo) invoca `ensureRunning()`. Supervisor usa **lock interprocessos** + `state/runtime.json` + verificação real de `/health` para reutilizar ou iniciar. PID sem health **não** prova validade. Registro stale é recuperável. Concorrência OpenCode+Codex não cria dois servidores.

O servidor:

- é independente do tempo de vida de qualquer sessão/agente;
- escuta em `127.0.0.1` por padrão, nunca `0.0.0.0` implícito;
- prefere porta configurável (ex. `4173`), usa outra se ocupada;
- registra porta/PID/versão/timestamp em `state/runtime.json`;
- health com identificação e versão, sem dados sensíveis;
- reconexão/restart sem perda; pode hibernar por inatividade sem quebrar unicidade.

**Invariante:** no máximo **uma instância ativa e saudável** por usuário/config OpenCanvas, independente de quantos agentes chamem. Lock em filesystem, não variável local de adapter.

### 6.2. Sincronização

Atualizações emitem evento local (SSE/WebSocket) com `projectId`, `canvasId`, revisão. Browser recarrega documento persistido. Eventos não são fonte de verdade; após reconexão, UI lê revisão atual. Vale para salvamento originado de qualquer agente.

### 6.3. Browser

Adapter tenta abrir URL via mecanismo do SO; falha não invalida criação. Sempre retorna URL. Atualização de canvas aberto não abre nova aba por padrão.

## 7. Armazenamento, consistência e revisões

**Decisão:** arquivos JSON no storage global (`~/.config/opencanvas/data`) são fonte de verdade no MVP. Sem SQLite inicialmente.

```text
data/projects/<project-id>/
├── manifest.json                 # índice reconstruível
└── canvases/
    └── <canvas-id>.json          # documento canônico + DSL + createdByAgent/updatedByAgent
```

Regras:

- `canvasId` imutável; `slug` único por projeto, atualizável com alias/redirecionamento.
- `revision` monotônica cross-agent; patches exigem `expectedRevision`. Conflito retorna erro + estado atual; **nunca** last-write-wins silencioso — especialmente entre agentes.
- Escrita via temp na mesma partição + validação + rename atômico; índice reparável; `doctor` regenera `manifest.json`.
- Snapshots/revisões recentes + soft-delete com retenção parametrizável.
- Limites de tamanho/blocos/nós/profundidade.
- Nenhum path do LLM escapa do diretório do projeto.
- Migração legada preserva IDs/revisões; backup antes de migrar.

**Escolha por arquivos:** backup/inspeção/portabilidade; concorrência local controlada basta. DB só com métricas reais.

## 8. Protocolo de ferramentas (canônico MCP, nativo como wrapper)

Operações canônicas, mesmos schemas/validações/erros em ambos os transports:

- `canvas_create` — título, descrição, DSL, slug opcional, `cwd` explícito; retorna `canvasId`, `revision`, URL.
- `canvas_get` — por ID/slug no namespace derivado do `cwd`.
- `canvas_update` — `canvasId`/slug + `expectedRevision` + patch por IDs estáveis.
- `canvas_list` — por projeto; galeria global via serviço interno.
- `canvas_delete` — explícita, confirmada, preferencialmente recuperável.
- `canvas_open` / `ensureRunning` — garante runtime, retorna/abre URL.

Regras: `projectId` derivado pelo Core, nunca autoridade do chamador. Consulta ≠ mutação. Erros tipados: `DSL_SCHEMA_INVALID`, `CANVAS_NOT_FOUND`, `REVISION_CONFLICT`, `RUNTIME_UNAVAILABLE`, `PROJECT_SCOPE_DENIED`, mais `ADAPTER_CONTEXT_MISSING` (adapter não informou cwd) e `TARGET_NOT_CONFIGURED`.

API HTTP da UI: leitura + eventos com sessão local; **mutações só via Core através de MCP/tools autorizadas**, nunca API pública aberta de escrita.

Paridade é testada: matriz de testes executa cada operação via adapter OpenCode e via MCP e compara códigos/payloads.

## 9. DSL versionada e expressividade

**Decisão:** DSL **JSON** única para todos os agentes, schema formal (`schemaVersion`), tipagem por `type`, validação estrita. Renderer não é contrato externo.

Forma conceitual (exemplo de design, não schema final):

```json
{
  "schemaVersion": 1,
  "title": "Arquitetura de eventos",
  "description": "Publicação, entrega e consumo",
  "theme": "graphite",
  "layout": { "type": "architecture", "density": "comfortable" },
  "blocks": [
    { "id": "intro", "type": "text", "title": "Visão geral", "body": "Eventos são publicados em um broker." },
    {
      "id": "topology",
      "type": "diagram",
      "variant": "flow",
      "direction": "LR",
      "nodes": [
        { "id": "producer", "kind": "service", "label": "Producer" },
        { "id": "broker", "kind": "broker", "label": "Broker" },
        { "id": "consumer", "kind": "service", "label": "Consumer" }
      ],
      "edges": [
        { "from": "producer", "to": "broker", "label": "publish" },
        { "from": "broker", "to": "consumer", "label": "deliver" }
      ]
    }
  ]
}
```

Metadados de serviço (ID, revisão, slug, projeto, timestamps, agente) atribuídos pelo Core.

### 9.1. Primitives

- layout, section, text, Markdown seguro, code, table, list, card, metric, callout;
- diagram (nodes/edges/groups), timeline, steps, comparison, tree, sequence;
- gráficos controlados, imagens seguras, interativos limitados (tabs, accordion, tooltip);
- variáveis semânticas `intent`, `emphasis`, `density`, `layout`, `variant`, `theme`.

### 9.2. Evolução

- `schemaVersion` obrigatório; `validate` antes de persistir e antes de renderizar, mesma biblioteca no Core e no gateway.
- Migrações puras/testadas sem perda, com cópia recuperável.
- Tipos futuros com fallback amigável, sem crash global.
- Patches por IDs estáveis + validação de referências cruzadas.

### 9.3. Restrição deliberada

Sem CSS/Tailwind/HTML/script/React ad hoc do LLM no MVP. Escape hatch futuro só via **renderer registrado e confiável**, nunca código executável em JSON. Vale para todos os agentes igualmente.

## 10. Design system e composição como parte da arquitetura

**Decisão:** qualidade visual é capacidade **do runtime**, não improvisada por agente/adapter.

Runtime incorpora tokens, temas (dark executivo padrão + claro equivalente), presets (`explanation`, `architecture`, `flow`, `comparison`, `timeline`, `dashboard`, `code-walkthrough`, `hierarchy`, `sequence`, `mixed`), variantes (simples/didática/editorial), auto-layout, syntax highlighting, densidade, microinterações, acessibilidade.

### 10.1. Skill de planejamento visual

Normativo único, distribuído por agente com formatação adaptada. Determina objetivo, audiência, mensagem principal, narrativa, visualização e densidade antes da DSL. Sem excesso de cards/texto/diagrama redundante.

### 10.2. Gate técnico

Fixtures (arquitetura, eventos, banco, código, comparação, timeline, dashboard), screenshots mobile/desktop, claro/escuro, overflow, acessibilidade. Barra humana + regressão automatizada. App apenas funcional não cumpre spec.

### 10.3. Bibliotecas

React + build estático fixos. Diagramas/roteamento/CSS/animação por critérios de bundle/a11y/responsividade/auto-layout; React Flow, ELK, Dagre, Tailwind, shadcn/ui, Motion são **alternativas avaliáveis**, não contrato.

## 11. Segurança e confiança

Local-first, mas loopback + MCP exigem:

- bind `127.0.0.1`, checagem `Host`/`Origin`, sem CORS permissivo;
- proteção contra DNS rebinding/websites externos; sessão local de navegador (ex. bootstrap curto + cookie HttpOnly SameSite); link `/canvas/:slug` **não** é token;
- CSRF quando houver cookies mutáveis;
- escaping/sanitização de Markdown/rico; CSP restritiva, sem eval/inline de canvas;
- recusa de traversal, `javascript:`, URIs perigosas, componentes não registrados;
- nenhuma execução de snippet/chamada de rede definida pela DSL;
- limites de tamanho/profundidade;
- isolamento de namespaces; MCP valida `cwd` contra escopo e rejeita escrita fora do projeto (`PROJECT_SCOPE_DENIED`);
- logs sem fonte/conteúdo por padrão; campo `agent` permitido, conteúdo não.

**Autorização local + MCP:** spec `canvas-security` define sessão de browser e autorização do MCP server (stdio/local, sem escuta remota; escrita exige contexto de projeto válido). Testes contra CSRF, cross-origin e rebinding.

## 12. APIs/rotas do serviço

```text
GET /health
GET /
GET /p/:projectId
GET /p/:projectId/canvas/:slug
GET /api/projects                    # sessão local
GET /api/projects/:id/canvases       # sessão local
GET /api/projects/:id/canvases/:id   # sessão local
GET /api/events                      # sessão local / SSE
```

`/health` mínimo, sem sensíveis. Escrita via MCP/tools, não via `/api` pública. Deep refresh funciona. MCP transports: `stdio` como padrão para agentes locais; HTTP loopback só para supervisor/runtime já existente, com mesma autenticação local.

## 13. Atualização incremental e determinismo cross-agent

Criação ≠ edição. Patch com `canvasId`, `expectedRevision`, mudanças por ID/caminho estável. Core valida **documento inteiro** antes do commit; falha preserva versão. Agente prefere patch mínimo, preserva tema/layout alheios.

Slug em colisão (inclusive corrida entre agentes): slug alternativo determinístico ou decisão solicitada; nunca sobrescrever. Rename preserva ID + alias.

## 14. Falhas, diagnósticos e recuperação

- **Servidor ausente:** qualquer adapter reinicia sob demanda.
- **Lock stale:** health + PID, recuperação segura.
- **Porta ocupada:** outra porta + endereço real publicado.
- **Documento corrompido:** isola, fallback, preserva original.
- **Manifest inconsistente:** reconstrói dos canônicos.
- **Schema desconhecido:** migração ou erro orientado.
- **Conflito concorrente (mesmo/cross-agent):** rejeita stale com revisão atual.
- **Browser indisponível:** retorna URL, mantém salvo.
- **Erro visual:** Error Boundary por seção/canvas.
- **Atualização:** backup + migração preservada.
- **Adapter quebrado (MCP não registra / skill ausente):** demais alvos seguem; `doctor --targets` diagnostica por alvo com ação não destrutiva.
- **Contexto ausente:** adapter sem `cwd` recebe `ADAPTER_CONTEXT_MISSING` com instrução, sem escrita.

`doctor` verifica Core, adapters configurados, runtime, porta, integridade, schemas e paridade MCP/nativo.

## 15. Alternativas analisadas

| Alternativa | Benefício | Por que não é padrão |
| --- | --- | --- |
| React/Vite criado por canvas | Liberdade ilimitada | Tokens, dependências, manutenção repetidas |
| Um app React dentro de cada `.opencode/` | Isolamento | Viola global, duplica bundles/servidores |
| Plugin-only OpenCode (v1 sem Core agnóstico) | Menor escopo inicial | Fragmenta por agente; adiar multiagente vira retrabalho; rejeitada como arquitetura final |
| HTML/CSS/JS gerado por pedido | Simples p/ telas pequenas | Inconsistente, código livre, atualização difícil |
| Svelte gerado por canvas | Menos boilerplate | Ainda exige código/build repetidos |
| Mermaid como DSL única | Diagramas fáceis | Insuficiente p/ código/dashboards/comparações/editorial |
| DB desde o início | Queries/concorrência | Complexidade desnecessária ao MVP local |
| Runtime cloud central | Multi-dispositivo | Contraria local-first/privacidade |
| Apenas comandos + shell sem plugin/MCP | Setup menor | Lifecycle/validação/contexto fracos |
| Um runtime+storage por agente | Isolamento total | Quebra interop; 4x custo; rejeitada |

## 16. Consequências e trade-offs

**Vantagens:** uma instalação por usuário; evolução centralizada; estilo consistente independente do agente; isolamento por projeto com compartilhamento cross-agent; documentos reaproveitáveis; patches precisos; menor risco de execução; testes previsíveis + matriz de paridade.

**Custos aceitos:** esforço inicial maior (Core agnóstico + MCP + 4 adapters + specs por agente); menor liberdade da DSL; migrações; coordenação global; autenticação local + escopo MCP; E2E multitarget. Qualidade visual exige investimento real, não primeira versão funcional.

## 17. Decisões complementares e limites

- **Global por usuário**, não SaaS, daemon multiusuário, nem um por agente/projeto.
- **Um runtime lógico**, hibernável, sob demanda.
- **Processos e dados separados de projetos**, salvo exportação futura explícita.
- **React só como renderer**; agentes escrevem semântica.
- **Manifest derivado**; documento por canvas é verdade.
- **Sem JSX/CSS arbitrário** no padrão.
- **Sem execução de código** de canvas.
- **Browser como leitura/exploração**; agentes + skills + MCP/tools como criação/edição no MVP.
- **Core sem imports de agente** (regra lint/arquitetura).
- **Sem suporte garantido a Windows no primeiro corte**, até testes de spawn/paths/browser por Core e adapters.
- Reavaliar quando: escape hatches dominarem; JSON falhar sob concorrência real; contenção do processo único; exigência de colaboração remota/edição browser/público; DSL+reparos custar mais que alternativas.

Antes de frontend arbitrário: novas primitives semânticas, presets e tipos confiáveis.

## 18. Ordem de implementação e pontos de revisão

1. Core agnóstico + instalador multitarget + MCP Gateway + identidade compartilhada + storage/revisões/validação base.
2. Adapter OpenCode P0 + adapter Codex P0 + resolução de contexto explícita + paridade testada.
3. Supervisor único, health, roteamento, browser (servindo ambos os transports).
4. Design system/temas/layout/critérios visuais **antes de ampliar renderer**.
5. Renderer, diagramas, técnicos, live reload (agnóstico à origem).
6. Adapters Cursor/Claude P1 + patch cross-agent + gallery + UX erros + migração legada.
7. Segurança (incluindo MCP), E2E multitarget, interop OpenCode↔Codex, screenshots, benchmark.

**Reavaliar esta ADR quando:** condições da seção 17 ou divergência sistemática entre agentes que o Core não consiga absorver sem vazar abstração.

## 19. Referências técnicas verificadas

- OpenCode — Plugins, global/npm e tools: https://opencode.ai/docs/plugins/
- OpenCode — Custom Commands, `$ARGUMENTS`: https://opencode.ai/docs/commands/
- OpenCode — Skills globais: https://opencode.ai/docs/skills/
- OpenCode — Custom Tools e contexto `worktree`/`directory`: https://opencode.ai/docs/custom-tools/
- OpenCode — Configuração global: https://opencode.ai/docs/config/
- MCP — Codex e Claude Code (transports, servidores, uso com agentes): https://developers.openai.com/learn/docs-mcp
- Cursor — MCP (configuração de servidores): https://prod.cursor.com/docs/mcp

**Atenção:** nomes (`opencanvas`), CLI (`npx opencanvas install --targets`), tools MCP, rotas, JSON e caminhos por agente são **especificações do novo produto**; não representam APIs já existentes do OpenCanvas. Caminhos de Codex/Cursor/Claude devem ser confirmados nas specs dos adapters.
