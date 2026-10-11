# Instalação e manutenção

```bash
npm install && npm run build
node dist/cli/index.js install [--targets opencode,codex,cursor,claude]
node dist/cli/index.js doctor | status | serve | open | upgrade | uninstall [--purge-data]
```

## O que cada alvo faz

- **opencode**: plugin local em `~/.config/opencode/plugins/opencanvas.js` (re-exporta `dist/adapters/opencode/plugin.js`; remove a entrada npm quebrada `opencanvas`), instala `commands/canvas.md` e `skills/opencanvas/SKILL.md` (migra a legada `skills/canvas/` que colidia com a skill `canvas` do Cursor).
- **codex**: seção `[mcp_servers.opencanvas]` em `~/.codex/config.toml` (stdio: `node <pkg>/dist/mcp/server.js`, `OPENCANVAS_AGENT=codex`) + skill.
- **cursor**: entrada `opencanvas` em `~/.cursor/mcp.json` + skill.
- **claude**: entrada `opencanvas` em `~/.claude.json` + skill.

Núcleo sempre: `~/.config/opencanvas/` (config, `projects.json`, `data/`, `state/`), override via `OPENCANVAS_HOME`. Migração legada `~/.config/opencode/canvas/` → base global com backup.
Idempotente, com backup `.bak.<timestamp>`, conflito de `/canvas` preexistente nunca sobrescrito em silêncio.
`uninstall` remove só adapters (dados preservados; `--purge-data` apaga com backup prévio).
Teste automatizado usa `HOME`/`USERPROFILE` isolados e nunca toca nas configs reais (`src/tests/cli.test.ts`).

O runtime é iniciado com Node (≥20), inclusive dentro do OpenCode compilado:
`process.execPath` nesse host aponta para `opencode`, não para Node. Mantenha
`node` no `PATH` do serviço OpenCode. Após atualizar o build/plugin, recarregue
o OpenCode para usar o código novo.

## Windows

Paridade com Linux: `npm install && npm run build && npm test` passam no PowerShell/cmd
(Node ≥ 20). Detalhes específicos do Windows, já tratados no código:

- Home resolvida via `HOME` → `USERPROFILE` → `os.homedir()` (`homeDir()` em
  `src/storage/store.ts`); base padrão continua `%USERPROFILE%\.config\opencanvas`,
  mesma topologia lógica do Unix. `OPENCANVAS_HOME` continua sendo o override.
- Resolução de pacote e spawn do runtime usam `fileURLToPath` (`.pathname` puro
  devolve `/C:/...` e quebra no Windows) — `src/cli/index.ts`, `src/runtime/supervisor.ts`.
- Registro MCP do Codex (`config.toml`) escapa backslashes (`C:\\...`); sem isso o
  TOML interpreta `\P`, `\U` como escapes inválidos.
- Abertura de navegador usa `cmd /c start "" "<url>"` (`start` sozinho trata a URL
  como título da janela e não abre nada) — CLI `open` e adapter OpenCode.
- Identidade de projeto normaliza drive letter + case (`C:\Proj` ≡ `c:\proj`) e
  remove trailing slashes; `git rev-parse` com CRLF/forward slashes é absorvido.
- Servidor valida traversal via `path.relative` (comparação crua de prefixo falha
  por case/separador no Windows).
