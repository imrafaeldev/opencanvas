// MCP Server — stdio por padrão; reutiliza Core + runtime global. Sem storage próprio.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { opCreate, opGet, opUpdate, opList, opDelete, opOpen, opProjects, opProject } from "../service.js";
import { AgentId } from "../core/types.js";

const agent = (process.env.OPENCANVAS_AGENT as AgentId) || "unknown";
const ctx = { agent, base: process.env.OPENCANVAS_HOME };
const j = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });

const server = new McpServer({ name: "opencanvas", version: "0.1.0" }, { capabilities: { tools: {} } });
const cwdSchema = { cwd: z.string().optional().describe("Diretório do workspace aberto (obrigatório se o host não garantir process.cwd())") };

server.tool("canvas_create", "Cria um canvas visual a partir de DSL validada. Use após planejar a composição (skill opencanvas).",
  { title: z.string(), description: z.string().optional(), dsl: z.any(), slug: z.string().optional(), ...cwdSchema },
  async (a) => j(await opCreate(ctx, a as any)));
server.tool("canvas_get", "Carrega um canvas por id ou slug no projeto do cwd.",
  { idOrSlug: z.string(), ...cwdSchema }, async (a) => j(await opGet(ctx, a as any)));
server.tool("canvas_update", "Atualização parcial com expectedRevision (concorrência otimista cross-agent).",
  { idOrSlug: z.string(), expectedRevision: z.number(), patch: z.any(), ...cwdSchema }, async (a) => j(await opUpdate(ctx, a as any)));
server.tool("canvas_list", "Lista canvases do projeto do cwd.", { ...cwdSchema }, async (a) => j(await opList(ctx, a as any)));
server.tool("canvas_delete", "Exclusão explícita (soft-delete reversível). Exija confirmação do usuário.",
  { idOrSlug: z.string(), ...cwdSchema }, async (a) => j(await opDelete(ctx, a as any)));
server.tool("canvas_open", "Garante runtime global e retorna URL (abre gallery ou canvas).",
  { idOrSlug: z.string().optional(), ...cwdSchema }, async (a) => j(await opOpen(ctx, a as any)));
server.tool("canvas_get_project", "Resolve a identidade compartilhada do projeto a partir do cwd.",
  { ...cwdSchema }, async (a) => j(await opProject(ctx, (a as any).cwd)));
server.tool("canvas_list_projects", "Lista todos os projetos conhecidos.", {}, async () => j(await opProjects(ctx)));

await server.connect(new StdioServerTransport());
