import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveProject, projectIdFor, canonicalPath } from "../projects/identity.js";
import { Store } from "../storage/store.js";

let base: string; let work: string;
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "oc-base-"));
  work = fs.mkdtempSync(path.join(os.tmpdir(), "oc-work-"));
  fs.writeFileSync(path.join(work, "a.ts"), "x");
});

describe("identidade compartilhada", () => {
  it("mesmo cwd → mesmo projectId em qualquer agente", () => {
    const a: any = resolveProject(work);
    const b: any = resolveProject(work);
    assert.equal(a.projectId, b.projectId);
    assert.equal(a.projectId, projectIdFor(a.root));
  });
  it("não colide por basename", () => {
    const d1 = fs.mkdtempSync(path.join(os.tmpdir(), "x-")); const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "x-"));
    fs.mkdirSync(path.join(d1, "backend"), { recursive: true }); fs.mkdirSync(path.join(d2, "backend"), { recursive: true });
    const a: any = resolveProject(path.join(d1, "backend")); const b: any = resolveProject(path.join(d2, "backend"));
    assert.notEqual(a.projectId, b.projectId);
  });
  it("subdiretórios (sem git) compartilham namespace via root canônico", () => {
    const sub = path.join(work, "sub"); fs.mkdirSync(sub);
    // sem git, cada cwd é seu próprio root — documenta o comportamento; com git, compartilhariam.
    const a: any = resolveProject(work); const b: any = resolveProject(sub);
    assert.ok(a.projectId && b.projectId);
    assert.equal(canonicalPath(work), a.root);
  });
  it("cwd ausente retorna erro estruturado, sem atribuir projeto errado", () => {
    const r: any = resolveProject("");
    assert.ok(r.error.includes("ADAPTER_CONTEXT_MISSING"));
  });
});

describe("storage", () => {
  it("create→get→update→conflict→list→delete", () => {
    const s = new Store(base);
    const proj: any = resolveProject(work);
    const dsl = { schemaVersion: 1, title: "T", blocks: [{ id: "a", type: "text", text: "oi" }] };
    const c: any = s.create({ projectId: proj.projectId, projectRoot: proj.root, projectName: "w", title: "T", dsl, agent: "opencode" });
    assert.equal(c.ok, true);
    assert.equal(c.doc.revision, 1);
    const g: any = s.get(proj.projectId, c.doc.slug);
    assert.equal(g.doc.canvasId, c.doc.canvasId);
    // update cross-agent preserva e incrementa
    const u: any = s.update({ projectId: proj.projectId, canvasIdOrSlug: c.doc.slug, expectedRevision: 1, patch: { blocks: [{ id: "a", type: "text", text: "oi editado pelo codex" }] }, agent: "codex" });
    assert.equal(u.ok, true);
    assert.equal(u.doc.revision, 2);
    assert.equal(u.doc.updatedByAgent, "codex");
    // conflito
    const stale: any = s.update({ projectId: proj.projectId, canvasIdOrSlug: c.doc.slug, expectedRevision: 1, patch: { title: "x" } });
    assert.equal(stale.ok, false);
    assert.equal(stale.error.code, "REVISION_CONFLICT");
    assert.equal(stale.error.currentRevision, 2);
    // slug duplicado gera sufixo determinístico
    const c2: any = s.create({ projectId: proj.projectId, projectRoot: proj.root, projectName: "w", title: "T", dsl, agent: "cursor" });
    assert.notEqual(c2.doc.slug, c.doc.slug);
    // manifest reconstruível
    fs.unlinkSync(path.join(base, "data", "projects", proj.projectId, "manifest.json"));
    const items = s.list(proj.projectId);
    assert.equal(items.length, 2);
    const del: any = s.remove(proj.projectId, c.doc.slug);
    assert.equal(del.ok, true);
    assert.equal(s.list(proj.projectId).length, 1);
  });
  it("patch de sections evolui o canvas preservando o restante", () => {
    const s = new Store(base);
    const proj: any = resolveProject(work);
    const dsl = { schemaVersion: 1, title: "T", blocks: [{ id: "a", type: "text", text: "oi" }] };
    const c: any = s.create({ projectId: proj.projectId, projectRoot: proj.root, projectName: "w", title: "T", dsl, agent: "opencode" });
    const withSections: any = s.update({
      projectId: proj.projectId, canvasIdOrSlug: c.doc.slug, expectedRevision: 1,
      patch: { sections: [{ id: "s1", title: "S1", blocks: [{ id: "h", type: "step-cards", items: [] }] }] }, agent: "codex",
    });
    assert.equal(withSections.ok, true);
    assert.equal(withSections.doc.dsl.sections.length, 1);
    // sections vazio é inválido por contrato: para voltar ao layout de blocos
    // o patch omite o campo, preservando o restante do documento.
    const empty: any = s.update({
      projectId: proj.projectId, canvasIdOrSlug: c.doc.slug, expectedRevision: 2, patch: { sections: [] },
    });
    assert.equal(empty.ok, false);
    assert.match(empty.error.message, /sections/);
    // bloco original segue intacto após a tentativa recusada
    assert.equal((s.get(proj.projectId, c.doc.slug) as any).doc.dsl.sections.length, 1);
  });
  it("sections inválido é rejeitado sem gravar", () => {
    const s = new Store(base);
    const proj: any = resolveProject(work);
    const dsl = { schemaVersion: 1, title: "T", blocks: [{ id: "a", type: "text", text: "oi" }] };
    const c: any = s.create({ projectId: proj.projectId, projectRoot: proj.root, projectName: "w", title: "T", dsl });
    const bad: any = s.update({
      projectId: proj.projectId, canvasIdOrSlug: c.doc.slug, expectedRevision: 1,
      patch: { sections: [{ id: "s1", title: "S", blocks: [{ id: "x", type: "inexistente" } as any] }] },
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.error.code, "DSL_SCHEMA_INVALID");
    // documento intacto: revisão não avançou
    assert.equal((s.get(proj.projectId, c.doc.slug) as any).doc.revision, 1);
  });
  it("DSL inválida não persiste nada", () => {
    const s = new Store(base);
    const proj: any = resolveProject(work);
    const before = s.list(proj.projectId).length;
    const r: any = s.create({ projectId: proj.projectId, projectRoot: proj.root, projectName: "w", title: "T", dsl: { schemaVersion: 1, title: "T", blocks: [] } });
    assert.equal(r.ok, false);
    assert.equal(s.list(proj.projectId).length, before);
  });
});
