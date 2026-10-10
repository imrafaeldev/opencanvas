// Adapter OpenCode (P0 principal) — wrapper fino sobre o Core. Sem lógica de negócio duplicada.
import { z } from "zod";
import { opCreate, opGet, opUpdate, opList, opDelete, opOpen, opProject } from "../../service.js";

function cwdOf(ctx: any): string | undefined {
  return ctx?.worktree || ctx?.directory || ctx?.cwd || process.cwd();
}
const CWD = z.string().optional().describe("Subdiretório do workspace (padrão: worktree da sessão)");

async function openBrowser(url: string) {
  try {
    const { exec } = await import("node:child_process");
    // Windows: `start` é builtin do cmd e o primeiro argumento entre aspas vira
    // título da janela — sem o `""` vazio a URL nunca abre.
    const cmd =
      process.platform === "darwin" ? `open "${url}"` :
      process.platform === "win32" ? `cmd /c start "" "${url}"` :
      `xdg-open "${url}"`;
    exec(cmd, (e) => { if (e) console.error("[opencanvas] browser:", e.message); });
  } catch { /* headless: URL basta */ }
}

export const canvasTools = {
  canvas_create: {
    description: "Cria um canvas visual OpenCanvas a partir de DSL validada. Retorna URL do navegador.",
    parameters: z.object({ title: z.string(), description: z.string().optional(), dsl: z.any(), slug: z.string().optional(), cwd: CWD }),
    async execute(args: any, ctx: any) {
      const r = await opCreate({ agent: "opencode", cwd: cwdOf(ctx) }, { ...args, cwd: args.cwd || cwdOf(ctx) });
      if ((r as any).ok && (r as any).url) openBrowser((r as any).url);
      return JSON.stringify(r);
    },
  },
  canvas_get: {
    description: "Carrega canvas por id/slug no projeto atual.",
    parameters: z.object({ idOrSlug: z.string(), cwd: CWD }),
    async execute(args: any, ctx: any) { return JSON.stringify(await opGet({ agent: "opencode", cwd: cwdOf(ctx) }, { ...args, cwd: args.cwd || cwdOf(ctx) })); },
  },
  canvas_update: {
    description: "Patch parcial com expectedRevision. Preserva blocos não tocados.",
    parameters: z.object({ idOrSlug: z.string(), expectedRevision: z.number(), patch: z.any(), cwd: CWD }),
    async execute(args: any, ctx: any) {
      const r = await opUpdate({ agent: "opencode", cwd: cwdOf(ctx) }, { ...args, cwd: args.cwd || cwdOf(ctx) });
      return JSON.stringify(r);
    },
  },
  canvas_list: {
    description: "Lista canvases do projeto atual.",
    parameters: z.object({ cwd: CWD }),
    async execute(args: any, ctx: any) { return JSON.stringify(await opList({ agent: "opencode", cwd: cwdOf(ctx) }, { cwd: args.cwd || cwdOf(ctx) })); },
  },
  canvas_delete: {
    description: "Exclui canvas (soft-delete). Exija confirmação explícita do usuário.",
    parameters: z.object({ idOrSlug: z.string(), cwd: CWD }),
    async execute(args: any, ctx: any) { return JSON.stringify(await opDelete({ agent: "opencode", cwd: cwdOf(ctx) }, { ...args, cwd: args.cwd || cwdOf(ctx) })); },
  },
  canvas_open: {
    description: "Garante runtime global e retorna/abre URL (gallery ou canvas).",
    parameters: z.object({ idOrSlug: z.string().optional(), cwd: CWD }),
    async execute(args: any, ctx: any) {
      const r: any = await opOpen({ agent: "opencode", cwd: cwdOf(ctx) }, { ...args, cwd: args.cwd || cwdOf(ctx) });
      if (r?.ok && r.url) openBrowser(r.url);
      return JSON.stringify(r);
    },
  },
  canvas_get_project: {
    description: "Resolve identidade compartilhada do projeto atual.",
    parameters: z.object({ cwd: CWD }),
    async execute(args: any, ctx: any) { return JSON.stringify(await opProject({ agent: "opencode" }, args.cwd || cwdOf(ctx))); },
  },
};

// Formato de plugin OpenCode (@opencode-ai/plugin). Se a API evoluir, as tools acima continuam válidas.
export default async function plugin() {
  return { tool: canvasTools };
}
