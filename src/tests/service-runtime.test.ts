import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { opCreate, opGet, opUpdate, opList } from "../service.js";
import { ensureRunning, runtimeStatus, runtimeFile } from "../runtime/supervisor.js";

describe("service + runtime único", () => {
  it("fluxo cross-agent sobre o mesmo artefato", async t => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "oc-svc-"));
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "oc-w-"));
    const dsl = { schemaVersion: 1, title: "Auth", blocks: [{ id: "a", type: "text", text: "v1" }] };
    const c: any = await opCreate({ agent: "opencode", base, port: 0 }, { title: "Auth", dsl, cwd: work });
    const { info } = await runtimeStatus(base);
    if (info) t.after(() => process.kill(info.pid));
    assert.equal(c.ok, true);
    assert.ok(c.url.includes("/p/prj_"));
    const g: any = await opGet({ agent: "codex", base }, { idOrSlug: c.doc.slug, cwd: work });
    assert.equal(g.ok, true);
    assert.equal(g.doc.canvasId, c.doc.canvasId);
    const u: any = await opUpdate({ agent: "codex", base }, { idOrSlug: c.doc.slug, expectedRevision: 1, patch: { blocks: [{ id: "a", type: "text", text: "v2 via codex" }] }, cwd: work });
    assert.equal(u.ok, true);
    assert.equal(u.doc.revision, 2);
    const l: any = await opList({ agent: "cursor", base }, { cwd: work });
    assert.equal(l.items.length, 1);
  });
  it("ensureRunning reutiliza a mesma porta (runtime único)", async t => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "oc-rt-"));
    const a = await ensureRunning(base, 0);
    t.after(() => process.kill(a.pid));
    const b = await ensureRunning(base, 0);
    assert.equal(a.port, b.port);
    const st: any = await runtimeStatus(base);
    assert.equal(st.running, true);
    const h = await (await fetch(`http://127.0.0.1:${a.port}/health`)).json();
    assert.equal(h.status, "ok");
  });
  it("converge quando duas sessões iniciam ao mesmo tempo", async t => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "oc-rt-race-"));
    const [a, b] = await Promise.all([ensureRunning(base, 0), ensureRunning(base, 0)]);
    t.after(() => { for (const pid of new Set([a.pid, b.pid])) process.kill(pid); });
    assert.equal(a.port, b.port);
  });
  it("inicia com Node quando execPath aponta para um agente compilado", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "oc-rt-host-"));
    let pid: number | undefined;
    try {
      const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
        import { ensureRunning } from './dist/runtime/supervisor.js';
        process.execPath = '/agente/opencode';
        console.log(JSON.stringify(await ensureRunning(${JSON.stringify(base)}, 0)));
      `], { encoding: "utf8" });
      const info = JSON.parse(output);
      pid = info.pid;
      assert.equal((await runtimeStatus(base)).running, true);
    } finally {
      if (pid) process.kill(pid);
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
  it("reporta Node ausente sem erro de processo não tratado", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "oc-rt-no-node-"));
    try {
      execFileSync(process.execPath, ["--input-type=module", "-e", `
        import assert from 'node:assert/strict';
        import { ensureRunning } from './dist/runtime/supervisor.js';
        process.execPath = '/agente/opencode';
        await assert.rejects(ensureRunning(${JSON.stringify(base)}, 0), /RUNTIME_UNAVAILABLE: falha ao iniciar node: .*ENOENT/);
      `], { env: { ...process.env, PATH: "" } });
      assert.equal(fs.existsSync(path.join(base, "state", "runtime.lock")), false);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
  it("não reutiliza um health saudável de outro storage", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "oc-rt-scope-"));
    const otherBase = path.join(base, "other");
    const pids: number[] = [];
    try {
      const a = await ensureRunning(base, 0);
      pids.push(a.pid);
      fs.mkdirSync(path.dirname(runtimeFile(otherBase)), { recursive: true });
      fs.copyFileSync(runtimeFile(base), runtimeFile(otherBase));
      assert.equal((await runtimeStatus(otherBase)).running, false);
      const b = await ensureRunning(otherBase, a.port);
      pids.push(b.pid);
      assert.notEqual(a.port, b.port);
      assert.equal((await runtimeStatus(otherBase)).running, true);
    } finally {
      for (const pid of pids) process.kill(pid);
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
