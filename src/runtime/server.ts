// Servidor HTTP global: SPA estática + API de leitura + SSE. Loopback por padrão, sem execução de código.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store, defaultBaseDir } from "../storage/store.js";

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), "1"];
}));
const BASE = (args.base as string) || process.env.OPENCANVAS_HOME || defaultBaseDir();
const PORT = Number(args.port || process.env.OPENCANVAS_PORT || 4173);
const HOST = "127.0.0.1";
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const store = new Store(BASE);
const clients = new Set<http.ServerResponse>();

function send(res: http.ServerResponse, code: number, body: string, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}
function guardHost(req: http.IncomingMessage): boolean {
  const extra = (process.env.OPENCANVAS_ALLOW_HOST || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const h = (req.headers.host || "").split(":")[0].toLowerCase();
  if (h && h !== "127.0.0.1" && h !== "localhost" && !extra.includes(h)) return false;
  const o = req.headers.origin as string | undefined;
  if (o) {
    try {
      const u = new URL(o);
      const oh = u.hostname.toLowerCase();
      if (u.protocol === "http:" && (oh === "127.0.0.1" || oh === "localhost")) return true;
      if (u.protocol === "https:" && extra.includes(oh)) return true;
      return false;
    } catch { return false; }
  }
  return true;
}
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };

const server = http.createServer((req, res) => {
  if (!guardHost(req!)) return send(res, 403, JSON.stringify({ error: "forbidden origin" }));
  const url = new URL(req.url || "/", `http://${HOST}`);
  const p = url.pathname;
  // CORS fechado: só loopback
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; script-src 'self'");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (p === "/health") return send(res, 200, JSON.stringify({ status: "ok", version: "0.1.0", at: new Date().toISOString() }));
  if (p === "/api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`: connected\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (p === "/api/notify" && req.method === "POST") {
    let body = ""; req.on("data", c => body += c); req.on("end", () => {
      for (const c of clients) c.write(`data: ${body}\n\n`);
      send(res, 200, JSON.stringify({ ok: true }));
    });
    return;
  }
  if (p === "/api/projects") return send(res, 200, JSON.stringify(store.listProjects()));
  let m = p.match(/^\/api\/projects\/([^/]+)\/canvases$/);
  if (m) return send(res, 200, JSON.stringify(store.list(m[1])));
  m = p.match(/^\/api\/projects\/([^/]+)\/canvases\/(.+)$/);
  if (m) {
    const r = store.get(m[1], decodeURIComponent(m[2]));
    if (!r.ok) return send(res, 404, JSON.stringify({ error: r.error }));
    return send(res, 200, JSON.stringify(r.doc));
  }
  // estáticos + fallback SPA (deep refresh)
  let file = path.join(WEB, p === "/" ? "index.html" : p.slice(1).split("?")[0]);
  if (!file.startsWith(WEB)) return send(res, 403, JSON.stringify({ error: "forbidden path" }));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file) && (p.startsWith("/p/") || p === "/")) file = path.join(WEB, "index.html");
  if (!fs.existsSync(file)) return send(res, 404, "not found", "text/plain");
  const ext = path.extname(file);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000" });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => console.log(`[opencanvas] http://${HOST}:${PORT} base=${BASE}`));
server.on("error", (e) => { console.error("[opencanvas] listen error", e); process.exit(1); });
