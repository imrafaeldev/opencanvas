import React from "react";
import { Block } from "./components";

// Layout engine: seções editoriais progressivas. Cada seção é uma unidade
// narrativa — altura mínima da viewport, crescimento natural, sem corte.
// Hierarquia: h1 apenas na capa, h2 no título da seção, h3/h4 nos componentes.
export function Layout({ dsl }: { dsl: any }) {
  const sections: any[] = Array.isArray(dsl?.sections) ? dsl.sections : [];
  if (!sections.length) return <LegacyDoc dsl={dsl} />;
  return (
    <>
      {sections.map((s: any, i: number) => {
        const align = s.alignment === "start" ? "start" : "center";
        const blocks: any[] = s.blocks || [];
        // Se a seção abre com um hero, ele É o título: evita dois cabeçalhos
        // empilhados (h1 + h2) e mantém uma mensagem central por seção.
        const hero = blocks[0]?.type === "hero" ? blocks[0] : null;
        const showKickerTitle = !hero && (s.kicker || s.title);
        const showLead = !!s.lead && !hero?.text;
        return (
          <section key={s.id || i} className="slide" id={s.id} aria-labelledby={`title-${s.id}`}>
            <div className="slide-decor" aria-hidden="true" />
            <main className="canvas">
              {/* identidade uma única vez, discreta; não em cada seção */}
              {i === 0 && (
                <div className="brand-trusted"><span className="brand-mark" aria-hidden="true" />OpenCanvas</div>
              )}
              {(showKickerTitle || showLead) && (
                <header className={`slide-head ${align}`}>
                  {s.kicker && <span className="kicker-eyebrow">{s.kicker}</span>}
                  {s.title && <h2 id={`title-${s.id}`} className="section-title">{renderTitle(s.title, s.highlight)}</h2>}
                  {showLead && <p className="lead">{s.lead}</p>}
                </header>
              )}
              <div className="reveal" style={{ animationDelay: `${Math.min(i, 4) * 40}ms` }}>
                {blocks.map((b: any) => (
                  <Block key={b.id} b={b} cover={i === 0 && b.type === "hero"} />
                ))}
              </div>
            </main>
          </section>
        );
      })}
    </>
  );
}

function renderTitle(title: string, highlight?: string) {
  if (!highlight || !title.includes(highlight)) return title;
  const [pre, ...rest] = title.split(highlight);
  return (<>{pre}<span className="highlight">{highlight}</span>{rest.join(highlight)}</>);
}

function LegacyDoc({ dsl }: { dsl: any }) {
  const blocks = dsl?.blocks || [];
  return (
    <section className="slide">
      <div className="slide-decor" aria-hidden="true" />
      <main className="canvas">
        <div className="brand-trusted"><span className="brand-mark" aria-hidden="true" />OpenCanvas</div>
        <header className="slide-head center">
          <h1 className="display center">{dsl?.title}</h1>
          {dsl?.description && <p className="lead">{dsl.description}</p>}
        </header>
        <div className="doc-legacy">
          {blocks.map((b: any) => <Block key={b.id} b={b} />)}
        </div>
      </main>
    </section>
  );
}