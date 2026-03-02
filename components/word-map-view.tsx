"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WordGraph } from "./word-graph";
import { SearchBar } from "./search-bar";
import { NodeDetail } from "./node-detail";
import type { GraphData, GraphNode } from "@/types/graph";

export function WordMapView() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const graphRef = useRef<{
    centerAt?: (x?: number, y?: number, ms?: number) => void;
    zoom?: (scale?: number, ms?: number) => void;
    zoomToFit?: (
      ms?: number,
      padding?: number,
      nodeFilter?: (n: { id?: string }) => boolean,
    ) => void;
  } | null>(null);

  useEffect(() => {
    fetch("/data/graph.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load graph data");
        return res.json();
      })
      .then((data: GraphData) => {
        setGraphData(data);
        setError(null);
      })
      .catch((err) => setError(err.message ?? "Failed to load graph"))
      .finally(() => setIsLoading(false));
  }, []);

  const handleNodeSelect = useCallback((node: GraphNode | null) => {
    setSelectedNode(node);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-500" />
          <p className="text-zinc-600 dark:text-zinc-400">
            Loading word map...
          </p>
        </div>
      </div>
    );
  }

  if (error || !graphData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/50">
          <p className="text-red-700 dark:text-red-400">
            {error ??
              "Graph data not found. Run `bun run build-graph` to generate it."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <div className="absolute inset-0">
        <WordGraph
          graphData={graphData}
          onNodeSelect={handleNodeSelect}
          graphRef={graphRef}
        />
      </div>
      <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 flex-col items-center gap-3">
        <SearchBar
          nodes={graphData.nodes}
          onSearch={handleNodeSelect}
          graphRef={graphRef}
        />
        <div className="flex flex-wrap justify-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#3b82f6]" /> noun
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> verb
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> adjective
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" /> adverb
          </span>
        </div>
      </div>
      {selectedNode && (
        <NodeDetail
          node={selectedNode}
          links={graphData.links}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
