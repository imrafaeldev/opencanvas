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
    // HOME isolado no Unix; USERPROFILE no Windows (os.homedir ignora HOME lá).
    // homeDir() prefere HOME, mas fixamos ambos para garantir isolamento total.
    const env = { ...process.env, HOME: home, USERPROFILE: home, OPENCANVAS_HOME: base };
    const out1 = execFileSync(process.execPath, [cli, "install", "--targets=opencode,codex"], { env, encoding: "utf8" });
    assert.match(out1, /OK/);
    const out2 = execFileSync(process.execPath, [cli, "install", "--targets=opencode,codex"], { env, encoding: "utf8" });
    assert.match(out2, /ok/);
    const cfgRaw = fs.existsSync(path.join(home, ".config", "opencode", "opencode.json")) ? fs.readFileSync(path.join(home, ".config", "opencode", "opencode.json"), "utf8") : "{}";
    const cfg = JSON.parse(cfgRaw);
    // Sem entrada npm quebrada "opencanvas" (404): plugin é arquivo local.
    assert.equal((cfg.plugin || []).filter((p: string) => p === "opencanvas").length, 0);
    assert.ok(fs.existsSync(path.join(home, ".config", "opencode", "plugins", "opencanvas.js")));
    assert.ok(fs.existsSync(path.join(home, ".config", "opencode", "skills", "opencanvas", "SKILL.md")));
    const doc = execFileSync(process.execPath, [cli, "doctor"], { env, encoding: "utf8" });
    assert.match(doc, /runtime/);
    // uninstall preserva dados por padrão
    execFileSync(process.execPath, [cli, "uninstall", "--targets=opencode"], { env, encoding: "utf8" });
    assert.ok(fs.existsSync(base));
  });
});
