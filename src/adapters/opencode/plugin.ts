// Adapter OpenCode V2 — wrapper fino sobre o Core. Sem lógica de negócio duplicada.
import { Plugin } from "@opencode/plugin";
import { opCreate, opGet, opUpdate, opList, opDelete, opOpen, opProject } from "../../service.js";

type Args = Record<string, any>;
type ToolResult = { content: string };

const cwdProperty = {
  type: "string",
  description: "Diretório do workspace (padrão: projeto atual do OpenCode)",
};

function objectInput(properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

async function openBrowser(url: string) {
  try {
    const { exec } = await import("node:child_process");
    const cmd =
      process.platform === "darwin" ? `open "${url}"` :
      process.platform === "win32" ? `cmd /c start "" "${url}"` :
      `xdg-open "${url}"`;
    exec(cmd, (e) => { if (e) console.error("[opencanvas] browser:", e.message); });
  } catch { /* headless: URL basta */ }
}

function result(value: unknown): ToolResult {
  return { content: typeof value === "string" ? value : JSON.stringify(value) };
}

export default Plugin.define({
  id: "opencanvas",
  async setup(ctx) {
    const projectCwd = ctx.location.directory;

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "canvas_create",
        description: "Cria um canvas visual OpenCanvas a partir de DSL validada. Retorna URL do navegador.",
        input: objectInput({
          title: { type: "string" },
          description: { type: "string" },
          dsl: { type: "object", additionalProperties: true },
          slug: { type: "string" },
          cwd: cwdProperty,
        }, ["title", "dsl"]),
        async execute(input: unknown) {
          const args = input as Args;
          const cwd = args.cwd || projectCwd;
          const r = await opCreate({ agent: "opencode", cwd }, { ...args, cwd } as any);
          if (r.ok && r.url) await openBrowser(r.url);
          return result(r);
        },
      });

      editor.add({
        name: "canvas_get",
        description: "Carrega canvas por id/slug no projeto atual.",
        input: objectInput({ idOrSlug: { type: "string" }, cwd: cwdProperty }, ["idOrSlug"]),
        async execute(input: unknown) {
          const args = input as Args;
          const cwd = args.cwd || projectCwd;
          return result(await opGet({ agent: "opencode", cwd }, { ...args, cwd } as any));
        },
      });

      editor.add({
        name: "canvas_update",
        description: "Patch parcial com expectedRevision. Preserva blocos não tocados.",
        input: objectInput({
          idOrSlug: { type: "string" },
          expectedRevision: { type: "number" },
          patch: { type: "object", additionalProperties: true },
          cwd: cwdProperty,
        }, ["idOrSlug", "expectedRevision", "patch"]),
        async execute(input: unknown) {
          const args = input as Args;
          const cwd = args.cwd || projectCwd;
          return result(await opUpdate({ agent: "opencode", cwd }, { ...args, cwd } as any));
        },
      });

      editor.add({
        name: "canvas_list",
        description: "Lista canvases do projeto atual.",
        input: objectInput({ cwd: cwdProperty }),
        async execute(input: unknown) {
          const args = input as Args;
          const cwd = args.cwd || projectCwd;
          return result(await opList({ agent: "opencode", cwd }, { cwd }));
        },
      });

      editor.add({
        name: "canvas_delete",
        description: "Exclui canvas (soft-delete). Exija confirmação explícita do usuário.",
        input: objectInput({ idOrSlug: { type: "string" }, cwd: cwdProperty }, ["idOrSlug"]),
        async execute(input: unknown) {
          const args = input as Args;
          const cwd = args.cwd || projectCwd;
          return result(await opDelete({ agent: "opencode", cwd }, { ...args, cwd } as any));
        },
      });

      editor.add({
        name: "canvas_open",
        description: "Garante runtime global e retorna/abre URL (gallery ou canvas).",
        input: objectInput({ idOrSlug: { type: "string" }, cwd: cwdProperty }),
        async execute(input: unknown) {
          const args = input as Args;
          const cwd = args.cwd || projectCwd;
          const r = await opOpen({ agent: "opencode", cwd }, { ...args, cwd } as any);
          if (r.ok && r.url) await openBrowser(r.url);
          return result(r);
        },
      });

      editor.add({
        name: "canvas_get_project",
        description: "Resolve identidade compartilhada do projeto atual.",
        input: objectInput({ cwd: cwdProperty }),
        async execute(input: unknown) {
          const args = input as Args;
          return result(await opProject({ agent: "opencode" }, args.cwd || projectCwd));
        },
      });
    });
  },
});
