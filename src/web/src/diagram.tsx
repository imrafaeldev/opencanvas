import React, { useMemo, useState } from "react";

// Auto-layout em camadas (BFS por profundidade), sem coordenadas do LLM.
// Suporta LR (padrão) e TB. Renderiza SVG com arestas Bézier + zoom.
// Estética: nós premium navy com borda azul/violeta alternada (ref. exemplo.html).
export function Diagram({ nodes = [], edges = [], direction = "LR" }: any) {
  const [zoom, setZoom] = useState(1);
  const W = 210, H = 64, GX = 92, GY = 72;
  const layout = useMemo(() => {
    const incoming: Record<string, number> = {};
    const adj: Record<string, string[]> = {};
    nodes.forEach((n: any) => { incoming[n.id] = 0; adj[n.id] = []; });
    edges.forEach((e: any) => { if (adj[e.from]) adj[e.from].push(e.to); if (incoming[e.to] !== undefined) incoming[e.to]++; });
    const depth: Record<string, number> = {};
    const q: string[] = nodes.filter((n: any) => (incoming[n.id] || 0) === 0).map((n: any) => n.id);
    if (!q.length && nodes.length) q.push(nodes[0].id);
    q.forEach(id => depth[id] = 0);
    const order = [...q];
    for (let i = 0; i < order.length; i++) {
      for (const nx of adj[order[i]] || []) {
        depth[nx] = Math.max(depth[nx] ?? 0, (depth[order[i]] ?? 0) + 1);
        if (!order.includes(nx)) order.push(nx);
      }
    }
    const layers: Record<number, string[]> = {};
    order.forEach(id => { const d = depth[id] ?? 0; (layers[d] ||= []).push(id); });
    const pos: Record<string, { x: number; y: number }> = {};
    const horiz = direction === "LR" || direction === "RL";
    Object.entries(layers).forEach(([d, ids]) => {
      ids.forEach((id, j) => {
        pos[id] = horiz ? { x: Number(d) * (W + GX), y: j * (H + GY) } : { x: j * (W + GX), y: Number(d) * (H + GY) };
      });
    });
    const maxX = Math.max(0, ...Object.values(pos).map(p => p.x)) + W + 40;
    const maxY = Math.max(0, ...Object.values(pos).map(p => p.y)) + H + 40;
    return { pos, maxX, maxY, horiz };
  }, [JSON.stringify(nodes), JSON.stringify(edges), direction]);

  const kindColor: Record<string, string> = { service: "#75aaff", client: "#3bdbb8", datastore: "#ffcc76", broker: "#a77cfa", queue: "#a77cfa", db: "#ffcc76", api: "#75aaff" };
  const horiz = layout.horiz;
  return (
    <div className="soft-card" style={{ overflow: "hidden" }}>
      <div className="diagram-bar" style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border-soft)", alignItems: "center" }}>
        <button className="btn" onClick={() => setZoom(z => Math.min(2.5, +(z + 0.15).toFixed(2)))} aria-label="Ampliar">+</button>
        <button className="btn" onClick={() => setZoom(z => Math.max(0.4, +(z - 0.15).toFixed(2)))} aria-label="Reduzir">−</button>
        <button className="btn" onClick={() => setZoom(1)}>Reset</button>
        <span className="meta" style={{ margin: 0 }}>{nodes.length} nós · {edges.length} arestas · auto-layout</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`-20 -20 ${layout.maxX / zoom} ${layout.maxY / zoom}`}
          width="100%"
          height={Math.min(560, Math.max(260, layout.maxY * zoom))}
          role="img"
          aria-label={`Diagrama com ${nodes.length} nós`}
          style={{ minWidth: 620 }}
          onWheel={(e) => setZoom(z => Math.max(0.4, Math.min(2.5, +(z - Math.sign(e.deltaY) * 0.08).toFixed(2))))}
        >
          <defs>
            <marker id="arrB" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#75aaff" strokeWidth={1.4} /></marker>
            <marker id="arrV" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#a77cfa" strokeWidth={1.4} /></marker>
          </defs>
          {edges.map((e: any, i: number) => {
            const a = layout.pos[e.from], b = layout.pos[e.to];
            if (!a || !b) return null;
            const violet = i % 2 === 1;
            if (horiz) {
              const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
              const mx = (x1 + x2) / 2;
              return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={violet ? "#a77cfa" : "#75aaff"} strokeWidth={2} markerEnd={`url(#${violet ? "arrV" : "arrB"})`} />;
            }
            const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y;
            const my = (y1 + y2) / 2;
            return <path key={i} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} fill="none" stroke={violet ? "#a77cfa" : "#75aaff"} strokeWidth={2} markerEnd={`url(#${violet ? "arrV" : "arrB"})`} />;
          })}
          {nodes.map((n: any, i: number) => {
            const p = layout.pos[n.id]; if (!p) return null;
            const c = kindColor[n.kind] || (i % 2 ? "#a77cfa" : "#75aaff");
            const label = String(n.label ?? n.id).slice(0, 26);
            return (
              <g key={n.id}>
                <rect x={p.x} y={p.y} width={W} height={H} rx={14} fill="#12203d" stroke={c} strokeOpacity={0.65} strokeWidth={1.5} />
                <circle cx={p.x + 18} cy={p.y + H / 2} r={5} fill={c} />
                <text x={p.x + 32} y={p.y + 28} fontSize={13} fontWeight={700} fill="#f1f4fd">{label}</text>
                {n.kind && <text x={p.x + 32} y={p.y + 46} fontSize={11} fill="#a5b2d0">{n.kind}{n.group ? ` · ${n.group}` : ""}</text>}
              </g>
            );
          })}
          {edges.map((e: any, i: number) => {
            const a = layout.pos[e.from], b = layout.pos[e.to];
            if (!a || !b || !e.label) return null;
            if (horiz) {
              const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
              return <text key={`l${i}`} x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} fontSize={11} fill="#a5b2d0" textAnchor="middle" style={{ paintOrder: "stroke", stroke: "#0e1629", strokeWidth: 4 }}>{e.label}</text>;
            }
            const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y;
            return <text key={`l${i}`} x={(x1 + x2) / 2 + 8} y={(y1 + y2) / 2} fontSize={11} fill="#a5b2d0" textAnchor="start" style={{ paintOrder: "stroke", stroke: "#0e1629", strokeWidth: 4 }}>{e.label}</text>;
          })}
        </svg>
      </div>
    </div>
  );
}

export function Chart({ series, kind }: any) {
  const s: number[] = Array.isArray(series) ? series.map(Number) : [];
  if (!s.length) return <div className="empty">Sem dados</div>;
  const max = Math.max(...s, 1);
  if (kind === "line") {
    const pts = s.map((v, i) => `${(i / Math.max(1, s.length - 1)) * 560 + 20},${150 - (v / max) * 120}`).join(" ");
    return <svg viewBox="0 0 600 170" width="100%" height={170}><polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2.5} /><circle cx={20} cy={150 - (s[0] / max) * 120} r={4} fill="var(--accent)" /></svg>;
  }
  return (
    <svg viewBox="0 0 600 170" width="100%" height={170} role="img">
      {s.map((v, i) => {
        const w = 560 / s.length;
        const h = (v / max) * 130;
        return <g key={i}><rect x={20 + i * w + 4} y={150 - h} width={Math.max(6, w - 8)} height={h} rx={5} fill="var(--accent2)" opacity={0.85} /><text x={20 + i * w + w / 2} y={165} fontSize={10} fill="var(--muted)" textAnchor="middle">{i + 1}</text></g>;
      })}
    </svg>
  );
}
