// Storage global em arquivos JSON — fonte de verdade, escrita atômica, revisões, manifest reconstruível.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CanvasDoc, CanvasDSL, AgentId } from "../core/types.js";
import { validateDSL } from "../dsl/validate.js";
import { canvasId, slugify } from "../projects/identity.js";

export interface Paths { base: string; data: string; projectsFile: string; }
/** Home do usuário respeitando overrides de teste (HOME) e Windows (USERPROFILE).
 *  os.homedir() ignora HOME no Windows, o que quebra isolamento de testes e
 *  diverge do restante da CLI — por isso a ordem é: HOME > USERPROFILE > os.homedir(). */
export function homeDir(): string {
  const h = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return h && h !== "~" ? h : os.homedir();
}
export function pathsFor(baseDir: string): Paths {
  return { base: baseDir, data: path.join(baseDir, "data", "projects"), projectsFile: path.join(baseDir, "projects.json") };
}
export function defaultBaseDir(): string {
  if (process.env.OPENCANVAS_HOME) return process.env.OPENCANVAS_HOME;
  // Topologia lógica única (~/.config/opencanvas) em Linux/macOS/Windows:
  // funciona no Windows via C:\Users\<user>\.config\opencanvas sem exigir
  // APPDATA, mantendo migração legada e docs idênticos entre SOs.
  // Não usar process.env.HOME direto: ausente no Windows cmd/PowerShell.
  return path.join(homeDir(), ".config", "opencanvas");
}

function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }); }
function readJson<T>(f: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(f, "utf8")) as T; } catch { return fallback; }
}
function atomicWrite(f: string, data: string) {
  ensureDir(path.dirname(f));
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, f);
}

export interface CreateInput { projectId: string; projectRoot: string; projectName: string; title: string; description?: string; dsl: unknown; slug?: string; agent?: AgentId; }
export interface UpdateInput { projectId: string; canvasIdOrSlug: string; expectedRevision: number; patch: { title?: string; description?: string; slug?: string; blocks?: CanvasDSL["blocks"]; sections?: CanvasDSL["sections"] }; agent?: AgentId; }

export class Store {
  constructor(private base: string) { ensureDir(this.base); ensureDir(pathsFor(base).data); }
  private get P() { return pathsFor(this.base); }
  private dirOf(projectId: string) { return path.join(this.P.data, projectId, "canvases"); }
  private fileOf(projectId: string, id: string) { return path.join(this.dirOf(projectId), `${id}.json`); }
  private manifestFile(projectId: string) { return path.join(this.P.data, projectId, "manifest.json"); }

  registerProject(projectId: string, root: string, name: string, agent?: AgentId) {
    const reg = readJson<Record<string, any>>(this.P.projectsFile, {});
    reg[projectId] = { projectId, root, name, lastSeenVia: agent ?? "unknown", updatedAt: new Date().toISOString() };
    atomicWrite(this.P.projectsFile, JSON.stringify(reg, null, 2));
  }
  listProjects() { return Object.values(readJson<Record<string, any>>(this.P.projectsFile, {})); }

  private rebuildManifest(projectId: string) {
    const dir = this.dirOf(projectId);
    const items: any[] = [];
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as CanvasDoc;
        if (!d.deleted) items.push({ canvasId: d.canvasId, slug: d.slug, title: d.title, revision: d.revision, updatedAt: d.updatedAt });
      } catch { /* documento corrompido: isolado, não quebra índice */ }
    }
    atomicWrite(this.manifestFile(projectId), JSON.stringify({ projectId, items, rebuiltAt: new Date().toISOString() }, null, 2));
    return items;
  }

  list(projectId: string) {
    try {
      const m = readJson<any>(this.manifestFile(projectId), null);
      if (m?.items) {
        // valida rapidamente contra arquivos; se divergir, reconstrói
        const files = fs.existsSync(this.dirOf(projectId)) ? fs.readdirSync(this.dirOf(projectId)).filter(f => f.endsWith(".json")).length : 0;
        if (m.items.length !== files) return this.rebuildManifest(projectId);
        return m.items;
      }
    } catch { /* fallthrough */ }
    return this.rebuildManifest(projectId);
  }

  private findFile(projectId: string, idOrSlug: string): string | null {
    const direct = this.fileOf(projectId, idOrSlug);
    if (fs.existsSync(direct)) return direct;
    const dir = this.dirOf(projectId);
    if (!fs.existsSync(dir)) return null;
    for (const f of fs.readdirSync(dir)) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as CanvasDoc;
        if ((d.slug === idOrSlug || d.canvasId === idOrSlug) && !d.deleted) return path.join(dir, f);
      } catch { continue; }
    }
    return null;
  }

  create(input: CreateInput) {
    const v = validateDSL(input.dsl);
    if (!v.ok) return { ok: false as const, error: v.error };
    const id = canvasId();
    const slugBase = slugify(input.slug || input.title);
    let slug = slugBase, n = 1;
    while (this.findFile(input.projectId, slug)) slug = `${slugBase}-${++n}`; // determinístico, sem sobrescrever
    const now = new Date().toISOString();
    const doc: CanvasDoc = {
      canvasId: id, projectId: input.projectId, slug, title: input.title.slice(0, 200),
      description: input.description?.slice(0, 500), dsl: { ...v.dsl, title: input.title },
      revision: 1, createdAt: now, updatedAt: now,
      createdByAgent: input.agent ?? "unknown", updatedByAgent: input.agent ?? "unknown",
    };
    atomicWrite(this.fileOf(input.projectId, id), JSON.stringify(doc, null, 2));
    this.registerProject(input.projectId, input.projectRoot, input.projectName, input.agent);
    this.rebuildManifest(input.projectId);
    return { ok: true as const, doc };
  }

  get(projectId: string, idOrSlug: string) {
    const f = this.findFile(projectId, idOrSlug);
    if (!f) return { ok: false as const, error: { code: "CANVAS_NOT_FOUND" as const, message: `Canvas não encontrado: ${idOrSlug}`, hint: "Liste com canvas_list para ver slugs disponíveis" } };
    try {
      const doc = JSON.parse(fs.readFileSync(f, "utf8")) as CanvasDoc;
      if (doc.deleted) return { ok: false as const, error: { code: "CANVAS_NOT_FOUND" as const, message: "Canvas foi excluído (soft-delete)", hint: "Restaure o arquivo do canvas para recuperar" } };
      return { ok: true as const, doc };
    } catch { return { ok: false as const, error: { code: "CANVAS_NOT_FOUND" as const, message: "Documento corrompido — original preservado", hint: "Verifique o JSON do canvas; manifest será reconstruído" } }; }
  }

  update(input: UpdateInput) {
    const cur = this.get(input.projectId, input.canvasIdOrSlug);
    if (!cur.ok) return cur;
    if (cur.doc.revision !== input.expectedRevision)
      return { ok: false as const, error: { code: "REVISION_CONFLICT" as const, message: `Revisão esperada ${input.expectedRevision}, atual ${cur.doc.revision}. Recarregue antes de editar.`, currentRevision: cur.doc.revision, hint: "Chame canvas_get e reaplique o patch sobre a revisão atual" } };
    const next: CanvasDoc = { ...cur.doc };
    if (input.patch.title) next.title = input.patch.title.slice(0, 200);
    if (input.patch.description !== undefined) next.description = input.patch.description?.slice(0, 500);
    if (input.patch.slug && input.patch.slug !== cur.doc.slug) {
      const s = slugify(input.patch.slug);
      if (this.findFile(input.projectId, s)) return { ok: false as const, error: { code: "SLUG_CONFLICT" as const, message: `Slug em uso: ${s}`, hint: "Escolha outro slug" } };
      next.slug = s;
    }
    if (input.patch.blocks || input.patch.sections !== undefined) {
      // `sections` também é patchável: sem isso, um canvas criado com seções
      // (formato recomendado pela skill) não pode evoluir via canvas_update.
      const nextDsl: any = { ...cur.doc.dsl, title: next.title };
      if (input.patch.blocks) nextDsl.blocks = input.patch.blocks;
      if (input.patch.sections !== undefined) nextDsl.sections = input.patch.sections;
      const v = validateDSL(nextDsl);
      if (!v.ok) return { ok: false as const, error: v.error };
      next.dsl = v.dsl;
    } else if (input.patch.title) {
      next.dsl = { ...next.dsl, title: next.title };
    }
    next.revision += 1; next.updatedAt = new Date().toISOString(); next.updatedByAgent = input.agent ?? "unknown";
    // valida documento inteiro antes do commit
    const v = validateDSL(next.dsl);
    if (!v.ok) return { ok: false as const, error: v.error };
    atomicWrite(this.fileOf(input.projectId, next.canvasId), JSON.stringify(next, null, 2));
    this.rebuildManifest(input.projectId);
    return { ok: true as const, doc: next };
  }

  remove(projectId: string, idOrSlug: string) {
    const cur = this.get(projectId, idOrSlug);
    if (!cur.ok) return cur;
    const next = { ...cur.doc, deleted: true, updatedAt: new Date().toISOString(), revision: cur.doc.revision + 1 };
    atomicWrite(this.fileOf(projectId, next.canvasId), JSON.stringify(next, null, 2));
    this.rebuildManifest(projectId);
    return { ok: true as const, doc: next };
  }
}
