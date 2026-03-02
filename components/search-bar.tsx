"use client";

import { useCallback, useState } from "react";
import type { GraphNode } from "@/types/graph";

export interface SearchBarProps {
  nodes: GraphNode[];
  onSearch: (node: GraphNode | null) => void;
  graphRef: React.MutableRefObject<{
    zoomToFit?: (
      ms?: number,
      padding?: number,
      nodeFilter?: (n: { id?: string }) => boolean,
    ) => void;
  } | null>;
  placeholder?: string;
}

export function SearchBar({
  nodes,
  onSearch,
  graphRef,
  placeholder = "Search for a word...",
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GraphNode[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value.toLowerCase().trim();
      setQuery(e.target.value);
      if (q.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      const matches = nodes
        .filter((n) => n.id.toLowerCase().startsWith(q))
        .slice(0, 8);
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
    },
    [nodes],
  );

  const handleSelect = useCallback(
    (node: GraphNode) => {
      setQuery(node.id);
      setShowSuggestions(false);
      onSearch(node);
      graphRef.current?.zoomToFit?.(500, 80, (n) => n.id === node.id);
    },
    [onSearch, graphRef],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && suggestions.length > 0) {
        handleSelect(suggestions[0]);
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
      }
    },
    [suggestions, handleSelect],
  );

  return (
    <div className="relative w-full max-w-md">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-300 bg-white/95 px-4 py-2.5 text-zinc-900 shadow-lg backdrop-blur-sm placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-900/95 dark:text-zinc-100 dark:placeholder:text-zinc-400"
      />
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          {suggestions.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => handleSelect(node)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <span className="font-medium">{node.id}</span>
                <span className="text-xs text-zinc-500">({node.pos})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
