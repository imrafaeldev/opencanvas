// OpenCanvas Core — tipos canônicos. Agnóstico a qualquer agente.
export const SCHEMA_VERSION = 1;

export type AgentId = "opencode" | "codex" | "cursor" | "claude" | "cli" | "unknown";
export type LayoutType =
  | "explanation" | "architecture" | "flow" | "comparison" | "timeline"
  | "dashboard" | "code-walkthrough" | "hierarchy" | "sequence" | "mixed";
export type Density = "compact" | "comfortable" | "spacious";
export type ThemeName = "graphite" | "paper";
export type Intent = "info" | "success" | "warning" | "danger" | "neutral";
/** Nível de importância — controla tamanho, contraste e respiro (sem CSS livre). */
export type Importance = "primary" | "secondary" | "supporting";
/** Estratégia de composição do renderer. "auto" delega ao motor de layout. */
export type Composition = "auto" | "row" | "grid" | "stack" | "focus" | "split";
export type Alignment = "center" | "start";
export type BlockType =
  | "text" | "markdown" | "heading" | "section" | "grid" | "card" | "metric"
  | "table" | "list" | "callout" | "code" | "image" | "chart" | "timeline"
  | "steps" | "comparison" | "tabs" | "accordion" | "tree" | "diagram"
  | "hero" | "step-cards" | "split" | "compare" | "chain" | "features" | "takeaway" | "payload" | "security"
  // layouts especializados: a natureza da informação guia a composição
  | "overview" | "process-flow" | "architecture" | "technical" | "code-walkthrough" | "summary";

export interface DiagramNode { id: string; label: string; kind?: string; group?: string; importance?: Importance; detail?: string; }
export interface DiagramEdge { from: string; to: string; label?: string; }
export interface CanvasBlock {
  id: string;
  type: BlockType;
  title?: string;
  text?: string;
  body?: string;
  markdown?: string;
  language?: string;
  code?: string;
  highlight?: number[];
  intent?: Intent;
  items?: any[];
  columns?: string[];
  rows?: any[][];
  nodes?: DiagramNode[];
  edges?: DiagramEdge[];
  direction?: "LR" | "TB" | "RL" | "BT";
  variant?: string;
  groups?: { id: string; label: string; members: string[] }[];
  children?: CanvasBlock[];
  /** --- propriedades semânticas de composição (nunca CSS) --- */
  importance?: Importance;
  composition?: Composition;
  alignment?: Alignment;
  density?: Density;
  /** ocupa N colunas do grid da composição (1..4); renderer limita ao grid real */
  span?: number;
  /** distribuição do auto-layout de diagramas: camadas (padrão) ou clusters por group */
  distribution?: "layered" | "cluster";
  [k: string]: any;
}
export interface CanvasSection {
  id: string;
  kicker?: string;
  title?: string;
  lead?: string;
  layout?: LayoutType | "cover" | "flow" | "split" | "compare" | "chain" | "security";
  composition?: Composition;
  alignment?: Alignment;
  importance?: Importance;
  density?: Density;
  blocks: CanvasBlock[];
}
export interface CanvasDSL {
  schemaVersion: number;
  title: string;
  description?: string;
  theme?: ThemeName;
  layout?: { type: LayoutType; density?: Density; variant?: string };
  blocks: CanvasBlock[];
  sections?: CanvasSection[];
}
export interface CanvasDoc {
  canvasId: string;
  projectId: string;
  slug: string;
  title: string;
  description?: string;
  dsl: CanvasDSL;
  revision: number;
  createdAt: string;
  updatedAt: string;
  createdByAgent?: AgentId;
  updatedByAgent?: AgentId;
  deleted?: boolean;
}
export interface CanvasError {
  code:
    | "DSL_SCHEMA_INVALID" | "CANVAS_NOT_FOUND" | "REVISION_CONFLICT"
    | "RUNTIME_UNAVAILABLE" | "PROJECT_SCOPE_DENIED" | "ADAPTER_CONTEXT_MISSING"
    | "SLUG_CONFLICT" | "TARGET_NOT_CONFIGURED" | "LIMIT_EXCEEDED";
  message: string;
  path?: string;
  hint?: string;
  currentRevision?: number;
}
export const MAX_BLOCKS = 200;
export const MAX_NODES = 150;
export const MAX_EDGES = 250;
export const MAX_DOC_BYTES = 512_000;
