#!/usr/bin/env node
// CLI global: install/doctor/status/serve/open/upgrade/uninstall (+ --targets). Idempotente, com backup.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { defaultBaseDir, homeDir } from "../storage/store.js";
import { runtimeStatus, ensureRunning } from "../runtime/supervisor.js";

const ALL = ["opencode", "codex", "cursor", "claude"];
// fileURLToPath é obrigatório no Windows: new URL(...).pathname devolve
// "/C:/..." (leading slash) e quebra path.resolve/spawn.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILL_SRC = path.join(PKG_ROOT, "skills", "opencanvas", "SKILL.md");
const args = process.argv.slice(2);
const cmd = args.find(a => !a.startsWith("-")) || "help";
const ti = args.findIndex(a => a === "--targets" || a.startsWith("--targets="));
const TARGETS = ti >= 0
  ? (args[ti].includes("=") ? args[ti].split("=").slice(1).join("=") : args[ti + 1] || "").split(",").map(s => s.trim()).filter(Boolean)
  : ALL;
for (const t of TARGETS) if (!ALL.includes(t)) { console.error(`target desconhecido: ${t} (use ${ALL.join(",")})`); process.exit(1); }
// homeDir() respeita HOME (isolamento de testes) + USERPROFILE (Windows) + os.homedir().
// Usar os.homedir() direto quebra `HOME=<tmp>` nos testes no Windows.
const HOME = homeDir();
const BASE = process.env.OPENCANVAS_HOME || defaultBaseDir();

function backup(f: string) {
  if (fs.existsSync(f)) { const b = `${f}.bak.${Date.now()}`; fs.copyFileSync(f, b); return b; }
  return null;
}
function readText(f: string): string | null { try { return fs.readFileSync(f, "utf8"); } catch { return null; } }
function writeText(f: string, s: string) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); }
function stripJsonc(s: string) { return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1"); }
function mcpCmd(agent: string): { command: string; args: string[]; env: Record<string, string> } {
  return { command: process.execPath, args: [path.join(PKG_ROOT, "dist", "mcp", "server.js")], env: { OPENCANVAS_AGENT: agent } };
}
/** Escapa string para TOML basic string: backslash e aspas. Sem isso,
 *  `C:\Program Files\...` vira sequência de escape inválida no config do Codex. */
function tomlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function openBrowserUrl(url: string) {
  // Windows: `start` é builtin do cmd e exige título vazio antes da URL;
  // `start "http://..."` trata a URL como título e não abre nada.
  const cmd =
    process.platform === "darwin" ? `open "${url}"` :
    process.platform === "win32" ? `cmd /c start "" "${url}"` :
    `xdg-open "${url}"`;
  import("node:child_process").then(({ exec }) =>
    exec(cmd, (e) => { if (e) console.error("[opencanvas] browser:", e.message); }));
}

// ---------- adapters ----------
function installOpencode(): string[] {
  const logs: string[] = [];
  const cfgDir = path.join(HOME, ".config", "opencode");
  const jsonP = fs.existsSync(path.join(cfgDir, "opencode.jsonc")) ? path.join(cfgDir, "opencode.jsonc") : path.join(cfgDir, "opencode.json");
  const raw = readText(jsonP);
  let cfg: any = {};
  try { cfg = raw ? JSON.parse(stripJsonc(raw)) : {}; } catch { backup(jsonP); cfg = {}; }
  cfg.plugin = Array.isArray(cfg.plugin) ? cfg.plugin : [];
  if (!cfg.plugin.includes("opencanvas")) { backup(jsonP); cfg.plugin.push("opencanvas"); writeText(jsonP, JSON.stringify(cfg, null, 2)); logs.push(`plugin registrado em ${jsonP}`); }
  else logs.push("plugin já registrado");
  const cmdMd = path.join(cfgDir, "commands", "canvas.md");
  if (!readText(cmdMd)?.includes("opencanvas")) {
    backup(cmdMd);
    writeText(cmdMd, `---\ndescription: Cria/atualiza canvases visuais OpenCanvas\n---\n\nUse a skill opencanvas (skills/canvas/SKILL.md) e as tools canvas_* do plugin opencanvas para atender: $ARGUMENTS\n\nSem argumentos: liste a gallery do projeto (canvas_list) e oriente a abrir a URL (canvas_open).\n`);
    logs.push("commands/canvas.md instalado");
  } else logs.push("commands/canvas.md ok");
  const skillMd = path.join(cfgDir, "skills", "canvas", "SKILL.md");
  const src = readText(SKILL_SRC) || "# opencanvas";
  if (readText(skillMd) !== src) { backup(skillMd); writeText(skillMd, src); logs.push("skills/canvas/SKILL.md instalado"); }
  else logs.push("skill ok");
  return logs;
}
function installMcpFile(agent: string): string[] {
  const logs: string[] = [];
  const entry = { command: mcpCmd(agent).command, args: mcpCmd(agent).args, env: mcpCmd(agent).env };
  if (agent === "codex") {
    const f = path.join(HOME, ".codex", "config.toml");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const cur = readText(f) || "";
    if (cur.includes("[mcp_servers.opencanvas]")) logs.push("codex mcp já registrado");
    else {
      backup(f);
      fs.appendFileSync(f, `\n[mcp_servers.opencanvas]\ncommand = ${tomlString(entry.command)}\nargs = [${tomlString(entry.args[0])}]\nstartup_timeout_sec = 30.0\n\n[mcp_servers.opencanvas.env]\nOPENCANVAS_AGENT = "codex"\n`);
      logs.push("codex mcp registrado em ~/.codex/config.toml");
    }
    const s = path.join(HOME, ".codex", "skills", "opencanvas", "SKILL.md");
    if (readText(s) !== readText(SKILL_SRC)) { writeText(s, readText(SKILL_SRC) || ""); logs.push("codex skill instalada"); }
  } else if (agent === "cursor") {
    const f = path.join(HOME, ".cursor", "mcp.json");
    let j: any = {}; try { j = JSON.parse(readText(f) || "{}"); } catch { backup(f); }
    j.mcpServers = j.mcpServers || {};
    const want = { command: entry.command, args: entry.args, env: entry.env };
    if (JSON.stringify(j.mcpServers.opencanvas) !== JSON.stringify(want)) { backup(f); j.mcpServers.opencanvas = want; writeText(f, JSON.stringify(j, null, 2)); logs.push("cursor mcp registrado"); }
    else logs.push("cursor mcp ok");
    const s = path.join(HOME, ".cursor", "skills", "opencanvas", "SKILL.md");
    if (readText(s) !== readText(SKILL_SRC)) { writeText(s, readText(SKILL_SRC) || ""); logs.push("cursor skill instalada"); }
  } else if (agent === "claude") {
    const f = path.join(HOME, ".claude.json");
    let j: any = {}; try { j = JSON.parse(readText(f) || "{}"); } catch { backup(f); }
    j.mcpServers = j.mcpServers || {};
    if (!j.mcpServers.opencanvas) { backup(f); j.mcpServers.opencanvas = { command: entry.command, args: entry.args, env: entry.env }; writeText(f, JSON.stringify(j, null, 2)); logs.push("claude mcp registrado"); }
    else logs.push("claude mcp ok");
    const s = path.join(HOME, ".claude", "skills", "opencanvas", "SKILL.md");
    if (readText(s) !== readText(SKILL_SRC)) { writeText(s, readText(SKILL_SRC) || ""); logs.push("claude skill instalada"); }
  }
  return logs;
}
function migrateLegacy(): string | null {
  const legacy = path.join(HOME, ".config", "opencode", "canvas");
  if (fs.existsSync(legacy) && !fs.existsSync(path.join(BASE, "projects.json"))) {
    fs.mkdirSync(BASE, { recursive: true });
    fs.cpSync(legacy, BASE, { recursive: true });
    return `migração legada concluída: ${legacy} → ${BASE} (original preservado)`;
  }
  return null;
}

async function main() {
  if (cmd === "install") {
    console.log(`[opencanvas] install --targets ${TARGETS.join(",")}`);
    fs.mkdirSync(BASE, { recursive: true });
    const mig = migrateLegacy(); if (mig) console.log(" ", mig);
    for (const t of TARGETS) {
      const logs = t === "opencode" ? installOpencode() : installMcpFile(t);
      console.log(` [${t}]`); logs.forEach(l => console.log(`   - ${l}`));
    }
    const rt = await ensureRunning(BASE).catch(e => ({ error: String(e) }));
    console.log(" runtime:", JSON.stringify(rt));
    console.log("OK. Use /canvas no OpenCode ou o MCP nos demais agentes.");
  } else if (cmd === "doctor") {
    console.log("[opencanvas] doctor");
    console.log(" base:", BASE, fs.existsSync(BASE) ? "ok" : "AUSENTE");
    console.log(" skill:", fs.existsSync(SKILL_SRC) ? "ok" : "AUSENTE");
    console.log(" web:", fs.existsSync(path.join(PKG_ROOT, "dist", "web", "index.html")) ? "ok (build presente)" : "AUSENTE (rode npm run build)");
    const st: any = await runtimeStatus(BASE);
    console.log(" runtime:", st.running ? `ok porta ${st.info.port}` : "parado (sobe sob demanda)");
    for (const t of TARGETS) {
      if (t === "opencode") {
        const j = readText(path.join(HOME, ".config", "opencode", "opencode.jsonc")) || readText(path.join(HOME, ".config", "opencode", "opencode.json")) || "";
        console.log(` [${t}] plugin:${/opencanvas/.test(j) ? "ok" : "AUSENTE"} skill:${fs.existsSync(path.join(HOME, ".config", "opencode", "skills", "canvas", "SKILL.md")) ? "ok" : "AUSENTE"}`);
      } else if (t === "codex") console.log(` [codex] mcp:${(readText(path.join(HOME, ".codex", "config.toml")) || "").includes("[mcp_servers.opencanvas]") ? "ok" : "AUSENTE"}`);
      else if (t === "cursor") console.log(` [cursor] mcp:${(readText(path.join(HOME, ".cursor", "mcp.json")) || "").includes("opencanvas") ? "ok" : "AUSENTE"}`);
      else console.log(` [claude] mcp:${(readText(path.join(HOME, ".claude.json")) || "").includes("opencanvas") ? "ok" : "AUSENTE (instalado sob demanda)"}`);
    }
  } else if (cmd === "status") {
    console.log(JSON.stringify(await runtimeStatus(BASE), null, 2));
  } else if (cmd === "serve") {
    const rt = await ensureRunning(BASE, Number(process.env.OPENCANVAS_PORT || 4173));
    console.log(`http://127.0.0.1:${rt.port}`);
  } else if (cmd === "open") {
    const rt = await ensureRunning(BASE);
    const url = `http://127.0.0.1:${rt.port}/`;
    console.log(url);
    openBrowserUrl(url);
  } else if (cmd === "upgrade") {
    console.log("[opencanvas] upgrade: dados preservados em", BASE);
    for (const t of TARGETS) { const logs = t === "opencode" ? installOpencode() : installMcpFile(t); logs.forEach(l => console.log(` [${t}] ${l}`)); }
    console.log("OK");
  } else if (cmd === "uninstall") {
    const purge = args.includes("--purge-data");
    for (const t of TARGETS) {
      if (t === "opencode") {
        for (const f of [path.join(HOME, ".config", "opencode", "commands", "canvas.md")]) { if (fs.existsSync(f) && !purge) { backup(f); fs.unlinkSync(f); console.log(` removido ${f} (backup feito)`); } }
        console.log(" [opencode] remova \"opencanvas\" de plugin manualmente se desejar (não tocamos no restante do config no uninstall)");
      } else console.log(` [${t}] remova a entrada 'opencanvas' do MCP de ${t} para desativar (dados preservados)`);
    }
    if (purge) { backup(BASE); fs.rmSync(BASE, { recursive: true, force: true }); console.log(" dados apagados (--purge-data)"); }
    else console.log(` dados preservados em ${BASE} (use --purge-data para apagar)`);
  } else {
    console.log(`opencanvas — uso:\n  opencanvas install [--targets ${ALL.join(",")}]\n  opencanvas doctor|status|serve|open|upgrade|uninstall [--purge-data]\n`);
  }
}
main().catch(e => { console.error("[opencanvas]", e); process.exit(1); });
