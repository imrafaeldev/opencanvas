import React, { useLayoutEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Diagram Renderer — auto-layout declarativo, sem coordenadas do LLM.
//
// Modos de distribuição (`distribution`):
//   "layered" (padrão) — camadas por profundidade (BFS), eixo LR/TB adaptativo.
//   "cluster"          — agrupa por `nodes[].group` em colunas rotuladas.
//
// Dimensionamento content-aware: a largura de cada camada deriva do rótulo
// mais longo da camada (nunca do mesmo valor fixo para todas), a tipografia é
// escolhida para caber sem encolher, e o auto-fit só reduz até um piso de
// legibilidade — abaixo disso, o diagrama rola internamente ou expande em
// tela cheia em vez de virar miniatura.
//
// Interações (locais, sem IA): selecionar nó (clique/toque/Enter) destaca as
// conexões e esmaece o resto; expandir abre o diagrama em tela cheia.
// ---------------------------------------------------------------------------

const MIN_NODE_W = 190;
const MAX_NODE_W = 330;
const NODE_H = 100;
const NODE_H_TB = 82;
/** Largura mínima em que o rótulo ainda cabe com a fonte pretendida. */
const MIN_LEGIBLE_NODE_W = 185;

export interface DiagramProps {
  nodes?: any[];
  edges?: any[];
  direction?: "LR" | "TB" | "RL" | "BT";
  variant?: string;
  emphasis?: string;
  distribution?: "layered" | "cluster";
}

const KIND_COLOR: Record<string, string> = {
  service: "#75aaff", api: "#75aaff", client: "#3bdbb8", browser: "#3bdbb8",
  datastore: "#ffcc76", db: "#ffcc76", queue: "#ffcc76", broker: "#a77cfa",
  event: "#a77cfa", cache: "#3bdbb8", user: "#3bdbb8",
};
const HL = "#F59E0B"; // cor de destaque do caminho selecionado

interface Box { x: number; y: number; w: number; h: number; }

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
  return layers;
}

const byId = (nodes: any[]) => Object.fromEntries(nodes.map((n: any) => [n.id, n]));
const labelOf = (n: any) => String(n.label ?? n.id);

interface Tag { x: number; y: number; w: number; h: number; fixed?: boolean; }

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
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 8 && Math.abs(a.y - b.y) < 27) {
          const push = (27 - Math.abs(a.y - b.y)) / 2 + 2;
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

export function Diagram({ nodes = [], edges = [], direction = "LR", emphasis, distribution = "layered" }: DiagramProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState(1100);
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setAvail(Math.max(320, el.clientWidth || 1100));
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
    const pad = 20;
    const gapCross = 30;
    const budget = avail - pad * 2;
    const table = byId(nodes);

    // tipografia tentada do maior para o menor: a primeira que couber vence,
    // então o texto nasce legível em vez de nascer pequeno e escalar.
    for (const fontLabel of [19, 18, 17]) {
      const est = (id: string) => {
        const n = table[id];
        const w = labelOf(n).length * fontLabel * 0.56 + 46;
        return n?.importance === "primary" ? w * 1.15 : w;
      };

      if (distribution === "cluster") {
        const order: string[] = [];
        const byGroup: Record<string, string[]> = {};
        nodes.forEach((n: any) => {
          const g = n.group || table[n.id]?.kind || "geral";
          (byGroup[g] ||= []).push(n.id);
          if (!order.includes(g)) order.push(g);
        });
        const g = Math.max(1, order.length);
        const gap = 56;
        const nodeW = Math.round(Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, (budget - gap * (g - 1)) / g)));
        // exige que o rótulo mais longo de cada grupo caiba; senão tenta fonte menor
        const fits = order.every((gr) =>
          Math.max(...byGroup[gr].map(est)) <= nodeW + 4);
        if (!fits && fontLabel > 17) continue;
        const nodeH = NODE_H;
        const heights = order.map((gr) => byGroup[gr].length * nodeH + (byGroup[gr].length - 1) * gapCross);
        const H = Math.max(...heights);
        const boxes: Record<string, Box> = {};
        const clusters: { label: string; x: number; w: number }[] = [];
        order.forEach((gr, gi) => {
          const x = gi * (nodeW + gap);
          const off = (H - heights[gi]) / 2;
          byGroup[gr].forEach((id, j) => {
            boxes[id] = { x, y: off + j * (nodeH + gapCross), w: nodeW, h: nodeH };
          });
          clusters.push({ label: gr, x, w: nodeW });
        });
        return { boxes, clusters, w: g * nodeW + (g - 1) * gap + pad * 2, h: H + pad * 2 + (order.length > 1 ? 34 : 0), horiz: true, fontLabel, fontSub: fontLabel - 4, cluster: true as const };
      }

      // --- layered ---
      const horizPreferred = direction === "LR" || direction === "RL";
      const layers = layerize(nodes, edges);
      const layerCount = Math.max(1, layers.length);
      const perLayer = Math.max(1, ...layers.map((l) => l.length));

      // largura por camada a partir do conteúdo (rótulo mais longo)
      const want = layers.map((layer) => Math.max(...layer.map(est)));
      let gapAxis = 76;
      let widths = want.map((w) => Math.round(Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, w))));
      let total = widths.reduce((a, b) => a + b, 0) + gapAxis * (layerCount - 1);
      while (total > budget && gapAxis > 56) {
        gapAxis -= 8;
        total = widths.reduce((a, b) => a + b, 0) + gapAxis * (layerCount - 1);
      }
      const nodeW = Math.round((widths.reduce((a, b) => a + b, 0) / layerCount + widths[0]) / 2);
      const horiz = horizPreferred && want.every((w, i) => w / widths[i] < 1.35) && total <= budget * 1.08;

      if (horiz) {
        const nodeH = NODE_H;
        const crossSpan = perLayer * nodeH + (perLayer - 1) * gapCross;
        const boxes: Record<string, Box> = {};
        layers.forEach((layer, d) => {
          const off = (crossSpan - (layer.length * nodeH + (layer.length - 1) * gapCross)) / 2;
          const x = widths.slice(0, d).reduce((a, b) => a + b, 0) + d * gapAxis;
          layer.forEach((id, j) => {
            boxes[id] = { x, y: off + j * (nodeH + gapCross), w: widths[d], h: nodeH };
          });
        });
        return { boxes, clusters: null, w: total + pad * 2, h: crossSpan + pad * 2, horiz: true, fontLabel, fontSub: fontLabel - 4, cluster: false as const };
      }
      if (!horizPreferred && perLayer <= 3) {
        // TB pedido com poucas colunas: usa a largura pedida
        const nodeW = Math.round(Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, Math.max(...want))));
        const nodeH = NODE_H_TB;
        const crossSpan = perLayer * nodeW + (perLayer - 1) * gapCross;
        const boxes: Record<string, Box> = {};
        layers.forEach((layer, d) => {
          const off = (crossSpan - (layer.length * nodeW + (layer.length - 1) * gapCross)) / 2;
          layer.forEach((id, j) => {
            boxes[id] = { x: off + j * (nodeW + gapCross), y: d * (nodeH + 60), w: nodeW, h: nodeH };
          });
        });
        return { boxes, clusters: null, w: crossSpan + pad * 2, h: layerCount * nodeH + (layerCount - 1) * 60 + pad * 2, horiz: false, fontLabel, fontSub: fontLabel - 4, cluster: false as const };
      }
      if (fontLabel > 17) continue; // tenta fonte menor antes de verticalizar
      // vertical: camadas empilham, largura uniforme generosa
      const nodeWv = Math.round(Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, Math.max(...want, budget * 0.6))));
      const nodeHt = NODE_H_TB;
      const crossSpan = perLayer * nodeWv + (perLayer - 1) * gapCross;
      const boxes: Record<string, Box> = {};
      layers.forEach((layer, d) => {
        const off = (crossSpan - (layer.length * nodeWv + (layer.length - 1) * gapCross)) / 2;
        layer.forEach((id, j) => {
          boxes[id] = { x: off + j * (nodeWv + gapCross), y: d * (nodeHt + 60), w: nodeWv, h: nodeHt };
        });
      });
      return { boxes, clusters: null, w: crossSpan + pad * 2, h: layerCount * nodeHt + (layerCount - 1) * 60 + pad * 2, horiz: false, fontLabel, fontSub: fontLabel - 4, cluster: false as const };
    }
    // fallback inalcançável na prática (o laço sempre retorna em 17)
    return { boxes: {}, clusters: null, w: avail, h: 300, horiz: true, fontLabel: 17, fontSub: 13, cluster: false as const };
  }, [nodes, edges, direction, distribution, avail]);

  const hasEdges = edges.some((e: any) => e.label);
  // auto-fit com piso de legibilidade: abaixo de 0.72 de escala o diagrama
  // rola internamente em vez de encolher o texto até ficar ilegível.
  const fit = Math.min(1.18, avail / geo.w);
  const legible = fit >= 0.72;
  const renderW = legible ? undefined : Math.round(geo.w * 0.72);
  const naturalH = (legible ? avail : renderW!) / Math.max(0.2, geo.w / Math.max(1, geo.h));
  const boxH = Math.round(Math.max(emphasis === "primary" ? 340 : 280, Math.min(680, naturalH)));

  const dimOf = (id: string) => (related && !related.has(id) ? 1 : 0);
  const edgeOn = (e: any) => !related || e.from === active || e.to === active;

  // posições dos rótulos de aresta com descolisão (nós = obstáculos fixos)
  const edgeTags = useMemo(() => {
    const items = edges
      .map((e: any, i: number) => {
        const a = geo.boxes[e.from], b = geo.boxes[e.to];
        if (!a || !b || !e.label) return null;
        const label = String(e.label).slice(0, 28);
        const w = label.length * 7.4 + 18;
        let x: number, y: number;
        if (geo.horiz) {
          x = (a.x + a.w + b.x) / 2; y = (a.y + b.y) / 2 + a.h / 2 - 10;
        } else {
          x = (a.x + b.x) / 2 + (a.w + b.w) / 4;
          y = (a.y + a.h + b.y) / 2;
        }
        return { i, label, x, y, w, h: 24 };
      })
      .filter(Boolean) as { i: number; label: string; x: number; y: number; w: number; h: number }[];
    const obstacles: Tag[] = nodes
      .map((n: any) => geo.boxes[n.id])
      .filter(Boolean)
      .map((p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2, w: p.w + 10, h: p.h + 10, fixed: true }));
    const solved = declutter([...obstacles, ...items.map((t) => ({ ...t }))]);
    const byIndex = new Map(items.map((t, k) => [t.i, solved[obstacles.length + k]]));
    return byIndex;
  }, [edges, geo, nodes]);

  return (
    <>
      {expanded && <div className="diagram-scrim" onClick={() => setExpanded(false)} aria-hidden="true" />}
      <div
        className={`soft-card diagram-frame${expanded ? " expanded" : ""}`}
        ref={hostRef}
        onKeyDown={(e) => { if (e.key === "Escape") { setExpanded(false); setActive(null); } }}
      >
        <div className="diagram-bar">
          <button className="btn diagram-tool" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} aria-label="Ampliar diagrama">+</button>
          <button className="btn diagram-tool" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} aria-label="Reduzir diagrama">−</button>
          <button className="btn diagram-tool" onClick={() => { setZoom(1); setActive(null); }}>Repor</button>
          <span className="diagram-hint">Selecione um nó para ver as conexões</span>
          <button className="btn diagram-tool" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-label={expanded ? "Fechar tela cheia" : "Abrir diagrama em tela cheia"}>
            {expanded ? "✕ Fechar" : "⤢ Expandir"}
          </button>
        </div>
        <div className="diagram-canvas" style={{ minHeight: boxH, overflowX: legible ? undefined : "auto" }}>
          <svg
            viewBox={`-8 -8 ${(geo.w * zoom).toFixed(0)} ${(geo.h * zoom).toFixed(0)}`}
            width={renderW ?? "100%"}
            height={boxH}
            style={renderW ? { minWidth: renderW, margin: "0 auto" } : undefined}
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label={`Diagrama interativo${active ? `, ${labelOf(byId(nodes)[active] ?? {})} selecionado` : ""}. Use Tab para navegar entre os nós e Enter para selecionar.`}
            className="diagram-svg"
          >
            <defs>
              <marker id="dx-a" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                <path d="M0.5,0.5 L8,4.5 L0.5,8.5" fill="none" stroke="#75aaff" strokeWidth="1.6" strokeLinecap="round" />
              </marker>
              <marker id="dx-b" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                <path d="M0.5,0.5 L8,4.5 L0.5,8.5" fill="none" stroke="#a77cfa" strokeWidth="1.6" strokeLinecap="round" />
              </marker>
              <marker id="dx-hl" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                <path d="M0.5,0.5 L8,4.5 L0.5,8.5" fill="none" stroke={HL} strokeWidth={2} strokeLinecap="round" />
              </marker>
            </defs>

            {geo.clusters?.map((c) => (
              <g key={c.label} aria-hidden="true">
                <rect x={c.x - 12} y={8} width={c.w + 24} height={geo.h - 16} rx={20} fill="rgba(117,170,255,0.05)" stroke="rgba(119,141,202,0.3)" strokeDasharray="5 6" />
                <text x={c.x + c.w / 2} y={30} fontSize={13} fontWeight={700} letterSpacing={1.5} fill="#8e9cbd" textAnchor="middle" style={{ textTransform: "uppercase" }}>{c.label}</text>
              </g>
            ))}

            {edges.map((e: any, i: number) => {
              const a = geo.boxes[e.from], b = geo.boxes[e.to];
              if (!a || !b) return null;
              const on = edgeOn(e);
              const hl = !!active && on;
              const violet = i % 2 === 1;
              const stroke = hl ? HL : violet ? "#a77cfa" : "#75aaff";
              let x1: number, y1: number, x2: number, y2: number, c1x: number, c1y: number, c2x: number, c2y: number;
              if (geo.horiz) {
                x1 = a.x + a.w; y1 = a.y + a.h / 2; x2 = b.x; y2 = b.y + b.h / 2;
                const mx = (x1 + x2) / 2;
                c1x = mx; c1y = y1; c2x = mx; c2y = y2;
              } else {
                x1 = a.x + a.w / 2; y1 = a.y + a.h; x2 = b.x + b.w / 2; y2 = b.y;
                const my = (y1 + y2) / 2;
                c1x = x1; c1y = my; c2x = x2; c2y = my;
              }
              return (
                <path
                  key={`e${i}`}
                  d={`M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`}
                  fill="none"
                  stroke={stroke}
                  strokeOpacity={on ? 0.95 : 0.55}
                  strokeWidth={hl ? 3 : 2.2}
                  data-dim={on ? 0 : 1}
                  markerEnd={`url(#${hl ? "dx-hl" : violet ? "dx-b" : "dx-a"})`}
                />
              );
            })}

            {nodes.map((n: any, i: number) => {
              const p = geo.boxes[n.id];
              if (!p) return null;
              const c = KIND_COLOR[n.kind] || (i % 2 ? "#a77cfa" : "#75aaff");
              const sel = active === n.id;
              const maxChars = Math.max(8, Math.floor((p.w - 46) / (geo.fontLabel * 0.56)));
              const raw = labelOf(n);
              const label = raw.length > maxChars ? raw.slice(0, maxChars - 1) + "…" : raw;
              const sub = [n.kind, n.group].filter(Boolean).join(" · ");
              const t1y = sub ? p.y + p.h / 2 - 3 : p.y + p.h / 2 + 6;
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(n.id); }
                  }}
                >
                  {hero && (
                    <rect x={p.x - 5} y={p.y - 5} width={p.w + 10} height={p.h + 10} rx={20} fill="none" stroke={c} strokeOpacity={0.32} strokeWidth={7} />
                  )}
                  <rect
                    x={p.x} y={p.y} width={p.w} height={p.h} rx={16}
                    fill={sel ? "#1a2a4f" : "#12203d"}
                    stroke={sel ? HL : c}
                    strokeOpacity={sel ? 1 : hero ? 0.95 : 0.62}
                    strokeWidth={sel || hero ? 3 : 1.8}
                  />
                  <circle cx={p.x + 22} cy={p.y + p.h / 2} r={6} fill={sel ? HL : c} />
                  <text x={p.x + 38} y={t1y} fontSize={geo.fontLabel} fontWeight={680} fill="#f1f4fd">{label}</text>
                  {sub && <text x={p.x + 38} y={t1y + 21} fontSize={geo.fontSub} fill="#a5b2d0">{sub}</text>}
                  {n.detail && sel && <title>{n.detail}</title>}
                </g>
              );
            })}

            {hasEdges && edges.map((e: any, i: number) => {
              const t = edgeTags.get(i);
              if (!t) return null;
              const on = edgeOn(e);
              return (
                <g key={`l${i}`} data-dim={on ? 0 : 1}>
                  <rect x={t.x - t.w / 2} y={t.y - 18} width={t.w} height={24} rx={9} fill={active && on ? "#2a1f08" : "#0b1224"} fillOpacity={0.94} stroke={active && on ? "rgba(245,158,11,0.5)" : "rgba(119,141,202,0.28)"} />
                  <text x={t.x} y={t.y - 1} fontSize={14.5} fill={active && on ? "#ffd184" : "#c2cfe8"} textAnchor="middle">{t.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
        {/* visão alternativa acessível: a lista de adjacências é a fonte da verdade */}
        <details className="diagram-alt">
          <summary>Conexões do diagrama ({edges.length})</summary>
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