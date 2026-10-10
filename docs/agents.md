# Agentes

Conteúdo normativo único: `skills/opencanvas/SKILL.md` (planejar → DSL → criar/atualizar → corrigir erros). Adapters só traduzem contexto e invocação.

- **OpenCode (P0)**: `src/adapters/opencode/plugin.ts` — 7 tools (`canvas_*`) chamando `src/service.ts` com `cwd = worktree||directory`. `canvas_open/​create` tentam abrir o navegador; headless continua válido (URL sempre retornada). Validado: execução real das tools contra o Core (lista + projeto, mesmo `prj_*` do E2E).
- **Codex (P0)**: `src/mcp/server.ts` via stdio — 8 tools com schemas zod. Não presume slash commands do Codex; invocação por menção ("use opencanvas…") + skill. Validado: handshake MCP real via SDK client + `canvas_list` contra o storage real.
- **Cursor / Claude (P1)**: mesmo servidor MCP, registros oficiais (`mcp.json` / `.claude.json`) + skills. Validados: `doctor` por alvo + contratos (mesmos schemas do MCP). Sem host Claude aqui: sem E2E em app real — declarado, não presumido.
- Divergência de comportamento entre agentes é bug: matriz de paridade = mesmas operações, mesmos códigos de erro (`REVISION_CONFLICT`, `DSL_SCHEMA_INVALID`, `ADAPTER_CONTEXT_MISSING`, …).
