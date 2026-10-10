import React, { useState } from "react";
import { md, esc } from "./api";
import { Diagram, Chart } from "./diagram";

export function IconSprite() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="sr-only" aria-hidden="true">
      <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></symbol>
      <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10Z" /><path d="m8.5 12 2.4 2.4 4.8-5" /></symbol>
      <symbol id="i-db" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" /></symbol>
      <symbol id="i-lock" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="12" rx="2" /><path d="M7 10V7a5 5 0 0 1 10 0v3" /></symbol>
      <symbol id="i-flow" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="6" rx="1" /><rect x="2" y="16" width="6" height="6" rx="1" /><rect x="16" y="16" width="6" height="6" rx="1" /><path d="M12 8v5H5v3m7-3h7v3" /></symbol>
      <symbol id="i-code" viewBox="0 0 24 24"><path d="m8 5-6 7 6 7M16 5l6 7-6 7m-3.5-16-3 22" /></symbol>
      <symbol id="i-book" viewBox="0 0 24 24"><path d="M12 7C9 4 5 4 2 5v15c3-1 7-1 10 2 3-3 7-3 10-2V5c-3-1-7-1-10 2Zm0 0v15" /></symbol>
      <symbol id="i-form" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 8h18M7 12h5M7 16h9" /></symbol>
      <symbol id="i-server" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="8" rx="2" /><rect x="3" y="13" width="18" height="8" rx="2" /><path d="M7 7h.01M7 17h.01m4-10h6m-6 10h6" /></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="m7 12 3.5 3.5L17.5 9" /></symbol>
      <symbol id="i-gear" viewBox="0 0 24 24"><path d="m10 2-.6 2.2-2 .9-2.1-1.1-2.5 4.3 1.7 1.6v2.2L2.8 14l2.5 4.3 2.1-1.1 2 .9L10 20.3h4l.6-2.2 2-.9 2.1 1.1 2.5-4.3-1.7-1.6v-2.2l1.7-1.6-2.5-4.3-2.1 1.1-2-.9L14 2h-4Z" /><circle cx="12" cy="11.2" r="3.2" /></symbol>
      <symbol id="i-stack" viewBox="0 0 24 24"><path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5" /></symbol>
      <symbol id="i-key" viewBox="0 0 24 24"><circle cx="16" cy="8" r="5" /><path d="m12 12-9 9 1-4 4-1 1-4" /></symbol>
      <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M20 7V3l-3.3 3.3A9 9 0 0 0 3 10m1 7v4l3.3-3.3A9 9 0 0 0 21 14" /></symbol>
      <symbol id="i-alert" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 6v7m0 4h.01" /></symbol>
      <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></symbol>
      <symbol id="i-ban" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="m4.8 4.8 14.4 14.4" /></symbol>
      <symbol id="i-bars" viewBox="0 0 24 24"><path d="M4 21V12m8 9V3m8 18v-7" /></symbol>
      <symbol id="i-light" viewBox="0 0 24 24"><path d="M9 18h6m-5 3h4m-5-5c0-2-4-3.5-4-8a7 7 0 0 1 14 0c0 4.5-4 6-4 8H9Z" /></symbol>
    </svg>
  );
}

export function Icon({ name, cls = "icon" }: { name?: string; cls?: string }) {
  const id = name && /^[a-z-]+$/.test(name) ? `i-${name}` : "i-flow";
  return (
    <svg className={cls} aria-hidden="true"><use href={`#${id}`} /></svg>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return <button className="btn" onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1200); }}>{ok ? "Copiado" : "Copiar"}</button>;
}

export function CodeView({ code, language }: { code: string; language?: string }) {
  // highlight mínimo: chaves JSON (sem lib externa)
  const pretty = (() => {
    try {
      const obj = JSON.parse(code);
      return JSON.stringify(obj, null, 2);
    } catch { return code; }
  })();
  return (
    <pre className="px-code"><code>{pretty}</code></pre>
  );
}

/* ---------- blocos editoriais ---------- */

function HubNode({ n, violet }: { n: any; violet?: boolean }) {
  return (
    <div className={`hub-node ${violet ? "violet" : ""}`}>
      <span className={`round-icon ${violet ? "violet" : ""}`} style={{ width: 64, height: 64 }}><Icon name={n.icon || "server"} cls="icon icon--lg" /></span>
      <b>{n.label || n.title}</b>
      {n.detail && <small>{n.detail}</small>}
    </div>
  );
}

function StepCards({ b }: { b: any }) {
  const items: any[] = b.items || b.children || [];
  const tone = b.variant === "flow" ? "flow-cards" : "cover-steps";
  const cardCls = b.variant === "flow" ? "flow-card" : "cover-step";
  return (
    <div className={tone}>
      {items.map((it: any, i: number) => (
        <article key={it.id || i} className={`soft-card reveal ${cardCls} ${i % 2 ? "violet" : ""}`}>
          {b.variant !== "flow" && <span className="step-number">{i + 1}</span>}
          <span className={`round-icon ${i % 2 ? "violet" : ""}`}><Icon name={it.icon} cls="icon icon--lg" /></span>
          <h2>{it.title}</h2>
          <p>{it.text}</p>
          {it.pill && (it.pillTone === "ok"
            ? <span className="ok-pill">{it.pill}</span>
            : <span className="code-pill">{it.pillMethod ? <em>{it.pillMethod}</em> : null}{it.pill}</span>)}
        </article>
      ))}
    </div>
  );
}

function Features({ b }: { b: any }) {
  const items: any[] = b.items || [];
  return (
    <div className={b.bare ? "feature-row" : "cover-bottom"}>
      {!b.bare && b.title && (<><hr className="faint-line" /><h2>{b.title}</h2></>)}
      <div className="feature-row">
        {items.map((f: any, i: number) => (
          <div key={f.id || i} className="feature">
            <span className={`small-icon ${i % 2 ? "violet" : ""}`}><Icon name={f.icon} /></span>
            <div><b>{f.title}</b><p>{f.text}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Split({ b }: { b: any }) {
  // b: { nodes, edgeLabels, panels: [{icon,title,points[]}], outcome: {title,text} }
  const nodes: any[] = b.nodes || b.diagram?.nodes || [];
  const panels: any[] = b.panels || b.items || [];
  const hub = nodes.length === 3;
  return (
    <div>
      <div className="split-main">
        <div className="soft-card diagram-stage premium-diagram" role="img" aria-label={b.alt || "Diagrama"}>
          {hub ? (
            <div className="hub">
              <div className="hub-top">
                <HubNode n={nodes[0]} violet={false} />
              </div>
              <svg className="hub-wires" viewBox="0 0 600 110" preserveAspectRatio="none" aria-hidden="true">
                <path d="M300 6 V60 H170 V104" fill="none" stroke="#6d9eff" strokeWidth="2" />
                <path d="M300 6 V60 H430 V104" fill="none" stroke="#aa80ff" strokeWidth="2" />
              </svg>
              <div className="hub-labels" aria-hidden="true">
                <span>{nodes[1]?.edgeLabel || b.edgeLabels?.[0] || ""}</span>
                <span>{nodes[2]?.edgeLabel || b.edgeLabels?.[1] || ""}</span>
              </div>
              <div className="hub-bottom">
                <HubNode n={nodes[1]} violet={false} />
                <HubNode n={nodes[2]} violet />
              </div>
            </div>
          ) : (
            <div className="px-nodes">
              {nodes.map((n: any, i: number) => (
                <React.Fragment key={n.id || i}>
                  <div className={`px-node ${i % 2 ? "violet" : ""}`}>
                    <span className={`small-icon ${i % 2 ? "violet" : ""}`}><Icon name={n.icon || "server"} /></span>
                    <div><b>{n.label || n.title}</b>{n.detail && <small>{n.detail}</small>}</div>
                  </div>
                  {i < nodes.length - 1 && <div className="px-edge" aria-hidden="true">↓ {n.edgeLabel || b.edgeLabels?.[i] || ""}</div>}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
        <aside className="split-aside">
          {panels.map((p: any, i: number) => (
            <article key={p.id || i} className={`soft-card info-card ${i % 2 === 0 ? "violet" : ""}`}>
              <div className="info-heading">
                <span className={`small-icon ${i % 2 === 0 ? "violet" : ""}`}><Icon name={p.icon} /></span>
                <h2>{p.title}</h2>
              </div>
              <ol className="number-list">
                {(p.points || p.items || []).map((pt: any, j: number) => (
                  <li key={j}><span>{j + 1}</span>{typeof pt === "string" ? pt : pt.text || pt.label}</li>
                ))}
              </ol>
            </article>
          ))}
        </aside>
      </div>
      {b.outcome && (
        <div className="outcome">
          <span className="small-icon teal"><Icon name={b.outcome.icon || "check"} /></span>
          <b>{b.outcome.title}</b>
          <p>{b.outcome.text}</p>
        </div>
      )}
    </div>
  );
}

function Compare({ b }: { b: any }) {
  const [left, right] = b.items || b.columns || [];
  const payload = b.payload;
  const card = (c: any, violet: boolean) => (
    <article className={`soft-card token-card ${violet ? "violet" : ""}`}>
      <div className="token-header">
        <span className={`round-icon ${violet ? "violet" : ""}`}><Icon name={c?.icon} cls="icon icon--lg" /></span>
        <div><h2>{c?.title}</h2><p>{c?.text}</p></div>
      </div>
      <div className="token-rows">
        {(c?.rows || []).map((r: any, i: number) => (
          <div className="token-row" key={i}><span>{r.label || r[0]}</span><p>{r.text || r[1]}</p></div>
        ))}
      </div>
    </article>
  );
  return (
    <div>
      <div className="compare-main">
        {card(left, false)}
        <div className="token-bridge">{b.bridge || "Working together"}</div>
        {card(right, true)}
      </div>
      {payload && (
        <div className="soft-card payload">
          <div className="payload-copy">
            <span className="small-icon"><Icon name={payload.icon || "code"} /></span>
            <div><b>{payload.title}</b><p>{payload.text}</p></div>
          </div>
          <CodeView code={payload.code || ""} />
        </div>
      )}
    </div>
  );
}

function Chain({ b }: { b: any }) {
  const steps: any[] = b.steps || b.items || [];
  const panel = b.panel || {};
  const psteps: any[] = panel.steps || panel.items || [];
  return (
    <div>
      <div className="chain-main">
        <div className="request-chain">
          {steps.map((s: any, i: number) => (
            <article key={s.id || i} className={`soft-card chain-node ${i % 2 ? "violet" : ""}`}>
              <span className={`round-icon ${i % 2 ? "violet" : ""}`}><Icon name={s.icon} cls="icon icon--lg" /></span>
              <div><h3>{s.title}</h3><p>{s.text}</p>{s.pill && <span className="code-pill">{s.pillMethod ? <em>{s.pillMethod}</em> : null}{s.pill}</span>}</div>
            </article>
          ))}
        </div>
        {(panel.title || psteps.length > 0) && (
          <article className="soft-card violet refresh-panel">
            <h2>{panel.title}</h2>
            {panel.text && <p>{panel.text}</p>}
            <ol className="refresh-steps">
              {psteps.map((s: any, i: number) => (
                <li key={s.id || i} className="refresh-step">
                  <span className="count">{i + 1}</span>
                  <span className={`small-icon ${s.tone || (i === 0 ? "red" : i % 2 ? "violet" : "")}`}><Icon name={s.icon} /></span>
                  <div><h3>{s.title}</h3><p>{s.text}</p>{s.pill && <span className="code-pill">{s.pillMethod ? <em>{s.pillMethod}</em> : null}{s.pill}</span>}</div>
                </li>
              ))}
            </ol>
          </article>
        )}
      </div>
      {(b.features?.length > 0) && (
        <div className="practice">
          {b.featuresTitle && <h2>{b.featuresTitle}</h2>}
          <div className="feature-row">
            {b.features.map((f: any, i: number) => (
              <div key={i} className="feature">
                <span className={`small-icon ${i === 1 ? "violet" : ""}`}><Icon name={f.icon} /></span>
                <div><b>{f.title}</b><p>{f.text}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityGrid({ b }: { b: any }) {
  // b.items: painéis [{title, text, items:[{icon,tone,title,text,code}]}]
  const panels: any[] = b.items || b.panels || [];
  return (
    <div className="security-main">
      {panels.map((p: any, i: number) => (
        <article key={p.id || i} className={`soft-card security-panel ${i % 2 ? "violet" : ""}`}>
          <h2>{p.title}</h2>
          {p.text && <p>{p.text}</p>}
          {(p.items || []).map((s: any, j: number) => (
            <div key={j} className="security-item">
              <span className={`small-icon ${s.tone || ""}`}><Icon name={s.icon} /></span>
              <div><h3>{s.title}</h3><p>{s.text}</p></div>
              {s.code && <span className={`error-code ${s.codeTone || ""}`}>{s.code}</span>}
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}

function Takeaway({ b }: { b: any }) {
  if (b.variant === "outcome") {
    return (
      <div className="outcome">
        <span className="small-icon teal"><Icon name={b.icon || "check"} /></span>
        <b>{b.title}</b>
        <p>{b.text}</p>
      </div>
    );
  }
  return (
    <div className="soft-card takeaway">
      <span className="small-icon violet"><Icon name={b.icon || "light"} /></span>
      <div><b>{b.title}</b><p>{b.text}</p></div>
    </div>
  );
}

/* ---------- dispatcher ---------- */

export function Block({ b }: { b: any }) {
  switch (b.type) {
    case "hero": {
      const [pre, post] = String(b.title || "").split(b.highlight || "§");
      return (
        <header className="heading">
          {b.kicker && <span className="kicker-eyebrow">{b.kicker}</span>}
          <h1>{pre}<span className="highlight">{b.highlightText || post || ""}</span></h1>
          {b.text && <p>{b.text}</p>}
        </header>
      );
    }
    case "step-cards": return <StepCards b={b} />;
    case "split": return <Split b={b} />;
    case "compare": return <Compare b={b} />;
    case "chain": return <Chain b={b} />;
    case "security": return <SecurityGrid b={b} />;
    case "features": return <Features b={b} />;
    case "takeaway": return <Takeaway b={b} />;
    case "payload": return (
      <div className="soft-card payload">
        <div className="payload-copy">
          <span className="small-icon"><Icon name={b.icon || "code"} /></span>
          <div><b>{b.title}</b><p>{b.text}</p></div>
        </div>
        <CodeView code={b.code || ""} />
      </div>
    );
    case "heading": return <h2 className="section-heading">{b.title || b.text}</h2>;
    case "text": return <div className="prose">{b.title && <h3>{b.title}</h3>}<p>{b.text || b.body}</p></div>;
    case "markdown": return <div className="prose" dangerouslySetInnerHTML={{ __html: md(b.markdown || b.body || "") }} />;
    case "callout": return <div className={`callout ${b.intent || "info"}`}>{b.title && <strong>{b.title}</strong>}<div>{b.text || b.body}</div></div>;
    case "code": return <div><div className="meta"><span className="badge">{b.language || "code"}</span><CopyBtn text={b.code || ""} /></div><div className="prose"><CodeView code={b.code || ""} /></div></div>;
    case "metric": {
      const items = b.items || [{ label: b.title, value: b.text }];
      return <div className="kv">{items.map((m: any, i: number) => <div className="metric" key={i}><div className="v">{m.value}</div><div className="l">{m.label}</div></div>)}</div>;
    }
    case "table": return <div style={{ overflowX: "auto" }}><table className="t"><thead><tr>{(b.columns || []).map((c: string, i: number) => <th key={i}>{c}</th>)}</tr></thead><tbody>{(b.rows || []).map((r: any[], i: number) => <tr key={i}>{r.map((c, j) => <td key={j}>{String(c)}</td>)}</tr>)}</tbody></table></div>;
    case "list": return <ul className="prose">{(b.items || []).map((it: any, i: number) => <li key={i}>{typeof it === "string" ? it : it.label || JSON.stringify(it)}</li>)}</ul>;
    case "card": return <div className="card"><h3>{b.title}</h3><p>{b.text || b.body}</p>{(b.children || []).map((c: any) => <Block key={c.id} b={c} />)}</div>;
    case "grid": return <div className="grid2">{(b.children || b.items || []).map((c: any, i: number) => typeof c === "string" ? <div className="card" key={i}><p>{c}</p></div> : <Block key={c.id || i} b={c.type ? c : { id: `g${i}`, type: "card", title: c.title, text: c.text }} />)}</div>;
    case "section": return <section style={{ margin: "26px 0" }}>{b.title && <h2>{b.title}</h2>}{(b.children || []).map((c: any) => <Block key={c.id} b={c} />)}{b.text && <p className="prose">{b.text}</p>}</section>;
    case "tabs": return <Tabs items={b.items || b.children || []} />;
    case "accordion": return <div>{(b.items || b.children || []).map((it: any, i: number) => <details className="card" key={i} style={{ margin: "8px 0" }}><summary style={{ cursor: "pointer", fontWeight: 700 }}>{it.title || it.label}</summary><div style={{ marginTop: 8 }}>{it.text || it.body}</div></details>)}</div>;
    case "steps": return <Chain b={{ steps: (b.items || []).map((s: any) => ({ title: s.title || s.label, text: s.text || s.body, icon: s.icon || "check" })) }} />;
    case "timeline": return <div className="request-chain">{(b.items || []).map((s: any, i: number) => <div className="soft-card chain-node" key={i}><div><div className="meta">{s.date || s.time || ""}</div><strong>{s.title}</strong><div style={{ color: "var(--muted)" }}>{s.text}</div></div></div>)}</div>;
    case "comparison": return <Compare b={{ items: (b.items || []).map((c: any) => ({ title: c.title, text: c.text, icon: c.icon || "flow", rows: (c.pros || c.points || []).map((p: string) => ({ label: "•", text: p })) })), bridge: b.bridge || "vs" }} />;
    case "tree": return <Tree nodes={b.items || b.nodes || []} />;
    case "diagram": return <Diagram nodes={b.nodes} edges={b.edges} direction={b.direction} />;
    case "chart": return <div className="card"><h3>{b.title}</h3><Chart series={b.series || b.items} kind={b.variant} /></div>;
    case "image": return <figure><img src={safeSrc(b.src)} alt={esc(b.alt || b.title || "imagem")} style={{ maxWidth: "100%", borderRadius: 12 }} loading="lazy" /><figcaption className="meta">{b.title}</figcaption></figure>;
    default: return <div className="card"><h3>{b.title || b.type}</h3><p>{b.text || b.body || ""}</p></div>;
  }
}
function safeSrc(s: string): string {
  if (!s || /^(javascript|data:text\/html)/i.test(s)) return "";
  if (/^https?:|^data:image\//i.test(s)) return s;
  return "";
}
function Tabs({ items }: { items: any[] }) {
  const [i, setI] = useState(0);
  return <div><div role="tablist" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{items.map((t, k) => <button key={k} role="tab" aria-selected={k === i} className={`btn ${k === i ? "primary" : ""}`} onClick={() => setI(k)}>{t.title || t.label || `Aba ${k + 1}`}</button>)}</div><div style={{ marginTop: 12 }}>{items[i] && (items[i].type ? <Block b={items[i]} /> : <p className="prose">{items[i].text || items[i].body}</p>)}</div></div>;
}
function Tree({ nodes }: { nodes: any[] }) {
  return <ul className="prose">{nodes.map((n: any, i: number) => <li key={i}><code>{typeof n === "string" ? n : n.label || n.id}</code>{n.children && <Tree nodes={n.children} />}</li>)}</ul>;
}

export function SecurityPanels({ b }: { b: any }) {
  return <SecurityGrid b={b} />;
}
