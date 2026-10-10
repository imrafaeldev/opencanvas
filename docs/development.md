# Desenvolvimento e validação

```bash
npm install && npm run build     # tsc → dist/ + vite → dist/web/
npm run dev:web                  # vite :5174
npm test                         # node --test dist/tests/ (14 testes)
node dist/cli/index.js doctor
```

## Testes (isolados, sem tocar configs reais)

`src/tests/`: `dsl` (10 fixtures + 4 negativas), `identity-storage` (share/collisão/atomicidade/conflito/soft-delete/manifest), `service-runtime` (cross-agent + reuso de porta + health), `cli` (idempotência com `HOME` fake).

## Validação real executada (2026-10-10)

- E2E cross-agent: criado via `opencode` (rev 1) → atualizado via `codex` (rev 2, `updatedByAgent=codex`) → lido via `cursor` — mesmo `prj_6352a97ac57f`, URL estável, `http://127.0.0.1:43605/p/…/canvas/auth-flow` (4173 ocupada → fallback funcionou).
- Plugin OpenCode: 7 tools executadas de verdade contra o Core. MCP: handshake SDK + 8 tools + `canvas_list` real.
- `install --targets opencode,codex` + `cursor,claude` reais; `doctor` 4/4 ok; runtime único (mesmo PID) servindo todos.
- Navegador real (Playwright): desktop 1440 (dark+light), mobile 390, gallery, canvas, sem erros de console. Achados corrigidos: CSP bloqueava Google Fonts → fontes removidas (sistema, local-first); favicon inline; scroll horizontal do diagrama no mobile; rótulos de aresta acima dos nós. Evidências: `.validacao/*.png`.
