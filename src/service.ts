// Camada canônica — única implementação das operações. MCP e plugin nativo são wrappers finos.
import { Store, defaultBaseDir } from "./storage/store.js";
import { resolveProject } from "./projects/identity.js";
import { ensureRunning, canvasUrl } from "./runtime/supervisor.js";
import { AgentId } from "./core/types.js";

export interface Ctx { cwd?: string; agent?: AgentId; base?: string; port?: number; }
function storeOf(ctx: Ctx) { return new Store(ctx.base || process.env.OPENCANVAS_HOME || defaultBaseDir()); }

export async function opCreate(ctx: Ctx, input: { title: string; description?: string; dsl: unknown; slug?: string; cwd?: string }) {
  const cwd = input.cwd || ctx.cwd || process.cwd();
  const pref = resolveProject(cwd);
  if ("error" in pref) return { ok: false as const, error: { code: "ADAPTER_CONTEXT_MISSING" as const, message: pref.error, hint: "Passe cwd/directory do workspace aberto" } };
  const store = storeOf(ctx);
  const r = store.create({ projectId: pref.projectId, projectRoot: pref.root, projectName: pref.name, title: input.title, description: input.description, dsl: input.dsl, slug: input.slug, agent: ctx.agent });
  if (!r.ok) return r;
  const rt = await ensureRunning(storeOf(ctx) && (ctx.base || process.env.OPENCANVAS_HOME || defaultBaseDir()), ctx.port);
  try { await fetch(`http://127.0.0.1:${rt.port}/api/notify`, { method: "POST", body: JSON.stringify({ projectId: pref.projectId, canvasId: r.doc.canvasId }) }); } catch { /* live reload best-effort */ }
  return { ok: true as const, doc: r.doc, url: canvasUrl(rt.port, pref.projectId, r.doc.slug), project: pref };
}
export async function opGet(ctx: Ctx, input: { idOrSlug: string; cwd?: string }) {
  const cwd = input.cwd || ctx.cwd || process.cwd();
  const pref = resolveProject(cwd);
  if ("error" in pref) return { ok: false as const, error: { code: "ADAPTER_CONTEXT_MISSING" as const, message: pref.error } };
  const r = storeOf(ctx).get(pref.projectId, input.idOrSlug);
  if (!r.ok) return r;
  const rt = await ensureRunning(ctx.base || process.env.OPENCANVAS_HOME || defaultBaseDir(), ctx.port).catch(() => null);
  return { ...r, url: rt ? canvasUrl(rt.port, pref.projectId, r.doc.slug) : undefined, project: pref };
}
export async function opUpdate(ctx: Ctx, input: { idOrSlug: string; expectedRevision: number; patch: any; cwd?: string }) {
  const cwd = input.cwd || ctx.cwd || process.cwd();
  const pref = resolveProject(cwd);
  if ("error" in pref) return { ok: false as const, error: { code: "ADAPTER_CONTEXT_MISSING" as const, message: pref.error } };
  const store = storeOf(ctx);
  const r = store.update({ projectId: pref.projectId, canvasIdOrSlug: input.idOrSlug, expectedRevision: input.expectedRevision, patch: input.patch, agent: ctx.agent });
  if (!r.ok) return r;
  const rt = await ensureRunning(ctx.base || process.env.OPENCANVAS_HOME || defaultBaseDir(), ctx.port);
  try { await fetch(`http://127.0.0.1:${rt.port}/api/notify`, { method: "POST", body: JSON.stringify({ projectId: pref.projectId, canvasId: r.doc.canvasId, revision: r.doc.revision }) }); } catch { /* ok */ }
  return { ok: true as const, doc: r.doc, url: canvasUrl(rt.port, pref.projectId, r.doc.slug), project: pref };
}
export async function opList(ctx: Ctx, input: { cwd?: string }) {
  const cwd = input.cwd || ctx.cwd || process.cwd();
  const pref = resolveProject(cwd);
  if ("error" in pref) return { ok: false as const, error: { code: "ADAPTER_CONTEXT_MISSING" as const, message: pref.error } };
  return { ok: true as const, items: storeOf(ctx).list(pref.projectId), project: pref };
}
export async function opDelete(ctx: Ctx, input: { idOrSlug: string; cwd?: string }) {
  const cwd = input.cwd || ctx.cwd || process.cwd();
  const pref = resolveProject(cwd);
  if ("error" in pref) return { ok: false as const, error: { code: "ADAPTER_CONTEXT_MISSING" as const, message: pref.error } };
  return storeOf(ctx).remove(pref.projectId, input.idOrSlug);
}
export async function opOpen(ctx: Ctx, input: { idOrSlug?: string; cwd?: string }) {
  const base = ctx.base || process.env.OPENCANVAS_HOME || defaultBaseDir();
  const rt = await ensureRunning(base, ctx.port);
  if (!input.idOrSlug) return { ok: true as const, url: `http://127.0.0.1:${rt.port}/`, port: rt.port };
  const g = await opGet(ctx, input as any);
  if (!g.ok) return g;
  return { ok: true as const, url: (g as any).url, doc: (g as any).doc };
}
export async function opProjects(ctx: Ctx) {
  return { ok: true as const, projects: storeOf(ctx).listProjects() };
}
export async function opProject(ctx: Ctx, cwd?: string) {
  const pref = resolveProject(cwd || ctx.cwd || process.cwd());
  if ("error" in pref) return { ok: false as const, error: { code: "ADAPTER_CONTEXT_MISSING" as const, message: pref.error } };
  return { ok: true as const, project: pref };
}
