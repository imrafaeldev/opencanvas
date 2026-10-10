// Validação da DSL — sem dependências, erros com path + hint para o agente se autocorrigir.
import { CanvasDSL, CanvasError, MAX_BLOCKS, MAX_DOC_BYTES, MAX_EDGES, MAX_NODES, SCHEMA_VERSION } from "../core/types.js";

const BLOCK_TYPES = new Set([
  "text","markdown","heading","section","grid","card","metric","table","list",
  "callout","code","image","chart","timeline","steps","comparison","tabs",
  "accordion","tree","diagram",
  "hero","step-cards","split","compare","chain","features","takeaway","payload","security",
]);

function err(code: CanvasError["code"], message: string, path?: string, hint?: string): CanvasError {
  return { code, message, path, hint };
}

function checkBlock(b: any, p: string, seen: Set<string>): { ok: true } | { ok: false; error: CanvasError } {
  if (!b || typeof b !== "object") return { ok: false, error: err("DSL_SCHEMA_INVALID", "bloco deve ser objeto", p, "Verifique a sintaxe do bloco") };
  if (typeof b.id !== "string" || !/^[a-z0-9][a-z0-9-_]{0,63}$/i.test(b.id))
    return { ok: false, error: err("DSL_SCHEMA_INVALID", "bloco.id obrigatório, alfanumérico curta", `${p}.id`, "Use ids estáveis ex: 'summary', 'auth-flow'") };
  if (seen.has(b.id)) return { ok: false, error: err("DSL_SCHEMA_INVALID", `bloco.id duplicado: ${b.id}`, `${p}.id`, "Renomeie para id único") };
  seen.add(b.id);
  if (!BLOCK_TYPES.has(b.type))
    return { ok: false, error: err("DSL_SCHEMA_INVALID", `tipo desconhecido: ${b.type}`, `${p}.type`, `Tipos válidos: ${[...BLOCK_TYPES].join(", ")}`) };
  if (b.type === "diagram") {
    const r = validateDiagram(b, p);
    if (!r.ok) return r as any;
  }
  if ((b.type === "code" || b.type === "payload") && typeof b.code !== "string")
    return { ok: false, error: err("DSL_SCHEMA_INVALID", `bloco ${b.type} exige string em .code`, `${p}.code`, "Coloque o snippet em 'code'") };
  return { ok: true };
}

export function validateDSL(input: unknown): { ok: true; dsl: CanvasDSL } | { ok: false; error: CanvasError } {
  if (!input || typeof input !== "object") return { ok: false, error: err("DSL_SCHEMA_INVALID", "DSL deve ser um objeto", "$", "Envie {schemaVersion:1,title,blocks:[...]}") };
  const d = input as Record<string, any>;
  if (d.schemaVersion !== SCHEMA_VERSION) {
    if (typeof d.schemaVersion !== "number") return { ok: false, error: err("DSL_SCHEMA_INVALID", "schemaVersion deve ser 1", "$.schemaVersion", "Use schemaVersion: 1") };
    return { ok: false, error: err("DSL_SCHEMA_INVALID", `schemaVersion ${d.schemaVersion} não suportado (esperado ${SCHEMA_VERSION})`, "$.schemaVersion", "Migre o documento ou gere com schemaVersion 1") };
  }
  if (typeof d.title !== "string" || d.title.trim().length === 0 || d.title.length > 200)
    return { ok: false, error: err("DSL_SCHEMA_INVALID", "title obrigatório (1..200 chars)", "$.title", "Dê um título informativo curto") };
  const hasSections = Array.isArray((d as any).sections) && (d as any).sections.length > 0;
  if (!Array.isArray(d.blocks) || d.blocks.length === 0) {
    if (!hasSections)
      return { ok: false, error: err("DSL_SCHEMA_INVALID", "blocks deve ser array não-vazio", "$.blocks", "Inclua ao menos 1 bloco") };
    d.blocks = [{ id: "cover", type: "hero", title: d.title, text: (d as any).description || "" }];
  }
  if (d.blocks.length > MAX_BLOCKS)
    return { ok: false, error: err("LIMIT_EXCEEDED", `máximo ${MAX_BLOCKS} blocos`, "$.blocks", "Divida em seções/tabs ou resuma") };
  const seen = new Set<string>();
  for (let i = 0; i < d.blocks.length; i++) {
    const r = checkBlock(d.blocks[i], `$.blocks[${i}]`, seen);
    if (!r.ok) return r as any;
  }
  try {
    if (JSON.stringify(d).length > MAX_DOC_BYTES)
      return { ok: false, error: err("LIMIT_EXCEEDED", "documento excede 512KB", "$", "Reduza código/dados ou divida o canvas") };
  } catch { /* ignore */ }
  const dsl = d as CanvasDSL;
  if (dsl.theme && !["graphite", "paper"].includes(dsl.theme))
    return { ok: false, error: err("DSL_SCHEMA_INVALID", "theme deve ser graphite|paper", "$.theme", "Use theme graphite (dark) ou paper (light)") };
  // Seções editoriais progressivas (opcional). Blocks permanece o fallback legado.
  if (d.sections !== undefined) {
    if (!Array.isArray(d.sections) || d.sections.length === 0)
      return { ok: false, error: err("DSL_SCHEMA_INVALID", "sections deve ser array não-vazio quando presente", "$.sections", "Use sections: [{id, title, blocks:[...]}] ou omita") };
    if (d.sections.length > 24)
      return { ok: false, error: err("LIMIT_EXCEEDED", "máximo 24 seções", "$.sections", "Agregue seções ou divida o canvas") };
    const seenS = new Set<string>();
    for (let s = 0; s < d.sections.length; s++) {
      const sec = d.sections[s];
      const p = `$.sections[${s}]`;
      if (!sec || typeof sec !== "object") return { ok: false, error: err("DSL_SCHEMA_INVALID", "seção deve ser objeto", p, "Verifique a sintaxe da seção") };
      if (typeof sec.id !== "string" || !/^[a-z0-9][a-z0-9-_]{0,63}$/i.test(sec.id))
        return { ok: false, error: err("DSL_SCHEMA_INVALID", "seção.id obrigatório, alfanumérico curto", `${p}.id`, "Use ids estáveis ex: 'overview'") };
      if (seenS.has(sec.id)) return { ok: false, error: err("DSL_SCHEMA_INVALID", `seção.id duplicado: ${sec.id}`, `${p}.id`, "Renomeie para id único") };
      seenS.add(sec.id);
      if (!Array.isArray(sec.blocks))
        return { ok: false, error: err("DSL_SCHEMA_INVALID", "seção.blocks deve ser array", `${p}.blocks`, "Inclua ao menos 1 bloco na seção") };
      for (let i = 0; i < sec.blocks.length; i++) {
        const r = checkBlock(sec.blocks[i], `${p}.blocks[${i}]`, seen);
        if (!r.ok) return r as any;
      }
    }
  }
  return { ok: true, dsl };
}

function validateDiagram(b: any, p: string) {
  const nodes = b.nodes ?? [];
  const edges = b.edges ?? [];
  if (!Array.isArray(nodes)) return { ok: false, error: err("DSL_SCHEMA_INVALID", "diagram.nodes deve ser array", `${p}.nodes`, "Liste {id,label,kind}") };
  if (!Array.isArray(edges)) return { ok: false, error: err("DSL_SCHEMA_INVALID", "diagram.edges deve ser array", `${p}.edges`, "Liste {from,to,label}") };
  if (nodes.length > MAX_NODES) return { ok: false, error: err("LIMIT_EXCEEDED", `máximo ${MAX_NODES} nós`, `${p}.nodes`, "Agregue serviços em grupos") };
  if (edges.length > MAX_EDGES) return { ok: false, error: err("LIMIT_EXCEEDED", `máximo ${MAX_EDGES} arestas`, `${p}.edges`, "Agregue fluxos") };
  const ids = new Set(nodes.map((n: any) => n?.id));
  for (const n of nodes) {
    if (!n || typeof n.id !== "string" || typeof n.label !== "string")
      return { ok: false, error: err("DSL_SCHEMA_INVALID", "cada node exige {id,label}", `${p}.nodes`, "Ex: {id:'api',label:'API',kind:'service'}") };
  }
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (!e || typeof e.from !== "string" || typeof e.to !== "string")
      return { ok: false, error: err("DSL_SCHEMA_INVALID", "cada edge exige {from,to}", `${p}.edges[${i}]`, "Ex: {from:'browser',to:'api'}") };
    if (!ids.has(e.from) || !ids.has(e.to))
      return { ok: false, error: err("DSL_SCHEMA_INVALID", `edge refere node inexistente: ${e.from}->${e.to}`, `${p}.edges[${i}]`, "Corrija from/to para ids existentes em nodes") };
  }
  if (b.direction && !["LR", "TB", "RL", "BT"].includes(b.direction))
    return { ok: false, error: err("DSL_SCHEMA_INVALID", "direction deve ser LR|TB|RL|BT", `${p}.direction`, "Use LR para fluxos, TB para hierarquias") };
  return { ok: true };
}

export function migrateDSL(input: any): { dsl: any; migrated: boolean; note?: string } {
  if (input && typeof input === "object" && (input.schemaVersion === undefined || input.schemaVersion === 0)) {
    return { dsl: { ...input, schemaVersion: SCHEMA_VERSION }, migrated: true, note: "schemaVersion ausente → 1" };
  }
  return { dsl: input, migrated: false };
}
