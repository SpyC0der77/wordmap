"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { GraphNode, GraphLink } from "@/types/graph";

const NODE_REL_SIZE = 4;

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});
const POS_COLORS: Record<string, string> = {
  noun: "#3b82f6",
  verb: "#22c55e",
  adjective: "#f59e0b",
  adverb: "#8b5cf6",
  other: "#6b7280",
};

export interface WordGraphProps {
  graphData: { nodes: GraphNode[]; links: GraphLink[] };
  onNodeSelect: (node: GraphNode | null) => void;
  graphRef: React.MutableRefObject<{
    centerAt?: (x?: number, y?: number, ms?: number) => void;
    zoom?: (scale?: number, ms?: number) => void;
    zoomToFit?: (
      ms?: number,
      padding?: number,
      nodeFilter?: (n: { id?: string }) => boolean,
    ) => void;
  } | null>;
}

export function WordGraph({
  graphData,
  onNodeSelect,
  graphRef,
}: WordGraphProps) {
  const fgRef = useRef<{
    d3Force: (name: string) => {
      distance: (v: number | ((l: GraphLink) => number)) => void;
      strength: (v: number | ((l: GraphLink) => number)) => void;
    };
    d3ReheatSimulation?: () => void;
    centerAt?: (x?: number, y?: number, ms?: number) => void;
    zoom?: (scale?: number, ms?: number) => void;
    zoomToFit?: (
      ms?: number,
      padding?: number,
      nodeFilter?: (n: { id?: string }) => boolean,
    ) => void;
  } | null>(null);

  useEffect(() => {
    graphRef.current = fgRef.current;
  }, [graphRef]);

  const fixedGraphData = useMemo(() => {
    const linkCountByNode = new Map<string, number>();
    for (const link of graphData.links) {
      const src = String(link.source);
      const tgt = String(link.target);
      linkCountByNode.set(src, (linkCountByNode.get(src) ?? 0) + 1);
      linkCountByNode.set(tgt, (linkCountByNode.get(tgt) ?? 0) + 1);
    }
    const hasPositions = graphData.nodes.some(
      (n) => typeof n.x === "number" && typeof n.y === "number",
    );
    if (!hasPositions) {
      return {
        nodes: graphData.nodes.map((n) => ({
          ...n,
          val: 3 + Math.min((linkCountByNode.get(n.id) ?? 0) * 0.5, 8),
        })),
        links: graphData.links,
      };
    }
    return {
      nodes: graphData.nodes.map((n) => ({
        ...n,
        fx: n.x,
        fy: n.y,
        val: 3 + Math.min((linkCountByNode.get(n.id) ?? 0) * 0.5, 8),
        __fixedX: n.x,
        __fixedY: n.y,
      })),
      links: graphData.links,
    };
  }, [graphData]);

  const handleNodeClick = useCallback(
    (node: {
      id?: string | number;
      pos?: string;
      definitions?: string[];
      [k: string]: unknown;
    }) => {
      onNodeSelect(node as GraphNode);
    },
    [onNodeSelect],
  );

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  const getNodeColor = useCallback((node: Record<string, unknown>) => {
    return POS_COLORS[String(node.pos ?? "other")] ?? POS_COLORS.other;
  }, []);

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const val = (node.val as number) ?? 4;
      const r = Math.sqrt(Math.max(0, val || 1)) * NODE_REL_SIZE;
      const t = ctx.getTransform();
      const sx = t.a * node.x + t.c * node.y + t.e;
      const sy = t.b * node.x + t.d * node.y + t.f;
      if (
        sx < -r ||
        sx > dimensions.width + r ||
        sy < -r ||
        sy > dimensions.height + r
      )
        return;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = getNodeColor(node);
      ctx.fill();
    },
    [dimensions, getNodeColor],
  );

  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const src = link.source;
      const tgt = link.target;
      const t = ctx.getTransform();
      const inView = (x: number, y: number) => {
        const sx = t.a * x + t.c * y + t.e;
        const sy = t.b * x + t.d * y + t.f;
        const pad = 20;
        return (
          sx >= -pad &&
          sx <= dimensions.width + pad &&
          sy >= -pad &&
          sy <= dimensions.height + pad
        );
      };
      if (!inView(src.x, src.y) && !inView(tgt.x, tgt.y)) return;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = "rgba(100,100,100,0.4)";
      ctx.lineWidth = 0.5 / globalScale;
      ctx.stroke();
    },
    [dimensions],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const { width, height } = el.getBoundingClientRect();
      setDimensions({ width, height });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ForceGraph2D
        width={dimensions.width}
        height={dimensions.height}
        ref={fgRef as any}
        graphData={fixedGraphData}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeLabel={(node: any) => String(node?.id ?? "")}
        nodeColor={(node: any) => getNodeColor(node)}
        nodeVal={(node: any) => (node.val as number) ?? 4}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode="replace"
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode="replace"
        linkWidth={0.5}
        linkColor={() => "rgba(100,100,100,0.4)"}
        onNodeClick={(node: any) => handleNodeClick(node)}
        onBackgroundClick={() => onNodeSelect(null)}
        backgroundColor="transparent"
        minZoom={0.1}
        maxZoom={4}
        cooldownTicks={0}
        warmupTicks={0}
        autoPauseRedraw={true}
        onNodeDragEnd={(node: any) => {
          const fixedX = (node as { __fixedX?: number }).__fixedX;
          const fixedY = (node as { __fixedY?: number }).__fixedY;
          if (typeof fixedX === "number" && typeof fixedY === "number") {
            node.fx = fixedX;
            node.fy = fixedY;
            node.x = fixedX;
            node.y = fixedY;
          }
        }}
      />
    </div>
  );
}
