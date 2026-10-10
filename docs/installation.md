# Instalação e manutenção

```bash
npm install && npm run build
node dist/cli/index.js install [--targets opencode,codex,cursor,claude]
node dist/cli/index.js doctor | status | serve | open | upgrade | uninstall [--purge-data]
```

## O que cada alvo faz

- **opencode**: adiciona `opencanvas` a `plugin` em `~/.config/opencode/opencode.json[c]` (mescla, sem apagar), instala `commands/canvas.md` e `skills/canvas/SKILL.md`.
- **codex**: seção `[mcp_servers.opencanvas]` em `~/.codex/config.toml` (stdio: `node <pkg>/dist/mcp/server.js`, `OPENCANVAS_AGENT=codex`) + skill.
- **cursor**: entrada `opencanvas` em `~/.cursor/mcp.json` + skill.
- **claude**: entrada `opencanvas` em `~/.claude.json` + skill.

Núcleo sempre: `~/.config/opencanvas/` (config, `projects.json`, `data/`, `state/`), override via `OPENCANVAS_HOME`. Migração legada `~/.config/opencode/canvas/` → base global com backup.
Idempotente, com backup `.bak.<timestamp>`, conflito de `/canvas` preexistente nunca sobrescrito em silêncio.
`uninstall` remove só adapters (dados preservados; `--purge-data` apaga com backup prévio).
Teste automatizado usa `HOME` isolado e nunca toca nas configs reais (`src/tests/cli.test.ts`).
