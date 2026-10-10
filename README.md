# OpenCanvas — runtime visual multiagente, local-first

Transforme explicações técnicas em interfaces visuais premium no navegador, a partir de qualquer agente de codificação. Uma instalação por usuário, um runtime global, storage compartilhado.

```text
/canvas explique a arquitetura deste projeto        # OpenCode
"Use opencanvas para explicar o fluxo de auth"     # Codex / Cursor / Claude (via MCP)
```

## Como funciona

1. O agente analisa o código, planeja a composição (skill `opencanvas`) e gera **só uma DSL JSON validada** — nunca JSX/CSS.
2. O Core valida, persiste (`~/.config/opencanvas/`), garante o runtime único e devolve a URL.
3. O navegador abre `http://127.0.0.1:<porta>/p/<project-id>/canvas/<slug>` com live reload.
4. Qualquer outro agente pode continuar o mesmo canvas (revisão otimista cross-agent).

## Instalação

```bash
git clone <este-repo> && cd opencanvas
npm install && npm run build
node dist/cli/index.js install                                   # todos os alvos detectados
node dist/cli/index.js install --targets opencode,codex         # seletiva
node dist/cli/index.js doctor                                   # diagnóstico por alvo
```

Pré-requisito: Node ≥ 20. Não publica nada sozinho; o nome `opencanvas` no npm deve ser verificado antes de publicar.

## Uso por agente

| Agente | Como chamar | Integração |
|---|---|---|
| OpenCode (P0) | `/canvas <pedido>` | plugin nativo `opencanvas` + `commands/canvas.md` + skill |
| Codex (P0) | peça "use opencanvas…" | MCP `opencanvas` (stdio) + skill `~/.codex/skills/opencanvas/` |
| Cursor (P1) | peça "use opencanvas…" | MCP em `~/.cursor/mcp.json` + skill |
| Claude Code (P1) | peça "use opencanvas…" | MCP em `~/.claude.json` + skill |

Tools (idênticas via plugin nativo e MCP): `canvas_create/get/update/list/delete/open`, `canvas_get_project`, `canvas_list_projects` (+ `canvas_list_projects` só no MCP).

## Desenvolvimento

```bash
npm run build        # tsc (Core/CLI/MCP/adapters) + vite (web → dist/web)
npm run dev:web      # vite dev (porta 5174)
npm test             # node --test dist/tests/  (14 testes, HOME isolado)
node dist/cli/index.js serve   # garante o runtime global
```

Estrutura: `src/{core,dsl,projects,storage,runtime,mcp,cli,adapters,web,tests}/`, `skills/opencanvas/SKILL.md`, `fixtures/` (10 canvases reais), `docs/`.

## Documentação

- `docs/PRD.md` — requisitos do produto multiagente (v2.0)
- `docs/ADR.md` — decisão arquitetural: Core agnóstico + MCP + adapters
- `docs/architecture.md`, `docs/dsl.md`, `docs/installation.md`, `docs/agents.md`, `docs/development.md`

## Limites honestos

- Registro MCP do Codex/Cursor/Claude aponta para o checkout local (`dist/mcp/server.js`); após `npm publish`, o instalador passará a apontar para o pacote global.
- Caminhos de config de Cursor/Claude seguem o formato oficial atual e são reconfirmados pelo `doctor`; sem binário do Claude aqui, a validação dele é de contrato (config + tools), não E2E em host real.
- Sem editor visual, sem cloud.
- Windows com paridade: `npm install && npm run build && npm test` passam no PowerShell/cmd (16 testes). Ver detalhes em `docs/installation.md#windows`.
