// Supervisor do runtime único por usuário: lock interprocessos + health + porta.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

export interface RuntimeInfo { port: number; pid: number; version: string; startedAt: string; }
const VERSION = "0.1.0";

export function stateDir(base: string) { return path.join(base, "state"); }
export function runtimeFile(base: string) { return path.join(stateDir(base), "runtime.json"); }
export function lockFile(base: string) { return path.join(stateDir(base), "runtime.lock"); }

function readInfo(base: string): RuntimeInfo | null {
  try { return JSON.parse(fs.readFileSync(runtimeFile(base), "utf8")); } catch { return null; }
}
async function healthy(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const j: any = await res.json();
    return j?.status === "ok";
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
  if (existing && await healthy(existing.port)) return existing;
  // lock: arquivo com pid + timestamp; se stale (pid morto ou sem health), assume
  const lock = lockFile(base);
  const now = Date.now();
  try {
    const raw = fs.existsSync(lock) ? JSON.parse(fs.readFileSync(lock, "utf8")) : null;
    if (raw && (now - raw.at) < 15_000 && raw.pid !== process.pid && alive(raw.pid)) {
      // outro processo está iniciando — espera e reutiliza
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        const info = readInfo(base);
        if (info && await healthy(info.port)) return info;
      }
    }
  } catch { /* lock corrompido: prossegue */ }
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: now }));
  try {
    const port = await freePort(preferredPort);
    const serverJs = new URL("../runtime/server.js", import.meta.url);
    const child = spawn(process.execPath, [new URL(serverJs).pathname, `--base=${base}`, `--port=${port}`],
      { detached: true, stdio: "ignore", env: process.env });
    child.unref();
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (await healthy(port)) {
        const info: RuntimeInfo = { port, pid: child.pid ?? 0, version: VERSION, startedAt: new Date().toISOString() };
        fs.writeFileSync(runtimeFile(base), JSON.stringify(info, null, 2));
        return info;
      }
    }
    throw new Error("RUNTIME_UNAVAILABLE: servidor não respondeu ao health check");
  } finally {
    try { fs.unlinkSync(lock); } catch { /* ok */ }
  }
}

export async function runtimeStatus(base: string) {
  const info = readInfo(base);
  if (!info) return { running: false as const };
  return { running: await healthy(info.port) as boolean, info };
}
export function canvasUrl(port: number, projectId: string, slug: string) {
  return `http://127.0.0.1:${port}/p/${projectId}/canvas/${slug}`;
}
