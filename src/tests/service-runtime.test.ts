import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { opCreate, opGet, opUpdate, opList } from "../service.js";
import { ensureRunning, runtimeStatus } from "../runtime/supervisor.js";

describe("service + runtime único", () => {
  it("fluxo cross-agent sobre o mesmo artefato", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "oc-svc-"));
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "oc-w-"));
    const dsl = { schemaVersion: 1, title: "Auth", blocks: [{ id: "a", type: "text", text: "v1" }] };
    const c: any = await opCreate({ agent: "opencode", base, port: 0 }, { title: "Auth", dsl, cwd: work });
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
  it("ensureRunning reutiliza a mesma porta (runtime único)", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "oc-rt-"));
    const a = await ensureRunning(base, 0);
    const b = await ensureRunning(base, 0);
    assert.equal(a.port, b.port);
    const st: any = await runtimeStatus(base);
    assert.equal(st.running, true);
    const h = await (await fetch(`http://127.0.0.1:${a.port}/health`)).json();
    assert.equal(h.status, "ok");
  });
});
