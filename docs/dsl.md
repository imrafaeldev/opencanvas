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
Seções progressivas (opcional): `"sections": [{"id":"overview","title":"...","highlight":"...","lead":"...","blocks":[...]}]` — cada seção vira uma tela; `blocks` no topo permanece como fallback. Exemplo completo: `fixtures/auth-canvas.json`.
Regras: `id` estável e único; diagrama só referencia `nodes` existentes; sem CSS/HTML/JS/coordenadas/`projectId`.
Metadados operacionais (`canvasId slug revision timestamps *ByAgent`) são do Core, nunca do LLM.
Migrations: `migrateDSL` cobre `schemaVersion` ausente → 1 com nota; documento preservado em falha.
Exemplos reais: `fixtures/*.json` (10) — todos validados em `src/tests/dsl.test.ts`.
