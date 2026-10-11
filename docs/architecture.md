# Arquitetura

```text
OpenCode ── adapter nativo ─┐
Codex ───── MCP (stdio) ────┼── service.ts (operações canônicas) ── Core ── runtime :porta ── Browser
Cursor ──── MCP (stdio) ────┘   DSL · Storage · Projects · Supervisor
Claude ──── MCP (stdio) ────── ▲ mesma interface, mesmo storage
```

## Fronteiras

- `src/service.ts` — **única** implementação das 8 operações. MCP (`src/mcp/`) e plugin OpenCode (`src/adapters/opencode/`) são wrappers finos que só traduzem contexto (`worktree/directory` → `cwd` explícito) e chamam o service. Lint mental: `core|dsl|storage|projects|runtime` nunca importam SDK de agente.
- **Identidade** (`projects/identity.ts`): `cwd` → canonical (realpath) → Git root (`git rev-parse --show-toplevel`) ou cwd → `prj_<sha256:12>`. Mesmo caminho em qualquer agente = mesmo projeto. `projectId` do LLM é ignorado.
- **Storage** (`storage/store.ts`): `~/.config/opencanvas/data/projects/<prj>/canvases/<id>.json` (fonte de verdade) + `manifest.json` reconstruível. Escrita atômica (tmp+rename), `revision` monotônica, `expectedRevision` obrigatório, soft-delete. Limites: 200 blocos, 150 nós, 250 arestas, 512KB.
- **Runtime** (`runtime/`): `ensureRunning()` com lock exclusivo em `state/runtime.lock` + `/health` que confirma a identidade do storage (hash do caminho, sem expô-lo) + porta preferida 4173 com fallback. O plugin inicia Node, não o executável compilado do agente. Servidor `node:http` em loopback, CSP fechada, `GET /api/*` leitura + SSE `/api/events` + `POST /api/notify` (interno). SPA em `dist/web` com fallback para deep refresh.
- **Web** (`src/web/`): React sem router externo (roteamento por pathname), tokens `graphite` (dark padrão) / `paper`, 10 presets de layout, diagrama SVG com auto-layout em camadas (BFS) + zoom/pan, sem fontes externas.
- **CLI** (`src/cli/`): `install --targets`, `doctor`, `status`, `serve`, `open`, `upgrade`, `uninstall` (preserva dados; `--purge-data` apaga). Backup `.bak.<ts>` antes de alterar configs do usuário; idempotente.
