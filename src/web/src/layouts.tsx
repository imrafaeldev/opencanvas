import React from "react";
import { Block } from "./components";

// Layout engine: seções editoriais progressivas. Cada seção = um slide.
// Sem seções (legado): blocos renderizam como documento único.
export function Layout({ dsl }: { dsl: any }) {
  const sections: any[] = Array.isArray(dsl?.sections) ? dsl.sections : [];
  if (!sections.length) return <LegacyDoc dsl={dsl} />;
  return (
    <>
      {sections.map((s: any, i: number) => (
        <section key={s.id || i} className="slide" id={s.id} aria-labelledby={`title-${s.id}`}>
          <div className="slide-grid-bg" aria-hidden="true" />
          <main className="canvas">
            <div className="brand"><span className="brand-mark" aria-hidden="true" />OpenCanvas</div>
            {(s.kicker || s.title || s.lead) && (
              <header className="heading">
                {s.kicker && <span className="kicker-eyebrow">{s.kicker}</span>}
                {s.title && <h1 id={`title-${s.id}`}>{renderTitle(s.title, s.highlight)}</h1>}
                {s.lead && <p>{s.lead}</p>}
              </header>
            )}
            <div className="reveal" style={{ animationDelay: `${Math.min(i, 4) * 40}ms` }}>
              {(s.blocks || []).map((b: any) => <Block key={b.id} b={b} />)}
            </div>
          </main>
        </section>
      ))}
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
  // Sem shell: mesmo documento único vira artefato com 1 slide
  return (
    <section className="slide">
      <div className="slide-grid-bg" aria-hidden="true" />
      <main className="canvas">
        <div className="brand"><span className="brand-mark" aria-hidden="true" />OpenCanvas</div>
        <header className="heading">
          <h1>{dsl?.title}</h1>
          {dsl?.description && <p>{dsl.description}</p>}
        </header>
        <div className="doc-legacy">
          {blocks.map((b: any) => <Block key={b.id} b={b} />)}
        </div>
      </main>
    </section>
  );
}
