import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// CLI idempotente com HOME isolado; nunca toca ~/.config real.
describe("CLI", () => {
  it("install é idempotente e doctor passa", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "oc-home-"));
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "oc-base-"));
    const cli = path.resolve("dist/cli/index.js");
    const env = { ...process.env, HOME: home, OPENCANVAS_HOME: base };
    const out1 = execFileSync(process.execPath, [cli, "install", "--targets=opencode,codex"], { env, encoding: "utf8" });
    assert.match(out1, /OK/);
    const out2 = execFileSync(process.execPath, [cli, "install", "--targets=opencode,codex"], { env, encoding: "utf8" });
    assert.match(out2, /já registrado|ok/);
    const plugins = JSON.parse(fs.readFileSync(path.join(home, ".config", "opencode", "opencode.json"), "utf8"));
    assert.equal(plugins.plugin.filter((p: string) => p === "opencanvas").length, 1);
    const doc = execFileSync(process.execPath, [cli, "doctor"], { env, encoding: "utf8" });
    assert.match(doc, /runtime/);
    // uninstall preserva dados por padrão
    execFileSync(process.execPath, [cli, "uninstall", "--targets=opencode"], { env, encoding: "utf8" });
    assert.ok(fs.existsSync(base));
  });
});
