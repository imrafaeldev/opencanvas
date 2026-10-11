// Supervisor do runtime único por usuário: lock interprocessos + health + porta.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export interface RuntimeInfo { port: number; pid: number; version: string; startedAt: string; }
const VERSION = "0.1.0";

export function stateDir(base: string) { return path.join(base, "state"); }
export function runtimeFile(base: string) { return path.join(stateDir(base), "runtime.json"); }
export function lockFile(base: string) { return path.join(stateDir(base), "runtime.lock"); }
export function runtimeId(base: string) { return createHash("sha256").update(path.resolve(base)).digest("hex"); }

function readInfo(base: string): RuntimeInfo | null {
  try { return JSON.parse(fs.readFileSync(runtimeFile(base), "utf8")); } catch { return null; }
}
async function healthy(port: number, base: string): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const j: any = await res.json();
    return j?.status === "ok" && j?.runtimeId === runtimeId(base);
  } catch { return false; }
}
function freePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => {
      const s2 = net.createServer();
      s2.listen(0, "127.0.0.1", () => {
        const p = (s2.address() as any).port; s2.close(() => resolve(p));
      });
    });
    s.listen(preferred, "127.0.0.1", () => {
      const actual = (s.address() as any)?.port ?? preferred;
      s.close(() => resolve(actual));
    });
  });
}
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function ensureRunning(base: string, preferredPort = 4173): Promise<RuntimeInfo> {
  fs.mkdirSync(stateDir(base), { recursive: true });
  const existing = readInfo(base);
  if (existing && await healthy(existing.port, base)) return existing;
  // Lock exclusivo: duas sessões não podem iniciar runtimes concorrentes.
  const lock = lockFile(base);
  let ownsLock = false;
  for (let i = 0; i < 20; i++) {
    try {
      const fd = fs.openSync(lock, "wx");
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      fs.closeSync(fd);
      ownsLock = true;
      break;
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e;
      try {
        const raw = JSON.parse(fs.readFileSync(lock, "utf8"));
        if ((Date.now() - raw.at) >= 15_000 || !alive(raw.pid)) fs.unlinkSync(lock);
      } catch { /* lock sendo escrito ou já removido: tenta novamente */ }
      await new Promise(r => setTimeout(r, 250));
      const info = readInfo(base);
      if (info && await healthy(info.port, base)) return info;
    }
  }
  if (!ownsLock) throw new Error("RUNTIME_UNAVAILABLE: não foi possível adquirir o lock do runtime");
  try {
    const port = await freePort(preferredPort);
    // fileURLToPath obrigatório no Windows: .pathname devolve "/C:/..." e o
    // node filho falha com MODULE_NOT_FOUND. windowsHide evita flash de console.
    const serverPath = fileURLToPath(new URL("./server.js", import.meta.url));
    // No OpenCode compilado, execPath é o próprio agente, não um interpretador JS.
    const node = /^(node|node\.exe)$/i.test(path.basename(process.execPath)) ? process.execPath : "node";
    const child = spawn(node, [serverPath, `--base=${base}`, `--port=${port}`],
      { detached: true, stdio: "ignore", env: process.env, windowsHide: true });
    let startupError: string | undefined;
    child.once("error", (e) => { startupError = e.message; });
    child.once("exit", (code, signal) => { startupError = `processo encerrou (${signal ?? code})`; });
    child.unref();
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (startupError) throw new Error(`RUNTIME_UNAVAILABLE: falha ao iniciar ${node}: ${startupError}`);
      if (await healthy(port, base)) {
        const info: RuntimeInfo = { port, pid: child.pid ?? 0, version: VERSION, startedAt: new Date().toISOString() };
        fs.writeFileSync(runtimeFile(base), JSON.stringify(info, null, 2));
        return info;
      }
    }
    throw new Error(`RUNTIME_UNAVAILABLE: servidor não respondeu ao health check (executável: ${node}, porta: ${port})`);
  } finally {
    try { fs.unlinkSync(lock); } catch { /* ok */ }
  }
}

export async function runtimeStatus(base: string) {
  const info = readInfo(base);
  if (!info) return { running: false as const };
  return { running: await healthy(info.port, base) as boolean, info };
}
export function canvasUrl(port: number, projectId: string, slug: string) {
  return `http://127.0.0.1:${port}/p/${projectId}/canvas/${slug}`;
}
