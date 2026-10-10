# OpenCanvas Skill — planejamento visual + DSL (agnóstica ao agente)

Use o OpenCanvas quando o usuário pedir explicação visual, arquitetura, fluxo, diagrama, comparação, timeline, dashboard, code walkthrough ou `/canvas`.

## Quando usar
- `/canvas <pedido>` (OpenCode) ou pedido equivalente via MCP em Codex/Cursor/Claude.
- Sem argumentos: abra a gallery do projeto (`canvas_open` / `canvas_list`).
- Exclusão só com confirmação explícita do usuário.

## Passo 1 — contexto
1. Obtenha o contexto do projeto com as ferramentas normais do agente (leia código, não presuma).
2. Distinga **observado** (no código) de **inferido** (provável) e **hipótese**. Marque incerteza no canvas com callout `warning`.
3. Descubra o workspace real (worktree/directory do host) e passe como `cwd` nas chamadas MCP. Nunca invente `projectId`.

## Passo 2 — planejamento visual (antes da DSL)
- Mensagem central em 1 frase. Máximo 3–5 ideias por seção.
- Distribua assuntos complexos em **seções progressivas** (`sections: [{id, title, lead, blocks}]`, 1 a N seções — nunca comprima tudo numa viewport).
- Escolha o layout pelo assunto, não pelo gosto. Prefira os **tipos especializados** — eles escolhem a composição certa:
  - `overview` — entrada editorial: lead + grade de conceitos.
  - `process-flow` — sequência horizontal (passos, funil, pipeline).
  - `architecture` — diagrama como elemento principal; aceita `panels` laterais. Com 5+ nós o renderer empilha em largura total.
  - `technical` — explicação conceitual com medida de leitura controlada.
  - `code-walkthrough` — código à esquerda + anotações encadeadas à direita.
  - `timeline` — linha do tempo.
  - `summary` — chaveiras + conclusão (`takeaway`).
  - `compare` / `comparison` — alternativas lado a lado.
  - `security` — painéis de risco com códigos de erro.
- Blocos reutilizáveis: `step-cards`, `features`, `split`, `chain`, `takeaway`, `payload`, `diagram`.
- **Propriedades semânticas** (substituem CSS e descrevem a intenção):
  - `importance`: `primary` (principal) · `secondary` · `supporting` (detalhe/nota). Em `nodes[]` de diagramas, `primary` destaca o nó.
  - `composition`: `auto` (motor escolhe) · `row` · `grid` · `stack` · `focus` · `split` · `asymmetric` (1º item ancora ~60%).
  - `distribution` (só em `diagram`/`architecture`): `layered` · `cluster` (agrupa `nodes[].group` em colunas rotuladas).
  - `alignment`: `center` (padrão) · `start`.
  - `density`: `compact` · `comfortable` · `spacious`. Na seção também.
- Prefira diagrama a parágrafo quando a relação importa. Evite cards redundantes e ícones sem significado.
- **Não** force a quantidade: o motor de composição já equilibra linhas (nenhum card fica órfão). Só use `composition` quando a intenção for explícita.

## Passo 3 — DSL (schemaVersion 1, blocos com id estável)
```json
{
  "schemaVersion": 1,
  "title": "Fluxo de autenticação",
  "description": "Como a request valida a sessão",
  "theme": "graphite",
  "layout": { "type": "architecture", "density": "comfortable" },
  "blocks": [
    { "id": "ponto", "type": "callout", "intent": "info", "title": "Ponto crítico", "text": "Token validado antes dos recursos." },
    { "id": "fluxo", "type": "diagram", "variant": "flow", "direction": "LR",
      "nodes": [
        { "id": "browser", "label": "Browser", "kind": "client" },
        { "id": "api", "label": "API", "kind": "service" },
        { "id": "sess", "label": "Session Store", "kind": "datastore" }
      ],
      "edges": [
        { "from": "browser", "to": "api", "label": "Request + token" },
        { "from": "api", "to": "sess", "label": "Validate" }
      ] }
  ]
}
```
Regras: `title` curto; `id` alfanumérico estável; diagrama referencia apenas `nodes` existentes; sem CSS/HTML/JS, sem coordenadas, sem `projectId` (o Core deriva do `cwd`). Para narrativas multi-seção, use `sections` (cada uma vira uma tela editorial); `blocks` no topo é fallback legado.

## Passo 4 — operações
- Criar: `canvas_create {title, description?, dsl, slug?, cwd}` → retorna `canvasId`, `revision: 1`, `url`. Abra mostre a URL sempre.
- Atualizar: `canvas_get` → edite o mínimo → `canvas_update {idOrSlug, expectedRevision, patch:{blocks|title|slug}}`.
- `REVISION_CONFLICT`: recarregue com `canvas_get` e reaplique o patch sobre a revisão atual. Nunca sobrescreva às cegas.
- `DSL_SCHEMA_INVALID`: leia `path` + `hint` do erro e corrija só o bloco indicado.
- `ADAPTER_CONTEXT_MISSING`: reenvie com `cwd` explícito do workspace aberto.
- Cross-agent: o mesmo `cwd` canônico gera o mesmo projeto em qualquer agente — criar no OpenCode e atualizar no Codex é o comportamento esperado.

## Economia de tokens
Gere só a DSL, nunca JSX/CSS. Reuse `block ids` em updates. Prefira `patch.blocks` parcial a regenerar tudo.
