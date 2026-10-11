import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Diagram Renderer — auto-layout declarativo, sem coordenadas do LLM.
//
// Modos de distribuição (`distribution`):
//   "layered" (padrão) — camadas por profundidade (BFS) com ordenação
//   baricêntrica (reduz cruzamentos), eixo LR/TB adaptativo.
//   "cluster"          — agrupa por `nodes[].group` em colunas rotuladas.
//
// Viewport pan/zoom: o diagrama nasce em escala legível ocupando o container
// (fit com piso de legibilidade) e o restante é explorado por arrasto,
// scroll nativo, ctrl+roda e botões — nunca por miniaturização ilegível.
//
// Interações (locais, sem IA): selecionar nó (clique/toque/Enter) destaca as
// conexões e esmaece o resto; setas navegam entre vizinhos; tooltip mostra
// detalhes; expandir abre o diagrama em tela cheia.
// ---------------------------------------------------------------------------

const MIN_NODE_W = 220;
const MAX_NODE_W = 360;
const NODE_H = 104;
const NODE_H_TB = 96;
/** Piso de legibilidade do fit inicial: abaixo disso, mantém escala legível
 *  e deixa o restante para pan/scroll em vez de miniaturizar o texto. */
const FIT_FLOOR = 0.55;
const FIT_TOP = 1.2;
const LEGIBLE_K = 0.72;

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
interface GraphBounds { x: number; y: number; w: number; h: number; }

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
  return { layers, adj };
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

/** Quebra o rótulo em até 2 linhas sem cortar palavra; a 2ª ganha "…". */
function wrapLabel(raw: string, maxChars: number): string[] {
  const words = raw.split(/\s+/).filter(Boolean);
  if (!words.length) return [raw];
  if (raw.length <= maxChars) return [raw];
  const first: string[] = [];
  let len = 0;
  for (const w of words) {
    const add = (first.length ? 1 : 0) + w.length;
    if (len + add <= maxChars) { first.push(w); len += add; }
    else break;
  }
  if (!first.length) return [`${raw.slice(0, Math.max(8, maxChars - 1))}…`];
  const rest = words.slice(first.length).join(" ");
  if (!rest) return [first.join(" ")];
  return [first.join(" "), rest.length > maxChars ? `${rest.slice(0, Math.max(8, maxChars - 1))}…` : rest];
}

interface Tag { x: number; y: number; w: number; h: number; fixed?: boolean; label?: string }

/** Descolisão de rótulos: repulsão vertical em poucas passagens. Nós entram
 *  como obstáculos fixos; só os rótulos se movem. n é pequeno (≤250). */
function declutter(tags: Tag[]): Tag[] {
  const out = tags.map((t) => ({ ...t }));
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        if (a.fixed && b.fixed) continue;
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 12 && Math.abs(a.y - b.y) < 31) {
          const push = (31 - Math.abs(a.y - b.y)) / 2 + 2;
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
  const [expanded, setExpanded] = useState(false);
  const [k, setK] = useState(1);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);

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

  // seleção: nós relacionados ficam, o resto esmaece; arestas do caminho destacam
  const related = useMemo(() => {
    if (!active) return null;
    const s = new Set<string>([active]);
    for (const e of edges) {
      if (e.from === active) s.add(e.to);
      if (e.to === active) s.add(e.from);
    }
    return s;
  }, [active, edges]);
  const toggle = (id: string) => setActive((cur) => (cur === id ? null : id));

  const geo = useMemo(() => {
    const pad = 24;
    const gapCross = 40;
    const budget = avail - pad * 2;
    const table = byId(nodes);
    const small = avail < 640; // mobile: nunca comprime — empilha e explora por scroll

    // tipografia tentada do maior para o menor: a primeira que couber vence,
    // então o texto nasce legível em vez de nascer pequeno e escalar.
    for (const fontLabel of [18, 17, 16]) {
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
        const nodeW = Math.round(Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, (budget - gap * (g - 1)) / g)));
        // exige que o rótulo mais longo de cada grupo caiba; senão tenta fonte menor
        const fits = order.every((gr) =>
          Math.max(...byGroup[gr].map(est)) <= nodeW + 4);
        if (!fits && fontLabel > 16) continue;
        const nodeH = NODE_H;
        const head = order.length > 1 ? 48 : 0; // reserva faixa do rótulo do cluster
        const heights = order.map((gr) => byGroup[gr].length * nodeH + (byGroup[gr].length - 1) * gapCross);
        const H = Math.max(...heights);
        const boxes: Record<string, Box> = {};
        const clusters: { label: string; x: number; w: number }[] = [];
        order.forEach((gr, gi) => {
          const x = pad + gi * (nodeW + gap);
          const off = (H - heights[gi]) / 2;
          byGroup[gr].forEach((id, j) => {
            boxes[id] = { x, y: pad + head + off + j * (nodeH + gapCross), w: nodeW, h: nodeH };
          });
          clusters.push({ label: gr, x, w: nodeW });
        });
        return { boxes, clusters, w: g * nodeW + (g - 1) * gap + pad * 2, h: H + pad * 2 + head, horiz: true, fontLabel, fontSub: Math.max(12.5, fontLabel - 4), cluster: true as const };
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
      const horiz = horizPreferred && want.every((w, i) => w / widths[i] < 1.35) &&
        (total <= budget * 1.05 || perLayer === 1); // cadeia pura: mantém o eixo com pan, nunca verticaliza à força

      if (horiz) {
        const nodeH = NODE_H;
        const crossSpan = perLayer * nodeH + (perLayer - 1) * gapCross;
        const boxes: Record<string, Box> = {};
        layers.forEach((layer, d) => {
          const off = (crossSpan - (layer.length * nodeH + (layer.length - 1) * gapCross)) / 2;
          const x = pad + widths.slice(0, d).reduce((a, b) => a + b, 0) + d * gapAxis;
          layer.forEach((id, j) => {
            boxes[id] = { x, y: pad + off + j * (nodeH + gapCross), w: widths[d], h: nodeH };
          });
        });
        return { boxes, clusters: null, w: total + pad * 2, h: crossSpan + pad * 2, horiz: true, fontLabel, fontSub: Math.max(12.5, fontLabel - 4), cluster: false as const };
      }
      if (!horizPreferred && perLayer <= 3 && !small) {
        // TB pedido com poucas colunas: usa a largura pedida
        const nodeW = Math.round(Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, Math.max(...want))));
        const nodeH = NODE_H_TB;
        const crossSpan = perLayer * nodeW + (perLayer - 1) * gapCross;
        const boxes: Record<string, Box> = {};
        layers.forEach((layer, d) => {
          const off = (crossSpan - (layer.length * nodeW + (layer.length - 1) * gapCross)) / 2;
          layer.forEach((id, j) => {
            boxes[id] = { x: pad + off + j * (nodeW + gapCross), y: pad + d * (nodeH + 72), w: nodeW, h: nodeH };
          });
        });
        return { boxes, clusters: null, w: crossSpan + pad * 2, h: layerCount * nodeH + (layerCount - 1) * 72 + pad * 2, horiz: false, fontLabel, fontSub: Math.max(12.5, fontLabel - 4), cluster: false as const };
      }
      if (fontLabel > 16) continue; // tenta fonte menor antes de verticalizar
      // vertical: camadas empilham, largura uniforme generosa (preenche o container).
      // Em telas pequenas, 1 nó por fileira — nunca comprime lado a lado.
      const colsMax = small ? 1 : 3;
      const nodeWv = small
        ? Math.round(Math.max(232, Math.min(MAX_NODE_W, budget - 8)))
        : Math.round(Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, Math.max(...want, budget * 0.42))));
      const nodeHt = NODE_H_TB;
      const crossSpan = Math.min(perLayer, colsMax) * nodeWv + (Math.min(perLayer, colsMax) - 1) * gapCross;
      const boxes: Record<string, Box> = {};
      const rowsOf = (l: string[]) => Math.ceil(l.length / colsMax);
      let cursor = pad;
      layers.forEach((layer) => {
        // camadas largas quebram em fileiras para não estourar a largura
        layer.forEach((id, j) => {
          const row = Math.floor(j / colsMax), col = j % colsMax;
          const cols = Math.min(colsMax, layer.length - row * colsMax);
          const rowW = cols * nodeWv + (cols - 1) * gapCross;
          const ox = pad + (Math.max(crossSpan, rowW) - rowW) / 2;
          boxes[id] = { x: ox + col * (nodeWv + gapCross), y: cursor + row * (nodeHt + gapCross), w: nodeWv, h: nodeHt };
        });
        cursor += rowsOf(layer) * nodeHt + (rowsOf(layer) - 1) * gapCross + 72;
      });
      const h = cursor - 72 + pad;
      return { boxes, clusters: null, w: crossSpan + pad * 2, h, horiz: false, fontLabel, fontSub: Math.max(12.5, fontLabel - 4), cluster: false as const };
    }
    // fallback inalcançável na prática (o laço sempre retorna em 16)
    return { boxes: {}, clusters: null, w: avail, h: 300, horiz: true, fontLabel: 16, fontSub: 12.5, cluster: false as const };
  }, [nodes, edges, direction, distribution, avail]);

  // Altura do palco: acompanha a proporção do grafo (sem letterbox), com
  // limites confortáveis; em tela cheia, usa a viewport.
  const boxH = useMemo(() => {
    if (expanded) return Math.round(Math.max(420, Math.min(900, window.innerHeight * 0.78)));
    const aspect = geo.h / Math.max(1, geo.w);
    const natural = Math.round(avail * aspect);
    const minH = emphasis === "primary" ? 420 : 360;
    return Math.round(Math.max(minH, Math.min(640, natural || minH)));
  }, [geo, avail, emphasis, expanded]);

  // Fit inicial orientado à legibilidade: preenche o container (descontado o
  // padding do palco), mas nunca abaixo do piso — nesse caso nasce em escala
  // legível e o resto se explora por pan/scroll.
  const fitK = useMemo(() => {
    const cw = Math.max(240, avail - 48), ch = Math.max(200, boxH - 32);
    const fitW = cw / Math.max(1, geo.w), fitH = ch / Math.max(1, geo.h);
    const f = Math.min(fitW, fitH, FIT_TOP);
    if (f >= FIT_FLOOR) {
      // Altura como eixo limitante em escala marginal (ex.: pilha alta no
      // mobile) miniaturiza o texto: preenche a largura e o resto vai por
      // scroll vertical, que é o gesto natural desse eixo.
      if (fitH < fitW && fitH < 0.7 && fitW <= 1) return +fitW.toFixed(3);
      return +f.toFixed(3);
    }
    // Não cabe legível por inteiro: preenche a largura (explora por scroll)
    // ou, em grafos ultra-largos, nasce em escala legível com pan 2D.
    const k0 = Math.min(fitW, 1);
    return k0 >= FIT_FLOOR ? +k0.toFixed(3) : LEGIBLE_K;
  }, [avail, geo, boxH]);

  useEffect(() => { setK(fitK); setActive(null); }, [fitK]);
  // centraliza o overflow inicial (grafos maiores que o palco)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const t = requestAnimationFrame(() => {
      if (el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      if (el.scrollHeight > el.clientHeight) el.scrollTop = Math.min(el.scrollTop, 0);
    });
    return () => cancelAnimationFrame(t);
  }, [k, geo, boxH, expanded]);

  const zoomBy = (d: number, cx?: number, cy?: number) => {
    const el = scrollRef.current;
    const next = Math.min(2.5, Math.max(0.4, +(k + d).toFixed(2)));
    if (!el || next === k) { setK(next); return; }
    const r = next / k;
    const px = cx ?? el.clientWidth / 2, py = cy ?? el.clientHeight / 2;
    const l = (el.scrollLeft + px) * r - px, t = (el.scrollTop + py) * r - py;
    setK(next);
    requestAnimationFrame(() => { el.scrollLeft = l; el.scrollTop = t; });
  };
  const fitView = () => {
    setK(fitK);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; el.scrollTop = 0; }
    });
  };
  const resetView = () => { setK(1); setActive(null); };

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return; // scroll nativo faz o pan; zoom só com modificador
    e.preventDefault();
    const rect = scrollRef.current?.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 0.12 : -0.12, rect ? e.clientX - rect.left : undefined, rect ? e.clientY - rect.top : undefined);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".diagram-node")) return;
    const el = scrollRef.current;
    if (!el) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current, el = scrollRef.current;
    if (!d || !el) return;
    el.scrollLeft = d.l - (e.clientX - d.x);
    el.scrollTop = d.t - (e.clientY - d.y);
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
    return `diagnóstico · ${nodes.length} nós · ${edges.length} arestas · ${layers} · auto-fit ${(fit * 100).toFixed(0)}%`;
  }, [nodes.length, edges.length, geo.cluster, fit]);

  const dimOf = (id: string) => (related && !related.has(id) ? 1 : 0);
  const edgeOn = (e: any) => !related || e.from === active || e.to === active;

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
      const x1 = a.x + a.w, x2 = b.x;
      if (x2 - x1 < 28) { // camadas adjacentes coladas ou refluxo: desvia por cima
        const top = Math.min(a.y, b.y) - 18;
        return `M${x1 - 6},${y1} C${x1 + 18},${y1} ${x1 + 18},${top} ${((x1 + x2) / 2).toFixed(1)},${top} S${x2 - 18},${y2} ${x2},${y2}`;
      }
      const mx = (x1 + x2) / 2 + lane * 0.4;
      return `M${x1},${y1.toFixed(1)} C${mx.toFixed(1)},${y1.toFixed(1)} ${mx.toFixed(1)},${y2.toFixed(1)} ${x2},${y2.toFixed(1)}`;
    }
    const x1 = a.x + a.w / 2 + ports.portOf(ports.outBy[e.from], e, a.w);
    const x2 = b.x + b.w / 2 + ports.portOf(ports.inBy[e.to], e, b.w) + lane * 0.5;
    const y1 = a.y + a.h, y2 = b.y;
    if (y2 - y1 < 24) {
      const side = Math.max(a.x + a.w, b.x + b.w) + 20;
      return `M${x1},${y1} H${side.toFixed(1)} V${y2} H${x2.toFixed(1)}`;
    }
    const my = (y1 + y2) / 2; // ortogonal com cantos arredondados
    const r = 10;
    const dx1 = x2 > x1 ? 1 : -1;
    return `M${x1.toFixed(1)},${y1} V${(my - r).toFixed(1)} Q${x1.toFixed(1)},${my.toFixed(1)} ${(x1 + dx1 * r).toFixed(1)},${my.toFixed(1)} H${(x2 - dx1 * r).toFixed(1)} Q${x2.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${(my + r).toFixed(1)} V${y2}`;
  };

  const hasEdges = edges.some((e: any) => e.label);
  // posições dos rótulos de aresta com descolisão (nós = obstáculos fixos)
  const edgeTags = useMemo(() => {
    const items = edges
      .map((e: any, i: number) => {
        const a = geo.boxes[e.from], b = geo.boxes[e.to];
        if (!a || !b || !e.label) return null;
        const full = String(e.label);
        const cut = full.slice(0, 32);
        const label = full.length > 32 ? (cut.includes(" ") ? `${cut.replace(/\s+\S*$/, "")}…` : `${cut}…`) : full;
        const w = label.length * 7.2 + 20;
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
        return { i, label, x, y, w, h: 24 };
      })
      .filter(Boolean) as { i: number; label: string; x: number; y: number; w: number; h: number }[];
    const obstacles: Tag[] = nodes
      .map((n: any) => geo.boxes[n.id])
      .filter(Boolean)
      .map((p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2, w: p.w + 28, h: p.h + 18, fixed: true }));
    // cabeçalhos dos clusters também desviam rótulos
    (geo.clusters || []).forEach((c) => {
      obstacles.push({ x: c.x + c.w / 2, y: 30, w: c.w * 0.7, h: 24, fixed: true });
    });
    const solved = declutter([...obstacles, ...items.map((t) => ({ ...t }))]);
    const byIndex = new Map(items.map((t, kk) => [t.i, solved[obstacles.length + kk]]));
    return byIndex;
  }, [edges, geo, nodes, paths]);

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

  const renderW = Math.round(geo.w * k), renderH = Math.round(geo.h * k);

  return (
    <>
      {expanded && <div className="diagram-scrim" onClick={() => setExpanded(false)} aria-hidden="true" />}
      <div
        className={`soft-card diagram-frame${expanded ? " expanded" : ""}`}
        ref={hostRef}
        onKeyDown={(e) => { if (e.key === "Escape") { setExpanded(false); setActive(null); } }}
      >
        <div className="diagram-bar" role="toolbar" aria-label="Controles do diagrama">
          <button className="btn diagram-tool" onClick={() => zoomBy(0.15)} aria-label="Ampliar diagrama">+</button>
          <button className="btn diagram-tool" onClick={() => zoomBy(-0.15)} aria-label="Reduzir diagrama">−</button>
          <button className="btn diagram-tool" onClick={fitView}>Ajustar</button>
          <button className="btn diagram-tool" onClick={resetView}>Repor</button>
          <span className="diagram-zoom" aria-live="polite">{Math.round(k * 100)}%</span>
          <span className="diagram-hint">Arraste para explorar · selecione um nó para ver as conexões</span>
          <button className="btn diagram-tool" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-label={expanded ? "Fechar tela cheia" : "Abrir diagrama em tela cheia"}>
            {expanded ? "✕ Fechar" : "⤢ Expandir"}
          </button>
        </div>
        <div
          ref={scrollRef}
          className="diagram-canvas diagram-scroll"
          style={{ height: boxH }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <svg
            width={renderW}
            height={renderH}
            viewBox={`0 0 ${geo.w} ${geo.h}`}
            style={{ minWidth: renderW, margin: "auto", flex: "none" }}
            role="group"
            aria-label={`Diagrama interativo${active ? `, ${labelOf(byId(nodes)[active] ?? {})} selecionado` : ""}. Use Tab para navegar entre os nós, Enter para selecionar e setas para mover a seleção.`}
            className="diagram-svg"
          >
            <defs>
              <marker id="dx-a" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M0.8,0.8 L9,5 L0.8,9.2 Z" fill="#75aaff" />
              </marker>
              <marker id="dx-b" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M0.8,0.8 L9,5 L0.8,9.2 Z" fill="#a77cfa" />
              </marker>
              <marker id="dx-hl" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M0.8,0.8 L9,5 L0.8,9.2 Z" fill={HL} />
              </marker>
            </defs>

            {geo.clusters?.map((c) => (
              <g key={c.label} aria-hidden="true">
                <rect x={c.x - 14} y={6} width={c.w + 28} height={geo.h - 12} rx={22} fill="rgba(117,170,255,0.05)" stroke="rgba(119,141,202,0.3)" strokeDasharray="5 6" />
                <text x={c.x + c.w / 2} y={32} fontSize={13} fontWeight={700} letterSpacing={1.5} fill="#8e9cbd" textAnchor="middle" style={{ textTransform: "uppercase" }}>{c.label}</text>
              </g>
            ))}

            {edges.map((e: any, i: number) => {
              const d = edgePath(e);
              if (!d) return null;
              const on = edgeOn(e);
              const hl = !!active && on;
              const violet = i % 2 === 1;
              const stroke = hl ? HL : violet ? "#a77cfa" : "#75aaff";
              return (
                <g key={`e${i}`}>
                  {hl && <path d={d} fill="none" stroke={HL} strokeOpacity={0.22} strokeWidth={8} strokeLinecap="round" />}
                  <path
                    d={d}
                    fill="none"
                    stroke={stroke}
                    strokeOpacity={on ? 0.95 : 0.5}
                    strokeWidth={hl ? 3 : 2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    data-dim={on ? 0 : 1}
                    markerEnd={`url(#${hl ? "dx-hl" : violet ? "dx-b" : "dx-a"})`}
                  />
                </g>
              );
            })}

            {nodes.map((n: any, i: number) => {
              const p = geo.boxes[n.id];
              if (!p) return null;
              const c = KIND_COLOR[n.kind] || (i % 2 ? "#a77cfa" : "#75aaff");
              const sel = active === n.id;
              const maxChars = Math.max(10, Math.floor((p.w - 78) / (geo.fontLabel * 0.55)));
              const raw = labelOf(n);
              const lines = wrapLabel(raw, maxChars).slice(0, 2);
              const sub = [n.kind, n.group].filter(Boolean).join(" · ");
              const subF = geo.fontSub;
              const lineH = geo.fontLabel + 5;
              const blockH = lines.length * lineH + (sub ? 9 + subF + 2 : 0);
              const startY = p.y + p.h / 2 - blockH / 2 + geo.fontLabel * 0.78;
              const hero = n.importance === "primary";
              return (
                <g
                  key={n.id}
                  className="diagram-node"
                  tabIndex={0}
                  role="button"
                  aria-pressed={sel}
                  aria-label={`${raw}${sub ? `, ${sub}` : ""}. Pressione Enter para ${sel ? "desselecionar" : "destacar as conexões"}.`}
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
                  {sub && <text x={p.x + 54} y={startY + lines.length * lineH + 2} fontSize={subF} fill="#a5b2d0">{sub.length > maxChars + 6 ? `${sub.slice(0, maxChars + 5)}…` : sub}</text>}
                  {n.detail && <title>{n.detail}</title>}
                </g>
              );
            })}

            {edges.map((e: any, i: number) => {
              const t = edgeTags.get(i);
              if (!t) return null;
              const on = edgeOn(e);
              return (
                <g key={`l${i}`} data-dim={on ? 0 : 1}>
                  <rect x={t.x - t.w / 2} y={t.y - 19} width={t.w} height={25} rx={10} fill={active && on ? "#2a1f08" : "#0b1224"} fillOpacity={0.94} stroke={active && on ? "rgba(245,158,11,0.5)" : "rgba(119,141,202,0.28)"} />
                  <text x={t.x} y={t.y - 1.5} fontSize={13.5} fill={active && on ? "#ffd184" : "#c2cfe8"} textAnchor="middle">{t.label}</text>
                </g>
              );
            })}
          </svg>

          {activeNode && (
            <div className="diagram-tip" role="status" aria-live="polite">
              <div className="diagram-tip-head">
                <strong>{labelOf(activeNode)}</strong>
                <button className="btn diagram-tool" onClick={() => setActive(null)} aria-label="Limpar seleção">✕</button>
              </div>
              {[activeNode.kind, activeNode.group].filter(Boolean).length > 0 && (
                <div className="diagram-tip-sub">{[activeNode.kind, activeNode.group].filter(Boolean).join(" · ")}</div>
              )}
              {activeNode.detail && <p>{activeNode.detail}</p>}
              {activeNeighbors.length > 0 && (
                <ul>
                  {activeNeighbors.map((r: any, j: number) => (
                    <li key={j}>
                      <button className="diagram-link" onClick={() => setActive(r.node.id)}>
                        {r.dir} {labelOf(r.node)}{r.via ? ` — ${r.via}` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
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
