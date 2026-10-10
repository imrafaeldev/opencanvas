# DSL — contrato central (schemaVersion 1)

JSON semântico, validado antes de persistir e antes de renderizar (`src/dsl/validate.ts`, sem dependências; erros com `code/path/hint` para autocorreção do agente).

```json
{ "schemaVersion": 1, "title": "…", "description": "…", "theme": "graphite|paper",
  "layout": { "type": "architecture|flow|explanation|comparison|timeline|dashboard|code-walkthrough|hierarchy|sequence|mixed", "density": "compact|comfortable|spacious" },
  "blocks": [{ "id": "fluxo", "type": "diagram", "direction": "LR",
    "nodes": [{ "id": "api", "label": "API", "kind": "service" }],
    "edges": [{ "from": "browser", "to": "api", "label": "Request" }] }] }
```

Blocos: `text markdown heading section grid card metric table list callout code image chart timeline steps comparison tabs accordion tree diagram` (legado) + editoriais `hero step-cards split compare chain features takeaway payload security`.

**Tipos especializados** (a natureza da informação escolhe a composição): `overview`, `process-flow`, `architecture` (aceita `panels`), `technical`, `code-walkthrough`, `summary`.

## Propriedades semânticas de composição

Substituem CSS livre: o renderer decide o efeito, o agente só declara a intenção.

| Propriedade | Valores | Onde | Efeito |
|---|---|---|---|
| `importance` | `primary` · `secondary` · `supporting` | bloco | nível de destaque: tamanho, contraste, respiro |
| `composition` | `auto` · `row` · `grid` · `stack` · `focus` · `split` · `asymmetric` | bloco/seção | estratégia de linha; `auto` usa o motor, `asymmetric` ancora o 1º item (~60%) |
| `distribution` | `layered` · `cluster` | `diagram`/`architecture` | auto-layout: camadas por profundidade, ou clusters rotulados por `nodes[].group` |
| `alignment` | `center` · `start` | seção | alinhamento do cabeçalho da seção |
| `density` | `compact` · `comfortable` · `spacious` | bloco/seção | respiro em função da quantidade de itens |
| `span` | inteiro `1..4` | bloco | colunas ocupadas (validado; o renderer limita ao grid real) |

Valores fora do vocabulário são recusados com `DSL_SCHEMA_INVALID` + `path` + `hint` (`src/dsl/validate.ts`).

## Motor de composição (`src/web/src/compose.ts`)

A contagem de colunas **não é fixa**: é derivada de (quantidade de itens, largura medida via `ResizeObserver`, largura mínima de card). O custo por candidata penaliza resto `1` (órfão) e buracos maiores, preferindo linhas perfeitas. A linha usa flexbox com `flex: 1 1 basis`, então a última linha **cresce e preenche a largura inteira** — para qualquer quantidade de itens. Nenhum canvas futuro depende de ajuste manual.

## Diagramas

Auto-layout em camadas (BFS), sem coordenadas do LLM. Dimensiona nós pela largura real disponível; encurta o gap antes de inverter o eixo e cai para vertical quando o nó ficaria estreito demais; a tipografia acompanha a largura do nó; rótulos de aresta ganham chip de fundo. Altura derivada da proporção natural, com piso e teto.

**Interações do diagrama** (locais, sem IA): selecionar um nó (clique/toque/Enter) destaca as conexões em âmbar e esmaece o resto; zoom +/−/repor; expandir em tela cheia; lista de adjacências em `<details>` como visão alternativa acessível.

`nodes[].importance: primary` dá destaque visual (halo + borda reforçada); `nodes[].group` alimenta `distribution: cluster` (colunas rotuladas por domínio).

Seções progressivas (opcional): `"sections": [{"id":"overview","title":"...","highlight":"...","lead":"...","blocks":[...]}]` — cada seção vira uma tela; `blocks` no topo permanece como fallback. Quando a seção abre com um bloco `hero`, ele **é** o título (evita dois cabeçalhos empilhados). Exemplo completo: `fixtures/auth-canvas.json`.
Regras: `id` estável e único; diagrama só referencia `nodes` existentes; sem CSS/HTML/JS/coordenadas/`projectId`.
Metadados operacionais (`canvasId slug revision timestamps *ByAgent`) são do Core, nunca do LLM.
Migrations: `migrateDSL` cobre `schemaVersion` ausente → 1 com nota; documento preservado em falha.
Exemplos reais: `fixtures/*.json` (10) — todos validados em `src/tests/dsl.test.ts`.

Atualização: `canvas_update` aceita `patch.sections` além de `patch.blocks`; o documento inteiro é revalidado antes do commit e, se falhar, a revisão não avança.
