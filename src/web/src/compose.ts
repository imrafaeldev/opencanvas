import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Layout Engine — composição por conteúdo.
//
// Problema que resolve: grids com contagem fixa de colunas (repeat(4),
// repeat(5), repeat(3)) deixam a última linha com 1 item órfão e um vazio
// enorme ao lado (ex.: 5 passos → 4 + 1). A escolha passa a ser derivada de
// (quantidade de itens, largura disponível, largura mínima de card), nunca fixa.
//
// Saída: um template `grid-template-columns` cujas linhas ficam equilibradas
// (sem órfão) e, quando sobra resto, os itens da última linha crescem juntos
// para ocupar a linha inteira em vez de deixarem um buraco.
// ---------------------------------------------------------------------------

export type Composition = "auto" | "row" | "stack" | "focus" | "split" | "grid" | "asymmetric";
export type Importance = "primary" | "secondary" | "supporting";
export type Alignment = "center" | "start";

export interface ComposePlan {
  columns: number;
  minWidth: number;
  /** itens da última linha: number | "full" */
  rowFill: number | "full";
  density: "comfortable" | "compact" | "spacious";
}

const GAP_PX = 24;

/** Nº máximo de colunas que cabem numa largura disponível mantendo card legível. */
function maxColumnsFor(available: number, minCard: number): number {
  if (!available || !minCard) return 1;
  return Math.max(1, Math.min(6, Math.floor((available + GAP_PX) / (minCard + GAP_PX))));
}

/**
 * Escolhe a contagem de colunas que melhor distribui `count` itens.
 *
 * Custo (menor é melhor):
 *   resto 0            → linhas perfeitas
 *   resto 1            → órfão (evitado a todo custo)
 *   resto >= 2         → penalidade cresce com o buraco deixado
 *   desempate          → prefere colunas maiores (cards mais largos, menos linhas)
 */
export function planComposition(
  count: number,
  available: number,
  opts: { minCard?: number; maxColumns?: number; density?: ComposePlan["density"] } = {},
): ComposePlan {
  const density = opts.density || "comfortable";
  const minCard = opts.minCard ?? (density === "compact" ? 220 : 280);
  if (count <= 1) return { columns: 1, minWidth: minCard, rowFill: count === 0 ? "full" : "full", density };

  const widthCap = maxColumnsFor(available, minCard);
  const maxColumns = Math.max(1, Math.min(opts.maxColumns ?? 6, widthCap, count));

  let best = { cols: Math.min(2, maxColumns), cost: Infinity };
  for (let cols = 2; cols <= maxColumns; cols++) {
    const rows = Math.ceil(count / cols);
    const rem = count % cols;
    let cost: number;
    if (rem === 0) cost = 0;
    else if (rem === 1) cost = 1000; // órfão
    else cost = (cols - rem) * 10; // buraco na última linha
    // desempate suave: menos colunas → cards mais largos
    cost += (maxColumns - cols) * 0.05;
    if (cost < best.cost) best = { cols, cost };
  }

  const columns = best.cols;
  const rem = count % columns;
  const rowFill: number | "full" = rem === 0 ? columns : rem;
  return { columns, minWidth: minCard, rowFill, density };
}

/**
 * Estilo da linha composta.
 *
 * Flexbox (não grid) porque resolve o resto de linha de forma contínua:
 * com `flex: 1 1 <basis>` exatamente `columns` itens cabem por linha e os itens
 * da última linha CRESCEM para ocupar a largura inteira — sem buraco à direita
 * e sem item órfão, para qualquer quantidade de itens.
 */
export function rowStyle(plan: ComposePlan): React.CSSProperties {
  return {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--gap)",
  };
}

/** Base de largura que faz exatamente `plan.columns` itens caberem por linha. */
export function itemStyle(plan: ComposePlan): React.CSSProperties {
  const cols = Math.max(1, plan.columns);
  return {
    flex: `1 1 calc((100% - ${cols - 1} * var(--gap)) / ${cols})`,
    minWidth: 0,
  };
}

/**
 * Hook: mede a largura disponível e devolve o plano de composição.
 * Respeita `composition` explícita da DSL; "auto" usa o motor.
 */
export function useComposition(
  count: number,
  opts: {
    composition?: Composition;
    minCard?: number;
    maxColumns?: number;
    density?: ComposePlan["density"];
    align?: Alignment;
  } = {},
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const composition = opts.composition || "auto";
  const plan = planComposition(count, available, {
    minCard: opts.minCard,
    maxColumns: opts.maxColumns,
    density: opts.density,
  });

  // Composições explícitas: o autor do DSL tem prioridade sobre o motor —
  // mas nunca acima da largura real (uma "linha" que não cabe vira pilha).
  if (composition === "stack") plan.columns = 1;
  if (composition === "grid") plan.columns = Math.min(plan.columns, 4);
  if (composition === "row") plan.columns = Math.min(count, maxColumnsFor(available, plan.minWidth));
  if (composition === "focus") plan.columns = count <= 3 ? count : 3;
  if (composition === "split") plan.columns = count <= 4 ? 2 : Math.min(3, Math.ceil(count / Math.ceil(count / 2)));
  if (composition === "asymmetric") plan.columns = Math.min(2, maxColumnsFor(available, plan.minWidth));

  // Rede de segurança: nenhum item pode descer abaixo de uma largura legível,
  // senão o texto fica espremido (o sintoma de "4 + 1" invertido).
  const minSafe = 150;
  while (plan.columns > 1 && (available - (plan.columns - 1) * GAP_PX) / plan.columns < minSafe) {
    plan.columns -= 1;
  }

  return { ref, plan, available, style: rowStyle(plan), align: opts.align || "center" };
}

/**
 * Estilo por item. Sem CSS de span: o crescimento é uniforme e a última linha
 * sempre preenche a largura. Composição "stack" força largura total.
 * "asymmetric": o primeiro item ancora a linha com ~60% (destaque editorial),
 * os demais dividem o restante — sem depender de contagem fixa.
 */
export function useRowItems(count: number, plan: ComposePlan, composition: Composition) {
  if (composition === "stack") return (_index: number): React.CSSProperties => ({ flex: "1 1 100%", minWidth: 0 });
  if (composition === "asymmetric" && count >= 2 && plan.columns >= 2) {
    return (index: number): React.CSSProperties =>
      index === 0
        ? { flex: "1.6 1 calc(58% - var(--gap))", minWidth: 0 }
        : itemStyle(plan);
  }
  const base = itemStyle(plan);
  return (_index: number): React.CSSProperties => base;
}

/** Densidade informacional: mais itens → respiro menor, sem comprimir texto. */
export function useDensity(count: number, requested?: ComposePlan["density"]) {
  if (requested) return requested;
  if (count > 8) return "compact";
  if (count > 4) return "comfortable";
  return "spacious";
}