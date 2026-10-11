import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Diagram Renderer — auto-layout declarativo, sem coordenadas do LLM.
//
// Modos de distribuição (`distribution`):
//   "layered" (padrão) — camadas por profundidade (BFS) com ordenação
//   baricêntrica (reduz cruzamentos), eixo LR/TB adaptativo.
//   "cluster"          — agrupa por `nodes[].group` em colunas rotuladas.
//
// Viewport pan/zoom: o diagrama ocupa o viewport em uma viewBox navegável;
// exploração ocorre por arrasto, ctrl+roda e controles, sem scrollbar aninhada.
//
// Interações (locais, sem IA): selecionar nó (clique/toque/Enter) destaca as
// conexões e esmaece o resto; setas navegam entre vizinhos; tooltip mostra
// detalhes; expandir abre o diagrama em tela cheia.
// ---------------------------------------------------------------------------

const MIN_NODE_W = 220;
const MAX_NODE_W = 360;
const NODE_H = 112;
const NODE_H_TB = 112;
const FIT_TOP = 1.2;
const NODE_LABEL_F = 18;
const NODE_META_F = 14;
const EDGE_LABEL_F = 15.5;

export interface DiagramProps {
  nodes?: any[];
  edges?: any[];
  direction?: "LR" | "TB" | "RL" | "BT";
  variant?: string;
  emphasis?: string;
  distribution?: "layered" | "cluster";
  /** Exibe faixa de diagnóstico (contagens, modo). Oculto por padrão. */
  debug?: boolean;
}

const KIND_COLOR: Record<string, string> = {
  service: "#75aaff", api: "#75aaff", client: "#3bdbb8", browser: "#3bdbb8",
  datastore: "#ffcc76", db: "#ffcc76", queue: "#ffcc76", broker: "#a77cfa",
  event: "#a77cfa", cache: "#3bdbb8", user: "#3bdbb8",
};
const HL = "#F59E0B"; // cor de destaque do caminho selecionado

interface Box { x: number; y: number; w: number; h: number; }
interface ClusterBox { label: string; x: number; y: number; w: number; h: number; }

/** BFS por profundidade → camadas. Ciclos não travam: nós visitados entram uma vez. */
function layerize(nodes: any[], edges: any[]) {
  const ids = nodes.map((n: any) => n.id);
  const incoming: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  ids.forEach((id) => { incoming[id] = 0; adj[id] = []; });
  for (const e of edges) {
    if (adj[e.from]) adj[e.from].push(e.to);
    if (incoming[e.to] !== undefined) incoming[e.to]++;
  }
  const depth: Record<string, number> = {};
  const roots = ids.filter((id) => (incoming[id] || 0) === 0);
  const queue = (roots.length ? roots : ids.slice(0, 1)).slice();
  queue.forEach((id) => { depth[id] = 0; });
  const seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    for (const nx of adj[queue[i]] || []) {
      depth[nx] = Math.max(depth[nx] ?? 0, depth[queue[i]] + 1);
      if (!seen.has(nx)) { seen.add(nx); queue.push(nx); }
    }
  }
  ids.forEach((id) => { if (depth[id] === undefined) depth[id] = 0; });

  const layers: string[][] = [];
  ids.forEach((id) => { const d = depth[id]; (layers[d] ||= []).push(id); });
  // Um ciclo pode atualizar a profundidade de um node já visitado e deixar
  // índices vazios (ex.: camadas 0, 1, 3). O ordenador exige camadas densas.
  return { layers: layers.filter((layer): layer is string[] => Boolean(layer)), adj };
}

/** Ordenação baricêntrica (2 varreduras): cada camada herda a ordem média dos
 *  vizinhos da camada anterior/sucessora — reduz cruzamentos sem dependências. */
function orderLayers(layers: string[][], adj: Record<string, string[]>) {
  const pos = (layer: string[]) => Object.fromEntries(layer.map((id, i) => [id, i]));
  for (let pass = 0; pass < 2; pass++) {
    for (let d = 1; d < layers.length; d++) {
      const p = pos(layers[d - 1]);
      const succ: Record<string, string[]> = {};
      for (const id of layers[d - 1]) for (const nx of adj[id] || []) succ[nx] ||= [], succ[nx].push(id);
      layers[d] = layers[d].map((id, i) => ({ id, i }))
        .sort((a, b) => {
          const pa = succ[a.id]?.length ? succ[a.id].reduce((s, q) => s + p[q], 0) / succ[a.id].length : a.i;
          const pb = succ[b.id]?.length ? succ[b.id].reduce((s, q) => s + p[q], 0) / succ[b.id].length : b.i;
          return pa - pb;
        }).map((o) => o.id);
    }
    for (let d = layers.length - 2; d >= 0; d--) {
      const p = pos(layers[d + 1]);
      const pred: Record<string, string[]> = {};
      for (const id of layers[d]) for (const nx of adj[id] || []) if (p[nx] !== undefined) (pred[id] ||= []).push(nx);
      layers[d] = layers[d].map((id, i) => ({ id, i }))
        .sort((a, b) => {
          const pa = pred[a.id]?.length ? pred[a.id].reduce((s, q) => s + p[q], 0) / pred[a.id].length : a.i;
          const pb = pred[b.id]?.length ? pred[b.id].reduce((s, q) => s + p[q], 0) / pred[b.id].length : b.i;
          return pa - pb;
        }).map((o) => o.id);
    }
  }
  return layers;
}

const byId = (nodes: any[]) => Object.fromEntries(nodes.map((n: any) => [n.id, n]));
const labelOf = (n: any) => String(n.label ?? n.id);

function nodeTextParts(n: any, w: number, fontLabel = NODE_LABEL_F, fontSub = NODE_META_F) {
  const maxChars = Math.max(10, Math.floor((w - 78) / (fontLabel * 0.55)));
  const meta = [n.kind, n.group].filter(Boolean).join(" · ");
  const detail = String(n.detail ?? n.description ?? "").trim();
  return {
    labelLines: wrapLabel(labelOf(n), maxChars),
    metaLines: meta ? wrapLabel(meta, maxChars) : [],
    detailLines: detail ? wrapLabel(detail, maxChars) : [],
    maxChars,
    fontSub,
  };
}

function nodeHeight(n: any, w: number, fontLabel = NODE_LABEL_F, fontSub = NODE_META_F, minimum = NODE_H) {
  const parts = nodeTextParts(n, w, fontLabel, fontSub);
  const titleH = parts.labelLines.length * (fontLabel + 5);
  const secondaryH = (parts.metaLines.length + parts.detailLines.length) * (fontSub + 5);
  const gaps = (parts.metaLines.length ? 5 : 0) + (parts.detailLines.length ? 5 : 0);
  return Math.max(minimum, Math.ceil(24 + titleH + secondaryH + gaps));
}

/** Quebra o rótulo em linhas sem cortar conteúdo, inclusive tokens técnicos longos. */
function wrapLabel(raw: string, maxChars: number): string[] {
  const limit = Math.max(8, maxChars);
  const words = raw.split(/\s+/).filter(Boolean).flatMap((word) => {
    if (word.length <= limit) return [word];
    const chunks: string[] = [];
    for (let i = 0; i < word.length; i += limit) chunks.push(word.slice(i, i + limit));
    return chunks;
  });
  if (!words.length) return [raw];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > limit) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

interface Tag { x: number; y: number; w: number; h: number; fixed?: boolean; label?: string; lines?: string[] }

/** Descolisão de rótulos: repulsão vertical em poucas passagens. Nós entram
 *  como obstáculos fixos; só os rótulos se movem. n é pequeno (≤250). */
function declutter(tags: Tag[]): Tag[] {
  const out = tags.map((t) => ({ ...t }));
  for (let pass = 0; pass < 10; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        if (a.fixed && b.fixed) continue;
        const verticalGap = (a.h + b.h) / 2 + 8 - Math.abs(a.y - b.y);
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 12 && verticalGap > 0) {
          const push = verticalGap / 2 + 2;
          if (a.fixed) { b.y += b.y >= a.y ? push * 2 : -push * 2; moved = true; }
          else if (b.fixed) { a.y += a.y >= b.y ? push * 2 : -push * 2; moved = true; }
          else if (a.y <= b.y) { a.y -= push; b.y += push; moved = true; }
          else { a.y += push; b.y -= push; moved = true; }
        }
      }
    }
    if (!moved) break;
  }
  return out;
}

/** Glifo semântico por kind — traço na cor do kind, sobre pastilha sutil. */
function KindGlyph({ kind, color }: { kind?: string; color: string }) {
  const k = String(kind || "").toLowerCase();
  const common = { fill: "none", stroke: color, strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  let body: React.ReactNode = (
    <g {...common}><rect x="-8" y="-6" width="16" height="5" rx="1.4" /><rect x="-8" y="1.5" width="16" height="5" rx="1.4" /></g>
  );
  if (["datastore", "db", "database"].includes(k)) body = (
    <g {...common}><ellipse cx="0" cy="-5" rx="7.5" ry="3" /><path d="M-7.5,-5 v10 c0,1.7 3.4,3 7.5,3 s7.5,-1.3 7.5,-3 v-10 M-7.5,0 c0,1.7 3.4,3 7.5,3 s7.5,-1.3 7.5,-3" /></g>
  );
  else if (["queue", "event", "broker", "topic"].includes(k)) body = (
    <g {...common}><path d="M-8,-6 L0,-1.5 L8,-6 M-8,-0.5 L0,4 L8,-0.5 M-8,5 L0,9.5 L8,5" /></g>
  );
  else if (["client", "browser", "user"].includes(k)) body = (
    <g {...common}><circle cx="0" cy="-3.5" r="3.4" /><path d="M-6.5,8 v-1.6 a6.5,6.5 0 0 1 13,0 V8" /></g>
  );
  else if (["cache"].includes(k)) body = (
    <g {...common}><circle cx="0" cy="0" r="7" /><path d="M0,-4.5 V0 L3.5,2" /></g>
  );
  return <g aria-hidden="true">{body}</g>;
}

export function Diagram({ nodes = [], edges = [], direction = "LR", emphasis, distribution = "layered", debug }: DiagramProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState(1100);
  const [active, setActive] = useState<string | null>(null);
  const [activeEdge, setActiveEdge] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [k, setK] = useState(1);
  const [viewCenter, setViewCenter] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const markerPrefix = useId().replace(/[^a-z0-9]/gi, "");

  const showDebug = debug ?? (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug"));

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setAvail(Math.max(300, el.clientWidth || 1100));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);

  // seleção: nós relacionados ficam, o resto esmaece; arestas do caminho destacam
  const related = useMemo(() => {
    if (!active && activeEdge === null) return null;
    const s = new Set<string>();
    if (active) s.add(active);
    for (const e of edges) {
      if (e.from === active || e.to === active || (activeEdge !== null && edges[activeEdge] === e)) {
        s.add(e.from); s.add(e.to);
      }
    }
    return s;
  }, [active, activeEdge, edges]);
  const toggle = (id: string) => {
    setActive((cur) => (cur === id ? null : id));
    setActiveEdge(null);
  };

  const geo = useMemo(() => {
    const pad = 24;
    const gapCross = 40;
    const budget = avail - pad * 2;
    const table = byId(nodes);
    const small = avail < 640; // mobile: nunca comprime — empilha e explora por scroll

    // A tipografia do SVG é estável; o grafo ganha área/scroll, não uma fonte menor.
    {
      const fontLabel = NODE_LABEL_F;
      const fontSub = NODE_META_F;
      const est = (id: string) => {
        const n = table[id];
        const w = labelOf(n).length * fontLabel * 0.55 + 78;
        return n?.importance === "primary" ? w * 1.12 : w;
      };

      if (distribution === "cluster" && !small) {
        const order: string[] = [];
        const byGroup: Record<string, string[]> = {};
        nodes.forEach((n: any) => {
          const g = n.group || table[n.id]?.kind || "geral";
          (byGroup[g] ||= []).push(n.id);
          if (!order.includes(g)) order.push(g);
        });
        const g = Math.max(1, order.length);
        const gap = 64;
        const widths = order.map((gr) => Math.round(Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, Math.max(...byGroup[gr].map(est))))));
        const nodeHeights = order.map((gr, gi) => byGroup[gr].map((id) => nodeHeight(table[id], widths[gi], fontLabel, fontSub)));
        const head = order.length > 1 ? 48 : 0; // reserva faixa do rótulo do cluster
        const heights = order.map((gr, gi) => nodeHeights[gi].reduce((sum, height) => sum + height, 0) + (byGroup[gr].length - 1) * gapCross);
        const H = Math.max(...heights);
        const boxes: Record<string, Box> = {};
        const clusters: ClusterBox[] = [];
        let x = pad;
        order.forEach((gr, gi) => {
          const off = (H - heights[gi]) / 2;
          const y = pad + off;
          let nodeY = y + head;
          byGroup[gr].forEach((id, j) => {
            const h = nodeHeights[gi][j];
            boxes[id] = { x, y: nodeY, w: widths[gi], h };
            nodeY += h + gapCross;
          });
          clusters.push({ label: gr, x, y, w: widths[gi], h: heights[gi] + head });
          x += widths[gi] + gap;
        });
        const graphW = widths.reduce((sum, width) => sum + width, 0) + (g - 1) * gap + pad * 2;
        if (direction === "RL") {
          Object.values(boxes).forEach((p) => { p.x = graphW - p.x - p.w; });
          clusters.forEach((c) => { c.x = graphW - c.x - c.w; });
        }
        return { boxes, clusters, w: graphW, h: H + pad * 2 + head, horiz: true, reverse: direction === "RL", fontLabel, fontSub, cluster: true as const };
      }

      // --- layered ---
      const horizPreferred = (direction === "LR" || direction === "RL") && !small;
      const { layers: raw, adj } = layerize(nodes, edges);
      const layers = orderLayers(raw.map((l) => l.slice()), adj);
      const layerCount = Math.max(1, layers.length);
      const perLayer = Math.max(1, ...layers.map((l) => l.length));

      // largura por camada a partir do conteúdo (rótulo mais longo)
      const want = layers.map((layer) => Math.max(...layer.map(est)));
      let gapAxis = 92;
      let widths = want.map((w) => Math.round(Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, w))));
      let total = widths.reduce((a, b) => a + b, 0) + gapAxis * (layerCount - 1);
      while (total > budget && gapAxis > 64) {
        gapAxis -= 8;
        total = widths.reduce((a, b) => a + b, 0) + gapAxis * (layerCount - 1);
      }
      // Preserve o eixo semântico pedido enquanto o overflow for explorável.
      // Verticalizar cedo transforma um fluxo curto em uma coluna muito alta e
      // torna as relações mais difíceis de seguir do que um pan horizontal.
      const horiz = horizPreferred && want.every((w, i) => w / widths[i] < 1.35) &&
        (total <= budget * 1.45 || perLayer === 1); // grafos muito largos ainda ganham layout vertical

      if (horiz) {
        const nodeHeights = layers.map((layer, d) => layer.map((id) => nodeHeight(table[id], widths[d], fontLabel, fontSub)));
        const spans = nodeHeights.map((heights) => heights.reduce((sum, height) => sum + height, 0) + Math.max(0, heights.length - 1) * gapCross);
        const crossSpan = Math.max(...spans, NODE_H);
        const graphW = total + pad * 2;
        const boxes: Record<string, Box> = {};
        layers.forEach((layer, d) => {
          const off = (crossSpan - spans[d]) / 2;
          const x = pad + widths.slice(0, d).reduce((a, b) => a + b, 0) + d * gapAxis;
          let y = pad + off;
          layer.forEach((id, j) => {
            const h = nodeHeights[d][j];
            boxes[id] = { x, y, w: widths[d], h };
            y += h + gapCross;
          });
        });
        if (direction === "RL") Object.values(boxes).forEach((p) => { p.x = graphW - p.x - p.w; });
        return { boxes, clusters: null, w: graphW, h: crossSpan + pad * 2, horiz: true, reverse: direction === "RL", fontLabel, fontSub, cluster: false as const };
      }
      if (!horizPreferred && perLayer <= 3 && !small) {
        // TB pedido com poucas colunas: usa a largura pedida
        const nodeW = Math.round(Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, Math.max(...want))));
        const nodeHeights = layers.map((layer) => layer.map((id) => nodeHeight(table[id], nodeW, fontLabel, fontSub)));
        const layerHeights = nodeHeights.map((heights) => Math.max(NODE_H_TB, ...heights));
        const crossSpan = perLayer * nodeW + (perLayer - 1) * gapCross;
        const graphH = layerHeights.reduce((sum, height) => sum + height, 0) + (layerCount - 1) * 72 + pad * 2;
        const boxes: Record<string, Box> = {};
        let y = pad;
        layers.forEach((layer, d) => {
          const rowW = layer.length * nodeW + (layer.length - 1) * gapCross;
          const off = (crossSpan - rowW) / 2;
          layer.forEach((id, j) => {
            boxes[id] = { x: pad + off + j * (nodeW + gapCross), y, w: nodeW, h: nodeHeights[d][j] };
          });
          y += layerHeights[d] + 72;
        });
        if (direction === "BT") Object.values(boxes).forEach((p) => { p.y = graphH - p.y - p.h; });
        return { boxes, clusters: null, w: crossSpan + pad * 2, h: graphH, horiz: false, reverse: direction === "BT", fontLabel, fontSub, cluster: false as const };
      }
      // vertical: camadas empilham, largura uniforme generosa (preenche o container).
      // Em telas pequenas, 1 nó por fileira — nunca comprime lado a lado.
      const colsMax = small ? 1 : 3;
      const nodeWv = small
        ? Math.round(Math.max(232, Math.min(MAX_NODE_W, budget - 8)))
        : Math.round(Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, Math.max(...want, budget * 0.42))));
      const nodeHeights = layers.map((layer) => layer.map((id) => nodeHeight(table[id], nodeWv, fontLabel, fontSub)));
      const crossSpan = Math.min(perLayer, colsMax) * nodeWv + (Math.min(perLayer, colsMax) - 1) * gapCross;
      const boxes: Record<string, Box> = {};
      const rowsOf = (l: string[]) => Math.ceil(l.length / colsMax);
      let cursor = pad;
      layers.forEach((layer, layerIndex) => {
        // camadas largas quebram em fileiras para não estourar a largura
        const rowHeights = Array.from({ length: rowsOf(layer) }, (_, row) =>
          Math.max(NODE_H_TB, ...layer.slice(row * colsMax, (row + 1) * colsMax).map((_, j) => nodeHeights[layerIndex][row * colsMax + j])));
        layer.forEach((id, j) => {
          const row = Math.floor(j / colsMax), col = j % colsMax;
          const cols = Math.min(colsMax, layer.length - row * colsMax);
          const rowW = cols * nodeWv + (cols - 1) * gapCross;
          const ox = pad + (Math.max(crossSpan, rowW) - rowW) / 2;
          const y = cursor + rowHeights.slice(0, row).reduce((sum, height) => sum + height + gapCross, 0);
          boxes[id] = { x: ox + col * (nodeWv + gapCross), y, w: nodeWv, h: nodeHeights[layerIndex][j] };
        });
        cursor += rowHeights.reduce((sum, height) => sum + height, 0) + (rowHeights.length - 1) * gapCross + 72;
      });
      const h = cursor - 72 + pad;
      if (direction === "BT") Object.values(boxes).forEach((p) => { p.y = h - p.y - p.h; });
      return { boxes, clusters: null, w: crossSpan + pad * 2, h, horiz: false, reverse: direction === "BT", fontLabel, fontSub, cluster: false as const };
    }
    return { boxes: {}, clusters: null, w: avail, h: 300, horiz: true, reverse: false, fontLabel: NODE_LABEL_F, fontSub: NODE_META_F, cluster: false as const };
  }, [nodes, edges, direction, distribution, avail]);

  // Altura do palco: acompanha a proporção do grafo (sem letterbox), com
  // limites confortáveis; em tela cheia, usa a viewport.
  const boxH = useMemo(() => {
    if (expanded) return Math.round(Math.max(420, Math.min(900, window.innerHeight * 0.78)));
    const aspect = geo.h / Math.max(1, geo.w);
    const natural = Math.round(avail * aspect);
    const narrow = avail < 640;
    const minH = emphasis === "primary" ? 420 : 360;
    // On narrow screens, a vertical graph can use document scroll around the
    // stage. Capping it at 640px would hide lower nodes behind a fake viewport.
    const cap = narrow ? Math.max(640, Math.min(1200, natural || 640)) : 640;
    return Math.round(Math.max(minH, Math.min(cap, natural || minH)));
  }, [geo, avail, emphasis, expanded]);

  const viewport = useMemo(() => ({
    w: Math.max(240, avail - 48),
    h: Math.max(220, boxH - 32),
  }), [avail, boxH]);

  // Fit real do grafo, usado apenas pelo botão "Ajustar". O primeiro render
  // usa uma escala de exploração baseada na complexidade, sem miniaturizar o texto.
  const fitK = useMemo(() => {
    const fitW = viewport.w / Math.max(1, geo.w), fitH = viewport.h / Math.max(1, geo.h);
    return +Math.max(0.25, Math.min(fitW, fitH, FIT_TOP)).toFixed(3);
  }, [geo, viewport]);

  const exploreK = useMemo(() => {
    const complex = nodes.length + edges.length > 12;
    const fitWidth = viewport.w / Math.max(1, geo.w);
    const fitHeight = viewport.h / Math.max(1, geo.h);
    const smallGraph = nodes.length <= 8;
    // Um grafo pequeno não deve nascer com as pontas cortadas. Para grafos
    // altos, preservar uma escala legível é mais útil que miniaturizar tudo.
    if (smallGraph && fitWidth <= fitHeight && fitK < 0.84) return fitK;
    return +Math.min(1, Math.max(fitK, complex ? 0.86 : 0.92)).toFixed(3);
  }, [edges.length, fitK, geo.h, geo.w, nodes.length, viewport.h, viewport.w]);

  const explorationCenter = useMemo(() => ({
    x: geo.w / 2,
    y: !geo.horiz && geo.h > viewport.h / exploreK ? viewport.h / exploreK / 2 : geo.h / 2,
  }), [exploreK, geo.h, geo.horiz, geo.w, viewport.h]);

  const viewBox = useMemo(() => {
    const w = viewport.w / Math.max(0.25, k), h = viewport.h / Math.max(0.25, k);
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const x = geo.w <= w ? (geo.w - w) / 2 : clamp(viewCenter.x - w / 2, 0, geo.w - w);
    const y = geo.h <= h ? (geo.h - h) / 2 : clamp(viewCenter.y - h / 2, 0, geo.h - h);
    return { x, y, w, h };
  }, [geo.h, geo.w, k, viewCenter.x, viewCenter.y, viewport.h, viewport.w]);

  // Centraliza somente o primeiro render. Resize conserva o centro explorado.
  const initializedView = useRef(false);
  useEffect(() => {
    if (initializedView.current) return;
    setK(exploreK);
    setViewCenter(explorationCenter);
    initializedView.current = true;
  }, [explorationCenter, exploreK]);

  // Resize/layout changes keep the explored region instead of jumping back to
  // the origin. Normalize the old center when the graph dimensions change.
  const lastLayout = useRef<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const previous = lastLayout.current;
    lastLayout.current = { w: geo.w, h: geo.h };
    if (!initializedView.current || !previous || (previous.w === geo.w && previous.h === geo.h)) return;
    setViewCenter((center) => ({
      x: center.x * geo.w / Math.max(1, previous.w),
      y: center.y * geo.h / Math.max(1, previous.h),
    }));
  }, [geo.h, geo.w]);

  const zoomBy = (d: number, cx?: number, cy?: number) => {
    const next = Math.min(2.5, Math.max(0.4, +(k + d).toFixed(2)));
    if (next === k) return;
    const px = Math.max(0, Math.min(viewport.w, cx ?? viewport.w / 2));
    const py = Math.max(0, Math.min(viewport.h, cy ?? viewport.h / 2));
    const oldW = viewport.w / k, oldH = viewport.h / k;
    const anchorX = viewBox.x + (px / viewport.w) * oldW;
    const anchorY = viewBox.y + (py / viewport.h) * oldH;
    const newW = viewport.w / next, newH = viewport.h / next;
    setK(next);
    setViewCenter({ x: anchorX + (0.5 - px / viewport.w) * newW, y: anchorY + (0.5 - py / viewport.h) * newH });
  };
  const fitView = () => {
    setK(fitK);
    setViewCenter({ x: geo.w / 2, y: geo.h / 2 });
  };
  const resetView = () => { setK(exploreK); setViewCenter(explorationCenter); setActive(null); setActiveEdge(null); };

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return; // scroll nativo faz o pan; zoom só com modificador
    e.preventDefault();
    const rect = scrollRef.current?.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 0.12 : -0.12, rect ? e.clientX - rect.left - 16 : undefined, rect ? e.clientY - rect.top - 16 : undefined);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".diagram-node, .diagram-edge, .diagram-edge-label")) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, l: viewCenter.x, t: viewCenter.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    setViewCenter({ x: d.l - (e.clientX - d.x) / k, y: d.t - (e.clientY - d.y) / k });
  };
  const endDrag = () => { drag.current = null; };

  // Diagnóstico interno (contagens, camadas, auto-fit): oculto por padrão,
  // visível só com ?debug na URL ou oc-debug=1 no localStorage.
  const debugInfo = useMemo(() => {
    let on = false;
    try {
      on = new URLSearchParams(window.location.search).has("debug")
        || window.localStorage.getItem("oc-debug") === "1";
    } catch { on = false; }
    if (!on) return null;
    const layers = geo.cluster ? "clusters" : "camadas";
    return `diagnóstico · ${nodes.length} nós · ${edges.length} arestas · ${layers} · auto-fit ${(fitK * 100).toFixed(0)}%`;
  }, [nodes.length, edges.length, geo.cluster, fitK]);

  const dimOf = (id: string) => (related && !related.has(id) ? 1 : 0);
  const edgeOn = (e: any, index?: number) => !related || e.from === active || e.to === active || index === activeEdge;

  // portas de entrada/saída distribuídas + voies paralelas separadas
  const ports = useMemo(() => {
    const outBy: Record<string, any[]> = {}, inBy: Record<string, any[]> = {};
    edges.forEach((e: any) => { (outBy[e.from] ||= []).push(e); (inBy[e.to] ||= []).push(e); });
    const cy = (id: string) => { const b = geo.boxes[id]; return b ? b.y + b.h / 2 : 0; };
    const cx = (id: string) => { const b = geo.boxes[id]; return b ? b.x + b.w / 2 : 0; };
    Object.values(outBy).forEach((list) => list.sort((a, b) => (geo.horiz ? cy(a.to) - cy(b.to) : cx(a.to) - cx(b.to))));
    Object.values(inBy).forEach((list) => list.sort((a, b) => (geo.horiz ? cy(a.from) - cy(b.from) : cx(a.from) - cx(b.from))));
    const laneOf = new Map<any, number>();
    const pairCount: Record<string, number> = {};
    edges.forEach((e: any) => { const key = `${e.from}→${e.to}`; laneOf.set(e, pairCount[key] || 0); pairCount[key] = (pairCount[key] || 0) + 1; });
    const pairLane = (e: any) => {
      const n = pairCount[`${e.from}→${e.to}`] || 1;
      return (laneOf.get(e)! - (n - 1) / 2) * 12;
    };
    const portOf = (list: any[] | undefined, e: any, span: number) => {
      if (!list || list.length <= 1) return 0;
      const i = list.indexOf(e);
      const off = (i - (list.length - 1) / 2) * Math.min(16, span / Math.max(1, list.length));
      return Math.max(-span / 2 + 18, Math.min(span / 2 - 18, off));
    };
    return { outBy, inBy, portOf, pairLane };
  }, [edges, geo]);

  const edgePath = (e: any) => {
    const a = geo.boxes[e.from], b = geo.boxes[e.to];
    if (!a || !b) return null;
    const lane = ports.pairLane(e);
    const sameColumn = Math.abs(a.x - b.x) < 10 && Math.abs(a.y - b.y) > 10;
    if (geo.horiz && !sameColumn) {
      const y1 = a.y + a.h / 2 + ports.portOf(ports.outBy[e.from], e, a.h);
      const y2 = b.y + b.h / 2 + ports.portOf(ports.inBy[e.to], e, b.h);
      const x1 = geo.reverse ? a.x : a.x + a.w;
      const x2 = geo.reverse ? b.x + b.w : b.x;
      const axisGap = geo.reverse ? x1 - x2 : x2 - x1;
      if (axisGap < 28) { // camadas adjacentes coladas ou refluxo: desvia por cima
        const top = Math.min(a.y, b.y) - 18;
        const bend = geo.reverse ? -18 : 18;
        return `M${x1},${y1} C${x1 + bend},${y1} ${x1 + bend},${top} ${((x1 + x2) / 2).toFixed(1)},${top} S${x2 - bend},${y2} ${x2},${y2}`;
      }
      const mx = (x1 + x2) / 2 + lane * 0.4;
      return `M${x1},${y1.toFixed(1)} C${mx.toFixed(1)},${y1.toFixed(1)} ${mx.toFixed(1)},${y2.toFixed(1)} ${x2},${y2.toFixed(1)}`;
    }
    const x1 = a.x + a.w / 2 + ports.portOf(ports.outBy[e.from], e, a.w);
    const x2 = b.x + b.w / 2 + ports.portOf(ports.inBy[e.to], e, b.w) + lane * 0.5;
    const y1 = geo.reverse ? a.y : a.y + a.h, y2 = geo.reverse ? b.y + b.h : b.y;
    const axisGap = geo.reverse ? y1 - y2 : y2 - y1;
    if (axisGap < 24) {
      const side = Math.max(a.x + a.w, b.x + b.w) + 20;
      return `M${x1},${y1} H${side.toFixed(1)} V${y2} H${x2.toFixed(1)}`;
    }
    const my = (y1 + y2) / 2; // ortogonal com cantos arredondados
    const r = 10;
    const dx1 = x2 > x1 ? 1 : -1;
    const bend = geo.reverse ? r : -r;
    return `M${x1.toFixed(1)},${y1} V${(my + bend).toFixed(1)} Q${x1.toFixed(1)},${my.toFixed(1)} ${(x1 + dx1 * r).toFixed(1)},${my.toFixed(1)} H${(x2 - dx1 * r).toFixed(1)} Q${x2.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${(my - bend).toFixed(1)} V${y2}`;
  };

  const edgePaths = useMemo(() => edges.map((e: any) => edgePath(e)), [edges, geo, ports]);

  const hasEdges = edges.some((e: any) => e.label);
  // posições dos rótulos de aresta com descolisão (nós = obstáculos fixos)
  const edgeTags = useMemo(() => {
    const items = edges
      .map((e: any, i: number) => {
        const a = geo.boxes[e.from], b = geo.boxes[e.to];
        if (!a || !b || !e.label) return null;
        const full = String(e.label);
        const lines = wrapLabel(full, 24);
        const w = Math.max(...lines.map((line) => line.length * EDGE_LABEL_F * 0.55 + 24));
        const h = lines.length * 20 + 10;
        const laneJitter = (() => {
          // pares paralelos (a→d, b→c…) ganham âncoras distintas ao longo do vão
          const key = [e.from, e.to].sort().join("→");
          let h = 0;
          for (let ci = 0; ci < key.length; ci++) h = (h * 31 + key.charCodeAt(ci)) % 997;
          return (h % 5 - 2) * 14;
        })();
        let x: number, y: number;
        if (geo.horiz) {
          x = (a.x + a.w + b.x) / 2 + laneJitter; y = (a.y + b.y) / 2 + (a.h + b.h) / 4 - 12;
        } else {
          x = (a.x + b.x) / 2 + (a.w + b.w) / 4;
          y = (a.y + a.h + b.y) / 2 + laneJitter * 0.5;
        }
        return { i, label: full, lines, x, y, w, h };
      })
      .filter(Boolean) as { i: number; label: string; lines: string[]; x: number; y: number; w: number; h: number }[];
    const obstacles: Tag[] = nodes
      .map((n: any) => geo.boxes[n.id])
      .filter(Boolean)
      .map((p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2, w: p.w + 28, h: p.h + 18, fixed: true }));
    // cabeçalhos dos clusters também desviam rótulos
    (geo.clusters || []).forEach((c) => {
      obstacles.push({ x: c.x + c.w / 2, y: c.y + 28, w: c.w * 0.7, h: 24, fixed: true });
    });
    const solved = declutter([...obstacles, ...items.map((t) => ({ ...t }))]);
    const byIndex = new Map(items.map((t, kk) => [t.i, solved[obstacles.length + kk]]));
    return byIndex;
  }, [edges, geo, nodes]);

  const moveActive = (dir: "left" | "right" | "up" | "down") => {
    const ids = nodes.map((n: any) => n.id);
    if (!ids.length) return;
    if (!active) { setActive(ids[0]); return; }
    const c = geo.boxes[active];
    if (!c) { setActive(ids[0]); return; }
    const cx = c.x + c.w / 2, cyy = c.y + c.h / 2;
    let best: string | null = null, bestScore = Infinity;
    for (const id of ids) {
      if (id === active) continue;
      const b = geo.boxes[id];
      if (!b) continue;
      const dx = b.x + b.w / 2 - cx, dy = b.y + b.h / 2 - cyy;
      const ok = dir === "left" ? dx < -8 : dir === "right" ? dx > 8 : dir === "up" ? dy < -8 : dy > 8;
      if (!ok) continue;
      const score = Math.abs(dir === "left" || dir === "right" ? dy : dx) * 2.2 + Math.abs(dir === "left" || dir === "right" ? dx : dy);
      if (score < bestScore) { bestScore = score; best = id; }
    }
    if (best) setActive(best);
  };

  const activeNode = active ? byId(nodes)[active] : null;
  const selectedEdge = activeEdge === null ? null : edges[activeEdge] || null;
  const selectEdge = (index: number) => {
    setActiveEdge((cur) => (cur === index ? null : index));
    setActive(null);
  };
  const centerSelection = () => {
    if (activeNode) {
      const p = geo.boxes[activeNode.id];
      if (p) setViewCenter({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
    } else if (selectedEdge) {
      const a = geo.boxes[selectedEdge.from], b = geo.boxes[selectedEdge.to];
      if (a && b) setViewCenter({ x: (a.x + a.w / 2 + b.x + b.w / 2) / 2, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 });
    }
  };
  const activeNeighbors = useMemo(() => {
    if (!active) return [];
    const t = byId(nodes);
    const out = [];
    for (const e of edges) {
      if (e.from === active && t[e.to]) out.push({ dir: "→", node: t[e.to], via: e.label });
      if (e.to === active && t[e.from]) out.push({ dir: "←", node: t[e.from], via: e.label });
    }
    return out.slice(0, 6);
  }, [active, edges, nodes]);

  return (
    <>
      {expanded && <div className="diagram-scrim" onClick={() => setExpanded(false)} aria-hidden="true" />}
      <div
        className={`soft-card diagram-frame${expanded ? " expanded" : ""}`}
        ref={hostRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setExpanded(false); setActive(null); setActiveEdge(null); }
          else if (e.key === "+" || e.key === "=") zoomBy(0.15);
          else if (e.key === "-") zoomBy(-0.15);
          else if (e.key === "0") resetView();
          else if (e.key.toLowerCase() === "f") fitView();
          else if (e.key.toLowerCase() === "c" && (active || activeEdge !== null)) centerSelection();
        }}
      >
        <div className="diagram-bar" role="toolbar" aria-label="Controles do diagrama">
          <button className="btn diagram-tool" onClick={() => zoomBy(0.15)} aria-label="Ampliar diagrama">+</button>
          <button className="btn diagram-tool" onClick={() => zoomBy(-0.15)} aria-label="Reduzir diagrama">−</button>
          <button className="btn diagram-tool" onClick={fitView}>Ajustar</button>
          <button className="btn diagram-tool" onClick={resetView}>Repor</button>
          {(active || activeEdge !== null) && <button className="btn diagram-tool" onClick={centerSelection}>Centralizar</button>}
          <span className="diagram-zoom" aria-live="polite">{Math.round(k * 100)}%</span>
          <span className="diagram-hint">Arraste para explorar · clique em nodes/edges · +/−/F/C</span>
          <button className="btn diagram-tool" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-label={expanded ? "Fechar tela cheia" : "Abrir diagrama em tela cheia"}>
            {expanded ? "✕ Fechar" : "⤢ Expandir"}
          </button>
        </div>
        <div
          ref={scrollRef}
          className="diagram-canvas diagram-scroll"
          style={expanded ? undefined : { height: boxH }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <svg
            width="100%"
            height="100%"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label={`Diagrama interativo${active ? `, ${labelOf(byId(nodes)[active] ?? {})} selecionado` : selectedEdge ? ", conexão selecionada" : ""}. Use Tab para navegar entre os nós e conexões, Enter para selecionar e setas para mover a seleção.`}
            className="diagram-svg"
          >
            <defs>
              <marker id={`${markerPrefix}-a`} markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M0.8,0.8 L9,5 L0.8,9.2 Z" fill="#75aaff" />
              </marker>
              <marker id={`${markerPrefix}-b`} markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M0.8,0.8 L9,5 L0.8,9.2 Z" fill="#a77cfa" />
              </marker>
              <marker id={`${markerPrefix}-hl`} markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M0.8,0.8 L9,5 L0.8,9.2 Z" fill={HL} />
              </marker>
            </defs>

            {geo.clusters?.map((c) => (
              <g key={c.label} aria-hidden="true">
                <rect x={c.x - 14} y={c.y} width={c.w + 28} height={c.h} rx={22} fill="rgba(117,170,255,0.05)" stroke="rgba(119,141,202,0.3)" strokeDasharray="5 6" />
                <text x={c.x + c.w / 2} y={c.y + 30} fontSize={15} fontWeight={700} letterSpacing={1.5} fill="#b7c4df" textAnchor="middle" style={{ textTransform: "uppercase" }}>{c.label}</text>
              </g>
            ))}

            {edges.map((e: any, i: number) => {
              const d = edgePaths[i];
              if (!d) return null;
              const on = edgeOn(e, i);
              const hl = (active !== null || activeEdge !== null) && on;
              const violet = i % 2 === 1;
              const stroke = hl ? HL : violet ? "#a77cfa" : "#75aaff";
              return (
                <g
                  key={`e${i}`}
                  className="diagram-edge"
                  role="button"
                  tabIndex={0}
                  aria-label={`${labelOf(byId(nodes)[e.from] ?? { id: e.from })} → ${labelOf(byId(nodes)[e.to] ?? { id: e.to })}${e.label ? `, ${e.label}` : ""}`}
                  onClick={() => selectEdge(i)}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectEdge(i); } }}
                  data-dim={on ? 0 : 1}
                >
                  <path d={d} fill="none" stroke="transparent" strokeWidth={14} strokeLinecap="round" pointerEvents="stroke" />
                  {hl && <path d={d} fill="none" stroke={HL} strokeOpacity={0.22} strokeWidth={8} strokeLinecap="round" />}
                  <path
                    d={d}
                    fill="none"
                    stroke={stroke}
                    strokeOpacity={on ? 0.95 : 0.5}
                    strokeWidth={hl ? 3 : 2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    markerEnd={`url(#${markerPrefix}-${hl ? "hl" : violet ? "b" : "a"})`}
                  />
                </g>
              );
            })}

            {nodes.map((n: any, i: number) => {
              const p = geo.boxes[n.id];
              if (!p) return null;
              const c = KIND_COLOR[n.kind] || (i % 2 ? "#a77cfa" : "#75aaff");
              const sel = active === n.id;
              const raw = labelOf(n);
              const parts = nodeTextParts(n, p.w, geo.fontLabel, geo.fontSub);
              const lines = parts.labelLines;
              const subLines = parts.metaLines;
              const detailLines = parts.detailLines;
              const subF = geo.fontSub;
              const lineH = geo.fontLabel + 5;
              const secondaryLineH = subF + 5;
              const blockH = lines.length * lineH
                + (subLines.length ? 5 + subLines.length * secondaryLineH : 0)
                + (detailLines.length ? 5 + detailLines.length * secondaryLineH : 0);
              const startY = p.y + p.h / 2 - blockH / 2 + geo.fontLabel * 0.78;
              const hero = n.importance === "primary";
              return (
                <g
                  key={n.id}
                  className="diagram-node"
                  tabIndex={0}
                  role="button"
                  aria-pressed={sel}
                  aria-label={`${raw}${parts.metaLines.length ? `, ${parts.metaLines.join(" ")}` : ""}${parts.detailLines.length ? `, ${parts.detailLines.join(" ")}` : ""}. Pressione Enter para ${sel ? "desselecionar" : "destacar as conexões"}.`}
                  data-dim={dimOf(n.id)}
                  onClick={() => toggle(n.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(n.id); }
                    else if (ev.key === "ArrowRight") { ev.preventDefault(); moveActive(geo.horiz ? "right" : "down"); }
                    else if (ev.key === "ArrowLeft") { ev.preventDefault(); moveActive(geo.horiz ? "left" : "up"); }
                    else if (ev.key === "ArrowDown") { ev.preventDefault(); moveActive("down"); }
                    else if (ev.key === "ArrowUp") { ev.preventDefault(); moveActive("up"); }
                  }}
                >
                  {hero && (
                    <rect x={p.x - 5} y={p.y - 5} width={p.w + 10} height={p.h + 10} rx={22} fill="none" stroke={c} strokeOpacity={0.32} strokeWidth={7} />
                  )}
                  <rect
                    x={p.x} y={p.y} width={p.w} height={p.h} rx={18}
                    fill={sel ? "#1a2a4f" : "#12203d"}
                    stroke={sel ? HL : c}
                    strokeOpacity={sel ? 1 : hero ? 0.95 : 0.62}
                    strokeWidth={sel || hero ? 3 : 1.8}
                  />
                  <rect x={p.x + 14} y={p.y + p.h / 2 - 15} width={30} height={30} rx={9} fill={`${c}1f`} stroke={`${c}55`} />
                  <g transform={`translate(${p.x + 29},${p.y + p.h / 2})`}>
                    <KindGlyph kind={n.kind} color={sel ? HL : c} />
                  </g>
                  {lines.map((ln, li) => (
                    <text key={li} x={p.x + 54} y={startY + li * lineH} fontSize={geo.fontLabel} fontWeight={700} fill="#f1f4fd">{ln}</text>
                  ))}
                  {subLines.map((line, li) => (
                    <text key={`meta-${li}`} x={p.x + 54} y={startY + lines.length * lineH + 2 + li * secondaryLineH} fontSize={subF} fontWeight={600} fill="#c2cde6">{line}</text>
                  ))}
                  {detailLines.map((line, li) => (
                    <text key={`detail-${li}`} x={p.x + 54} y={startY + lines.length * lineH + (subLines.length ? 7 + subLines.length * secondaryLineH : 2) + li * secondaryLineH} fontSize={subF} fill="#b4c2df">{line}</text>
                  ))}
                  {(n.detail || n.description) && <title>{n.detail || n.description}</title>}
                </g>
              );
            })}

            {edges.map((e: any, i: number) => {
              const t = edgeTags.get(i);
              // Em grafos densos, a relação continua selecionável pelo traço;
              // o label aparece no edge ativo e no inspector, evitando uma
              // camada permanente de texto sobre os nodes.
              if (!t || (edges.length > 14 && activeEdge !== i)) return null;
              const on = edgeOn(e, i);
              return (
                <g
                  key={`l${i}`}
                  className="diagram-edge-label"
                  data-dim={on ? 0 : 1}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={(ev) => { ev.stopPropagation(); selectEdge(i); }}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectEdge(i); } }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Conexão ${labelOf(byId(nodes)[e.from] ?? { id: e.from })} → ${labelOf(byId(nodes)[e.to] ?? { id: e.to })}${e.label ? `, ${e.label}` : ""}`}
                >
                  <rect x={t.x - t.w / 2} y={t.y - t.h / 2} width={t.w} height={t.h} rx={10} fill={activeEdge === i ? "#2a1f08" : "#0b1224"} fillOpacity={0.98} stroke={activeEdge === i ? "rgba(245,158,11,0.7)" : "rgba(119,141,202,0.42)"} />
                  {(t.lines || [t.label || ""]).map((line, li, all) => (
                    <text key={li} x={t.x} y={t.y + (li - (all.length - 1) / 2) * 20} fontSize={EDGE_LABEL_F} fontWeight={650} fill={activeEdge === i ? "#ffd184" : "#dbe5fb"} textAnchor="middle" dominantBaseline="middle">{line}</text>
                  ))}
                </g>
              );
            })}
          </svg>

        </div>
        {(activeNode || selectedEdge) && (
          <aside className="diagram-inspector" aria-live="polite">
            <div className="diagram-tip-head">
              <div>
                <strong>{activeNode ? labelOf(activeNode) : `${labelOf(byId(nodes)[selectedEdge?.from] ?? { id: selectedEdge?.from })} → ${labelOf(byId(nodes)[selectedEdge?.to] ?? { id: selectedEdge?.to })}`}</strong>
                {activeNode && [activeNode.kind, activeNode.group].filter(Boolean).length > 0 && (
                  <div className="diagram-tip-sub">{[activeNode.kind, activeNode.group].filter(Boolean).join(" · ")}</div>
                )}
                {selectedEdge?.label && <div className="diagram-tip-sub">{selectedEdge.label}</div>}
              </div>
              <button className="btn diagram-tool" onClick={() => { setActive(null); setActiveEdge(null); }} aria-label="Limpar seleção">✕</button>
            </div>
            {activeNode?.detail && <p>{activeNode.detail}</p>}
            {selectedEdge && <p>{selectedEdge.from} → {selectedEdge.to}. Selecione um node para inspecionar o contexto completo.</p>}
            {activeNeighbors.length > 0 && (
              <ul>
                {activeNeighbors.map((r: any, j: number) => (
                  <li key={j}>
                    <button className="diagram-link" onClick={() => toggle(r.node.id)}>
                      {r.dir} {labelOf(r.node)}{r.via ? ` — ${r.via}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
        {/* visão alternativa acessível: a lista de adjacências é a fonte da verdade */}
        <details className="diagram-alt">
          <summary>Ver conexões do diagrama</summary>
          <ul>
            {edges.map((e: any, i: number) => (
              <li key={i}>
                <strong>{labelOf(byId(nodes)[e.from] ?? { id: e.from })}</strong>
                <span aria-hidden="true"> → </span>
                <strong>{labelOf(byId(nodes)[e.to] ?? { id: e.to })}</strong>
                {e.label ? ` — ${e.label}` : ""}
              </li>
            ))}
            {edges.length === 0 && <li>Nenhuma conexão declarada.</li>}
          </ul>
        </details>
        {showDebug && (
          <div className="diagram-debug" data-testid="diagram-debug">
            {nodes.length} nós · {edges.length} arestas · {geo.horiz ? "horizontal" : "vertical"} · {distribution} · {Math.round(k * 100)}% · {avail}px · {geo.w}×{geo.h}
          </div>
        )}
      </div>
    </>
  );
}

export function Chart({ series, kind }: any) {
  const s: number[] = Array.isArray(series) ? series.map(Number).filter((n) => Number.isFinite(n)) : [];
  if (!s.length) return <div className="empty">Sem dados</div>;
  const max = Math.max(...s, 1);
  if (kind === "line") {
    const pts = s.map((v, i) => `${(i / Math.max(1, s.length - 1)) * 560 + 20},${150 - (v / max) * 120}`).join(" ");
    return (
      <svg viewBox="0 0 600 170" width="100%" height={190} role="img" aria-label="Gráfico de linha">
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        {s.map((v, i) => <circle key={i} cx={(i / Math.max(1, s.length - 1)) * 560 + 20} cy={150 - (v / max) * 120} r={4} fill="var(--accent)" />)}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 600 190" width="100%" height={190} role="img" aria-label="Gráfico de barras">
      {s.map((v, i) => {
        const w = 560 / s.length;
        const h = (v / max) * 140;
        return (
          <g key={i}>
            <rect x={20 + i * w + 4} y={160 - h} width={Math.max(6, w - 8)} height={h} rx={6} fill="var(--accent2)" opacity={0.9} />
            <text x={20 + i * w + w / 2} y={180} fontSize={13} fill="var(--muted)" textAnchor="middle">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}
