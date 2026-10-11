import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateDSL } from "../dsl/validate.js";
import fs from "node:fs";

const good = JSON.parse(fs.readFileSync(new URL("../../fixtures/auth-flow.json", import.meta.url), "utf8"));

describe("DSL", () => {
  it("aceita fixtures reais", () => {
    for (const f of ["auth-flow", "microservices", "kafka-pipeline", "database", "comparison", "timeline", "dashboard", "code-walkthrough", "http-flow", "fullstack", "auth-canvas", "diagram-stress"]) {
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

  it("aceita layouts especializados e propriedades semânticas", () => {
    const r: any = validateDSL({
      schemaVersion: 1, title: "t",
      blocks: [{ id: "a", type: "text", text: "x" }],
      sections: [{
        id: "s1", alignment: "start", composition: "grid", density: "compact",
        blocks: [
          { id: "o", type: "overview", importance: "primary", composition: "grid", items: [] },
          { id: "p", type: "process-flow", importance: "primary", items: [] },
          { id: "ar", type: "architecture", importance: "primary", nodes: [{ id: "n", label: "N" }], edges: [] },
          { id: "c", type: "code-walkthrough", code: "x", items: [] },
          { id: "s", type: "summary", importance: "supporting", items: [] },
          { id: "t", type: "technical", items: [] },
          { id: "sp", type: "card", span: 2 },
        ],
      }],
    });
    assert.equal(r.ok, true, JSON.stringify(r.error));
  });

  it("rejeita propriedade semântica fora do vocabulário", () => {
    const cases: Array<[any, RegExp]> = [
      [{ id: "a", type: "card", importance: "enorme" }, /importance/],
      [{ id: "a", type: "card", composition: "grid-12" }, /composition/],
      [{ id: "a", type: "card", alignment: "justify" }, /alignment/],
      [{ id: "a", type: "card", density: "apertado" }, /density/],
      [{ id: "a", type: "card", span: 9 }, /span/],
      [{ id: "a", type: "card", span: 1.5 }, /span/],
    ];
    for (const [block, re] of cases) {
      const r: any = validateDSL({ schemaVersion: 1, title: "t", blocks: [block] });
      assert.equal(r.ok, false, `deveria rejeitar ${JSON.stringify(block)}`);
      assert.equal(r.error.code, "DSL_SCHEMA_INVALID");
      assert.match(r.error.path, re);
      assert.ok(r.error.hint, "erro sem hint: o agente não consegue se corrigir");
    }
  });

  it("valida propriedades semânticas também na seção", () => {
    const r: any = validateDSL({
      schemaVersion: 1, title: "t", blocks: [{ id: "a", type: "text", text: "x" }],
      sections: [{ id: "s", alignment: "middle", blocks: [] }],
    });
    assert.equal(r.ok, false);
    assert.match(r.error.path, /alignment/);
  });

  it("aceita distribution cluster e importance em nodes", () => {
    const r: any = validateDSL({
      schemaVersion: 1, title: "t",
      blocks: [{
        id: "d", type: "diagram", distribution: "cluster", composition: "asymmetric",
        nodes: [
          { id: "a", label: "A", kind: "client", group: "edge", importance: "primary" },
          { id: "b", label: "B", kind: "service", group: "core" },
        ],
        edges: [{ from: "a", to: "b", label: "pede" }],
      }],
    });
    assert.equal(r.ok, true, JSON.stringify(r.error));
  });

  it("rejeita distribution e importance de node fora do vocabulário", () => {
    const badDist: any = validateDSL({
      schemaVersion: 1, title: "t",
      blocks: [{ id: "d", type: "diagram", distribution: "radial", nodes: [{ id: "a", label: "A" }], edges: [] }],
    });
    assert.equal(badDist.ok, false);
    assert.match(badDist.error.path, /distribution/);
    const badImp: any = validateDSL({
      schemaVersion: 1, title: "t",
      blocks: [{ id: "d", type: "diagram", nodes: [{ id: "a", label: "A", importance: "enorme" }], edges: [] }],
    });
    assert.equal(badImp.ok, false);
    assert.match(badImp.error.path, /importance/);
  });
});
