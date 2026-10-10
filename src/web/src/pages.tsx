import React, { useEffect, useState } from "react";
import { api } from "./api";
import { Layout } from "./layouts";
import { IconSprite } from "./components";

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("oc-theme") || "graphite");
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("oc-theme", theme); }, [theme]);
  return { theme, toggle: () => setTheme(t => t === "graphite" ? "paper" : "graphite") };
}
export function Shell({ children }: any) {
  const { theme, toggle } = useTheme();
  return (
    <>
      <IconSprite />
      <div className="topbar"><div className="in">
        <a href="/" className="logo" style={{ textDecoration: "none", color: "var(--text)" }}>Open<span>Canvas</span></a>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={toggle} aria-label="Alternar tema">{theme === "graphite" ? "☾ dark" : "☀ light"}</button>
      </div></div>
      <div className="wrap">{children}</div>
    </>
  );
}
export function Home() {
  const [projects, setProjects] = useState<any[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => { api<any[]>("/api/projects").then(setProjects).catch(() => setProjects([])); }, []);
  const filtered = projects.filter(p => !q || JSON.stringify(p).toLowerCase().includes(q.toLowerCase()));
  useTheme();
  return (
    <>
      <IconSprite />
      <div className="wrap">
        <div className="hero">
          <span className="badge">Runtime visual multiagente · local-first</span>
          <h1>Canvases de todos os seus projetos e agentes.</h1>
          <p>Crie pelo OpenCode, continue pelo Codex. Um único runtime global, storage compartilhado, DSL versionada.</p>
          <input className="search" placeholder="Buscar projetos ou canvases…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar" />
          {!filtered.length && <div className="empty" style={{ marginTop: 24 }}>Nenhum projeto ainda. Use <code>/canvas</code> no OpenCode ou o MCP em outro agente.</div>}
          <div className="grid2">{filtered.map((p: any) => <a key={p.projectId} href={`/p/${p.projectId}`} style={{ textDecoration: "none", color: "inherit" }}><div className="card"><h3>{p.name}</h3><p className="meta">{p.projectId}</p><div className="meta"><span className="badge">{p.lastSeenVia || "agent"}</span><span>{p.root}</span></div></div></a>)}</div>
        </div>
      </div>
    </>
  );
}
export function Project({ id }: { id: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const load = () => api<any[]>(`/api/projects/${id}/canvases`).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); const es = new EventSource("/api/events"); es.onmessage = load; return () => es.close(); }, [id]);
  const f = items.filter(c => !q || (c.title + c.slug).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <IconSprite />
      <div className="wrap">
        <a href="/">← todos os projetos</a>
        <h1 style={{ letterSpacing: "-0.03em" }}>{id}</h1>
        <input className="search" placeholder="Buscar canvas…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar canvas" />
        {!f.length && <div className="empty" style={{ marginTop: 24 }}>Nenhum canvas neste projeto.</div>}
        <div className="grid2">{f.map((c: any) => <a key={c.canvasId} href={`/p/${id}/canvas/${c.slug}`} style={{ textDecoration: "none", color: "inherit" }}><div className="card"><h3>{c.title}</h3><div className="meta"><span className="badge">rev {c.revision}</span><span>{c.slug}</span><span>{new Date(c.updatedAt).toLocaleString()}</span></div></div></a>)}</div>
      </div>
    </>
  );
}
// Visualização individual: artefato content-first, sem shell de dashboard.
export function CanvasPage({ projectId, slug }: { projectId: string; slug: string }) {
  const [doc, setDoc] = useState<any>(null);
  const [err, setErr] = useState("");
  const { theme, toggle } = useTheme();
  const load = () => api<any>(`/api/projects/${projectId}/canvases/${slug}`).then(d => { setDoc(d); setErr(""); document.title = `${d.title} — OpenCanvas`; }).catch(() => setErr("Canvas não encontrado ou runtime indisponível."));
  useEffect(() => { load(); const es = new EventSource("/api/events"); es.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.projectId === projectId) load(); } catch { load(); } }; return () => es.close(); }, [projectId, slug]);
  useEffect(() => { if (doc?.dsl?.theme) { document.documentElement.dataset.theme = doc.dsl.theme; } }, [doc?.dsl?.theme]);
  if (err) return (<><IconSprite /><div className="wrap"><div className="empty"><h2>Canvas inexistente</h2><p>{err}</p><p><a href={`/p/${projectId}`}>← voltar ao projeto</a></p></div></div></>);
  if (!doc) return (<><IconSprite /><div className="wrap"><div className="empty">Carregando…</div></div></>);
  return (
    <div className="artifact">
      <IconSprite />
      <nav className="artifact-nav" aria-label="Navegação do canvas">
        <div className="in">
          <a className="back" href={`/p/${projectId}`}>← {projectId}</a>
          <span className="crumb"><span className="badge">rev {doc.revision}</span><span>via {doc.updatedByAgent || "agent"}</span></span>
          <button className="btn" onClick={toggle} aria-label="Alternar tema">{theme === "graphite" ? "☾" : "☀"}</button>
        </div>
      </nav>
      <Layout dsl={doc.dsl} />
    </div>
  );
}
