// Identidade de projeto compartilhada entre agentes. Core canonicaliza; adapters informam cwd.
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface ProjectRef { projectId: string; root: string; name: string; }

export function canonicalPath(p: string): string {
  let r = p;
  try { r = fs.realpathSync(r); } catch { r = path.resolve(r); }
  r = path.normalize(r);
  if (process.platform === "win32") r = r.toLowerCase();
  return r;
}

export function gitRootOf(cwd: string): string | null {
  try {
    const out = execSync("git rev-parse --show-toplevel", { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return out ? canonicalPath(out) : null;
  } catch { return null; }
}

export function resolveProjectRoot(cwd: string): string {
  const c = canonicalPath(cwd);
  return gitRootOf(c) ?? c;
}

export function projectIdFor(root: string): string {
  const canon = canonicalPath(root);
  const h = createHash("sha256").update(canon).digest("hex").slice(0, 12);
  return `prj_${h}`;
}

export function resolveProject(cwd: string | undefined | null): ProjectRef | { error: string } {
  if (!cwd || typeof cwd !== "string" || cwd.trim() === "")
    return { error: "ADAPTER_CONTEXT_MISSING: informe cwd do workspace (adapter deve enviar directory/worktree explícito)" };
  const resolved = path.resolve(cwd);
  if (!fs.existsSync(resolved)) return { error: `PROJECT_SCOPE_DENIED: diretório inexistente: ${cwd}` };
  const root = resolveProjectRoot(resolved);
  return { projectId: projectIdFor(root), root, name: path.basename(root) || root };
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "canvas";
}

export function canvasId(): string {
  return `cv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
