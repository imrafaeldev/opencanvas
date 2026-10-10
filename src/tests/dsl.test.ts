import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateDSL } from "../dsl/validate.js";
import fs from "node:fs";

const good = JSON.parse(fs.readFileSync(new URL("../../fixtures/auth-flow.json", import.meta.url), "utf8"));

describe("DSL", () => {
  it("aceita fixtures reais", () => {
    for (const f of ["auth-flow", "microservices", "kafka-pipeline", "database", "comparison", "timeline", "dashboard", "code-walkthrough", "http-flow", "fullstack", "auth-canvas"]) {
      const dsl = JSON.parse(fs.readFileSync(new URL(`../../fixtures/${f}.json`, import.meta.url), "utf8"));
      const r = validateDSL(dsl);
      assert.equal((r as any).ok, true, `${f}: ${JSON.stringify((r as any).error)}`);
    }
  });
  it("aceita seções editoriais com blocos novos", () => {
    const r: any = validateDSL({ schemaVersion: 1, title: "t", blocks: [{ id: "a", type: "text", text: "x" }], sections: [{ id: "s1", title: "S1", blocks: [{ id: "h", type: "step-cards", items: [] }] }] });
    assert.equal(r.ok, true);
  });
  it("rejeita seção sem id e bloco novo inválido", () => {
    const r: any = validateDSL({ schemaVersion: 1, title: "t", blocks: [{ id: "a", type: "text" }], sections: [{ title: "x", blocks: [] }] });
    assert.equal(r.ok, false);
    const bad: any = validateDSL({ schemaVersion: 1, title: "t", blocks: [{ id: "c", type: "code" }] });
    assert.equal(bad.ok, false);
  });
  it("rejeita tipo desconhecido com path+hint", () => {
    const r: any = validateDSL({ schemaVersion: 1, title: "t", blocks: [{ id: "a", type: "nuke" }] });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "DSL_SCHEMA_INVALID");
    assert.match(r.error.path, /type/);
    assert.ok(r.error.hint);
  });
  it("rejeita edge quebrada", () => {
    const r: any = validateDSL({ schemaVersion: 1, title: "t", blocks: [{ id: "d", type: "diagram", nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "ghost" }] }] });
    assert.equal(r.ok, false);
    assert.match(r.error.message, /ghost/);
  });
  it("rejeita id duplicado e exige schemaVersion", () => {
    const dup: any = validateDSL({ schemaVersion: 1, title: "t", blocks: [{ id: "a", type: "text", text: "x" }, { id: "a", type: "text", text: "y" }] });
    assert.equal(dup.error.code, "DSL_SCHEMA_INVALID");
    const nov: any = validateDSL({ title: "t", blocks: [{ id: "a", type: "text" }] });
    assert.equal(nov.ok, false);
  });
  it("fixture base é válida", () => assert.equal(validateDSL(good).ok, true));
});
