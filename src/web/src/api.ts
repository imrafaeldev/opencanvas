export async function api<T>(p: string): Promise<T> {
  const r = await fetch(p);
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${p}`);
  return r.json() as Promise<T>;
}
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// Markdown mínimo seguro: headings, bold, code, listas, links http(s) — sem HTML livre.
export function md(src: string): string {
  let h = esc(src);
  h = h.replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, `<a href="$2" target="_blank" rel="noreferrer">$1</a>`);
  h = h.replace(/^- (.*)$/gm, "<li>$1</li>");
  h = h.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  h = h.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br/>");
  if (!h.startsWith("<h") && !h.startsWith("<ul") && !h.startsWith("<p")) h = `<p>${h}</p>`;
  return h.replace(/<script/gi, "&lt;script").replace(/javascript:/gi, "");
}
