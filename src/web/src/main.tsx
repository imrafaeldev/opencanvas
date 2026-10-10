import React from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import { Shell, Home, Project, CanvasPage } from "./pages";

function Router() {
  const p = window.location.pathname;
  let m = p.match(/^\/p\/([^/]+)\/canvas\/(.+)$/);
  // Artefato individual: chrome próprio, sem shell de dashboard.
  if (m) return <CanvasPage projectId={decodeURIComponent(m[1])} slug={decodeURIComponent(m[2])} />;
  m = p.match(/^\/p\/([^/]+)\/?$/);
  if (m) return <Shell><Project id={decodeURIComponent(m[1])} /></Shell>;
  return <Shell><Home /></Shell>;
}

class Boundary extends React.Component<any, { err: any }> {
  state = { err: null };
  static getDerivedStateFromError(err: any) { return { err }; }
  render() {
    if (this.state.err) return <Shell><div className="empty"><h2>Algo falhou ao renderizar</h2><p>A navegação foi preservada. Tente outro canvas.</p></div></Shell>;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(<Boundary><Router /></Boundary>);
